const { randomUUID } = require("node:crypto");
const { mkdirSync } = require("node:fs");
const { dirname } = require("node:path");
const { spawnSync } = require("node:child_process");

const SHORT_TERM_TTL_MS = 24 * 60 * 60 * 1000;
const LONG_TERM_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_RECENT_MESSAGES = 40;
const MEMORY_KEYS = new Set(["riding_experience", "primary_usage", "new_used_preference", "preferred_vehicle_type", "excluded_vehicle_type", "budget_range_cny"]);
const DEVICE_ID_PATTERN = /^device_[a-zA-Z0-9_-]{16,80}$/;

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function createMemoryStore(databasePath, options = {}) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const now = options.now || (() => new Date());

  function execute(sql, json = false) {
    const result = spawnSync("sqlite3", json ? ["-json", databasePath] : [databasePath], { input: sql, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`memory_sqlite_error:${result.stderr.trim()}`);
    return json && result.stdout.trim() ? JSON.parse(result.stdout) : [];
  }

  execute(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS memory_devices (
      device_id TEXT PRIMARY KEY,
      memory_enabled INTEGER NOT NULL DEFAULT 1 CHECK(memory_enabled IN (0,1)),
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS short_term_messages (
      message_id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES memory_devices(device_id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS short_term_summaries (
      device_id TEXT NOT NULL REFERENCES memory_devices(device_id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY(device_id,session_id)
    );
    CREATE TABLE IF NOT EXISTS long_term_memories (
      memory_id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES memory_devices(device_id) ON DELETE CASCADE,
      memory_key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      confidence REAL NOT NULL CHECK(confidence>=0 AND confidence<=1),
      evidence_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      UNIQUE(device_id,memory_key)
    );
    CREATE TABLE IF NOT EXISTS memory_observations (
      observation_id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES memory_devices(device_id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      memory_key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      explicit_long_term INTEGER NOT NULL DEFAULT 0 CHECK(explicit_long_term IN (0,1)),
      observed_at TEXT NOT NULL,
      UNIQUE(device_id,session_id,memory_key,value_json)
    );
    CREATE INDEX IF NOT EXISTS idx_short_memory_device_session ON short_term_messages(device_id,session_id,created_at);
    CREATE INDEX IF NOT EXISTS idx_short_memory_expiry ON short_term_messages(expires_at);
    CREATE INDEX IF NOT EXISTS idx_long_memory_expiry ON long_term_memories(expires_at);
  `);

  function cleanDeviceId(value) {
    if (typeof value !== "string" || !DEVICE_ID_PATTERN.test(value)) throw Object.assign(new Error("invalid_device_id"), { statusCode: 400 });
    return value;
  }

  function ensureDevice(deviceId) {
    cleanDeviceId(deviceId);
    const timestamp = now().toISOString();
    execute(`INSERT INTO memory_devices(device_id,memory_enabled,created_at,last_seen_at) VALUES(${sqlValue(deviceId)},1,${sqlValue(timestamp)},${sqlValue(timestamp)}) ON CONFLICT(device_id) DO UPDATE SET last_seen_at=excluded.last_seen_at;`);
    return getSettings(deviceId);
  }

  function getSettings(deviceId) {
    cleanDeviceId(deviceId);
    const rows = execute(`SELECT memory_enabled,created_at,last_seen_at FROM memory_devices WHERE device_id=${sqlValue(deviceId)};`, true);
    return rows.length ? { memory_enabled: rows[0].memory_enabled === 1, created_at: rows[0].created_at, last_seen_at: rows[0].last_seen_at } : null;
  }

  function setEnabled(deviceId, enabled) {
    ensureDevice(deviceId);
    execute(`UPDATE memory_devices SET memory_enabled=${enabled ? 1 : 0},last_seen_at=${sqlValue(now().toISOString())} WHERE device_id=${sqlValue(deviceId)};`);
    return getSettings(deviceId);
  }

  function cleanupExpired() {
    const timestamp = now().toISOString();
    execute(`BEGIN IMMEDIATE; DELETE FROM short_term_messages WHERE expires_at<=${sqlValue(timestamp)}; DELETE FROM short_term_summaries WHERE expires_at<=${sqlValue(timestamp)}; DELETE FROM long_term_memories WHERE expires_at<=${sqlValue(timestamp)}; COMMIT;`);
  }

  function redactSensitive(text) {
    return String(text)
      .replace(/\b1[3-9]\d{9}\b/g, "[手机号已隐藏]")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[邮箱已隐藏]")
      .replace(/\b\d{17}[\dXx]\b/g, "[证件号已隐藏]")
      .replace(/[\u4e00-\u9fa5][A-Z][A-Z0-9]{5}\b/g, "[车牌已隐藏]");
  }

  function updateRollingSummary(deviceId, sessionId) {
    const overflow = execute(`SELECT role,content FROM (SELECT rowid,role,content FROM short_term_messages WHERE device_id=${sqlValue(deviceId)} AND session_id=${sqlValue(sessionId)} ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET ${MAX_RECENT_MESSAGES}) ORDER BY rowid;`, true);
    if (!overflow.length) return;
    const existing = execute(`SELECT summary FROM short_term_summaries WHERE device_id=${sqlValue(deviceId)} AND session_id=${sqlValue(sessionId)};`, true)[0]?.summary || "";
    const additions = overflow.map((item) => `${item.role === "user" ? "用户" : "助手"}：${redactSensitive(item.content).slice(0, 240)}`).join("\n");
    const summary = [existing, additions].filter(Boolean).join("\n").slice(-2000);
    const timestamp = now();
    const expiresAt = new Date(timestamp.getTime() + SHORT_TERM_TTL_MS).toISOString();
    execute(`INSERT INTO short_term_summaries(device_id,session_id,summary,updated_at,expires_at) VALUES(${sqlValue(deviceId)},${sqlValue(sessionId)},${sqlValue(summary)},${sqlValue(timestamp.toISOString())},${sqlValue(expiresAt)}) ON CONFLICT(device_id,session_id) DO UPDATE SET summary=excluded.summary,updated_at=excluded.updated_at,expires_at=excluded.expires_at;`);
  }

  function appendMessage(deviceId, sessionId, role, content) {
    const settings = ensureDevice(deviceId);
    if (!settings.memory_enabled) return null;
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(sessionId)) throw Object.assign(new Error("invalid_session_id"), { statusCode: 400 });
    if (!new Set(["user", "assistant"]).has(role)) throw Object.assign(new Error("invalid_message_role"), { statusCode: 400 });
    const text = typeof content === "string" ? content.trim().slice(0, 4000) : "";
    if (!text) return null;
    cleanupExpired();
    const created = now();
    const message = { message_id: randomUUID(), device_id: deviceId, session_id: sessionId, role, content: text, created_at: created.toISOString(), expires_at: new Date(created.getTime() + SHORT_TERM_TTL_MS).toISOString() };
    execute(`INSERT INTO short_term_messages(message_id,device_id,session_id,role,content,created_at,expires_at) VALUES(${sqlValue(message.message_id)},${sqlValue(deviceId)},${sqlValue(sessionId)},${sqlValue(role)},${sqlValue(text)},${sqlValue(message.created_at)},${sqlValue(message.expires_at)});`);
    updateRollingSummary(deviceId, sessionId);
    execute(`DELETE FROM short_term_messages WHERE message_id IN (SELECT message_id FROM short_term_messages WHERE device_id=${sqlValue(deviceId)} AND session_id=${sqlValue(sessionId)} ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET ${MAX_RECENT_MESSAGES});`);
    return message;
  }

  function getRecentMessages(deviceId, sessionId, limit = MAX_RECENT_MESSAGES) {
    cleanDeviceId(deviceId);
    cleanupExpired();
    const safeLimit = Math.min(MAX_RECENT_MESSAGES, Math.max(1, Number(limit) || MAX_RECENT_MESSAGES));
    return execute(`SELECT message_id,role,content,created_at,expires_at FROM (SELECT rowid,* FROM short_term_messages WHERE device_id=${sqlValue(deviceId)} AND session_id=${sqlValue(sessionId)} ORDER BY created_at DESC,rowid DESC LIMIT ${safeLimit}) ORDER BY created_at,rowid;`, true);
  }

  function getRollingSummary(deviceId, sessionId) {
    cleanDeviceId(deviceId);
    cleanupExpired();
    return execute(`SELECT summary,updated_at,expires_at FROM short_term_summaries WHERE device_id=${sqlValue(deviceId)} AND session_id=${sqlValue(sessionId)};`, true)[0] || null;
  }

  function validateMemory(key, value) {
    if (!MEMORY_KEYS.has(key)) throw Object.assign(new Error("memory_key_not_allowed"), { statusCode: 400 });
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) throw Object.assign(new Error("memory_value_invalid"), { statusCode: 400 });
  }

  function upsertMemory(deviceId, key, value, sourceKind = "explicit", confidence = 1) {
    const settings = ensureDevice(deviceId);
    if (!settings.memory_enabled) throw Object.assign(new Error("memory_disabled"), { statusCode: 409 });
    validateMemory(key, value);
    const timestamp = now();
    const expiresAt = new Date(timestamp.getTime() + LONG_TERM_TTL_MS).toISOString();
    const serialized = JSON.stringify(value);
    execute(`INSERT INTO long_term_memories(memory_id,device_id,memory_key,value_json,source_kind,confidence,evidence_count,created_at,updated_at,last_used_at,expires_at) VALUES(${sqlValue(randomUUID())},${sqlValue(deviceId)},${sqlValue(key)},${sqlValue(serialized)},${sqlValue(sourceKind)},${Number(confidence)},1,${sqlValue(timestamp.toISOString())},${sqlValue(timestamp.toISOString())},${sqlValue(timestamp.toISOString())},${sqlValue(expiresAt)}) ON CONFLICT(device_id,memory_key) DO UPDATE SET value_json=excluded.value_json,source_kind=excluded.source_kind,confidence=excluded.confidence,evidence_count=long_term_memories.evidence_count+1,updated_at=excluded.updated_at,last_used_at=excluded.last_used_at,expires_at=excluded.expires_at;`);
    return listMemories(deviceId).find((item) => item.key === key);
  }

  function observePreference(deviceId, sessionId, key, value, explicitLongTerm = false) {
    const settings = ensureDevice(deviceId);
    if (!settings.memory_enabled) return { promoted: false, reason: "memory_disabled" };
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(sessionId)) throw Object.assign(new Error("invalid_session_id"), { statusCode: 400 });
    validateMemory(key, value);
    const serialized = JSON.stringify(value);
    const timestamp = now().toISOString();
    execute(`INSERT OR IGNORE INTO memory_observations(observation_id,device_id,session_id,memory_key,value_json,explicit_long_term,observed_at) VALUES(${sqlValue(randomUUID())},${sqlValue(deviceId)},${sqlValue(sessionId)},${sqlValue(key)},${sqlValue(serialized)},${explicitLongTerm ? 1 : 0},${sqlValue(timestamp)});`);
    const existing = listMemories(deviceId).find((item) => item.key === key) || null;
    if (explicitLongTerm) {
      return { promoted: true, memory: upsertMemory(deviceId, key, value, "explicit_long_term", 1) };
    }
    if (existing?.source_kind === "explicit_long_term") {
      return { promoted: false, reason: "explicit_memory_protected", memory: existing };
    }
    const rows = execute(`SELECT COUNT(DISTINCT session_id) AS session_count FROM memory_observations WHERE device_id=${sqlValue(deviceId)} AND memory_key=${sqlValue(key)} AND value_json=${sqlValue(serialized)};`, true);
    const sessionCount = Number(rows[0]?.session_count || 0);
    if (sessionCount < 2) return { promoted: false, reason: "more_sessions_required", session_count: sessionCount };
    return { promoted: true, memory: upsertMemory(deviceId, key, value, "repeated_sessions", 0.9), session_count: sessionCount };
  }

  function listMemories(deviceId, touch = false) {
    cleanDeviceId(deviceId);
    cleanupExpired();
    const rows = execute(`SELECT memory_id,memory_key,value_json,source_kind,confidence,evidence_count,created_at,updated_at,last_used_at,expires_at FROM long_term_memories WHERE device_id=${sqlValue(deviceId)} ORDER BY memory_key;`, true);
    if (touch && rows.length) {
      const timestamp = now();
      const expiresAt = new Date(timestamp.getTime() + LONG_TERM_TTL_MS).toISOString();
      execute(`UPDATE long_term_memories SET last_used_at=${sqlValue(timestamp.toISOString())},expires_at=${sqlValue(expiresAt)} WHERE device_id=${sqlValue(deviceId)};`);
    }
    return rows.map((row) => ({ memory_id: row.memory_id, key: row.memory_key, value: JSON.parse(row.value_json), source_kind: row.source_kind, confidence: row.confidence, evidence_count: row.evidence_count, created_at: row.created_at, updated_at: row.updated_at, last_used_at: row.last_used_at, expires_at: row.expires_at }));
  }

  function deleteMemory(deviceId, key) {
    cleanDeviceId(deviceId);
    if (!MEMORY_KEYS.has(key)) throw Object.assign(new Error("memory_key_not_allowed"), { statusCode: 400 });
    execute(`DELETE FROM long_term_memories WHERE device_id=${sqlValue(deviceId)} AND memory_key=${sqlValue(key)};`);
  }

  function clearMemory(deviceId) {
    cleanDeviceId(deviceId);
    execute(`BEGIN IMMEDIATE; DELETE FROM short_term_messages WHERE device_id=${sqlValue(deviceId)}; DELETE FROM short_term_summaries WHERE device_id=${sqlValue(deviceId)}; DELETE FROM long_term_memories WHERE device_id=${sqlValue(deviceId)}; DELETE FROM memory_observations WHERE device_id=${sqlValue(deviceId)}; COMMIT;`);
  }

  return { appendMessage, cleanupExpired, clearMemory, databasePath, deleteMemory, ensureDevice, getRecentMessages, getRollingSummary, getSettings, listMemories, observePreference, setEnabled, upsertMemory };
}

module.exports = { createMemoryStore, DEVICE_ID_PATTERN, LONG_TERM_TTL_MS, MAX_RECENT_MESSAGES, MEMORY_KEYS, SHORT_TERM_TTL_MS };
