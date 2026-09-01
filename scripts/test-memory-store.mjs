import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createMemoryStore } = require("../server/memory-store.js");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "motomate-memory-"));
let current = new Date("2026-09-01T00:00:00.000Z");
const store = createMemoryStore(path.join(directory, "memory.sqlite"), { now: () => current });
const deviceId = "device_1234567890abcdef";
store.ensureDevice(deviceId);
assert.equal(store.getSettings(deviceId).memory_enabled, true);

store.appendMessage(deviceId, "session_12345678", "user", "预算两万元");
store.appendMessage(deviceId, "session_12345678", "assistant", "这是裸车还是落地预算？");
assert.equal(store.getRecentMessages(deviceId, "session_12345678").length, 2);

for (let index = 0; index < 41; index += 1) {
  store.appendMessage(deviceId, "session_summary_01", "user", index === 0 ? "电话 13800138000" : `消息 ${index}`);
}
assert.equal(store.getRecentMessages(deviceId, "session_summary_01").length, 40);
assert.match(store.getRollingSummary(deviceId, "session_summary_01").summary, /手机号已隐藏/);

const memory = store.upsertMemory(deviceId, "riding_experience", "beginner", "repeated_sessions", 0.9);
assert.equal(memory.value, "beginner");
assert.equal(store.listMemories(deviceId).length, 1);

const firstObservation = store.observePreference(deviceId, "session_first_01", "preferred_vehicle_type", "scooter");
assert.equal(firstObservation.promoted, false);
const secondObservation = store.observePreference(deviceId, "session_second_02", "preferred_vehicle_type", "scooter");
assert.equal(secondObservation.promoted, true);
assert.equal(store.listMemories(deviceId).find((item) => item.key === "preferred_vehicle_type").source_kind, "repeated_sessions");
store.observePreference(deviceId, "session_explicit_03", "preferred_vehicle_type", "street", true);
const protectedObservation = store.observePreference(deviceId, "session_fourth_04", "preferred_vehicle_type", "scooter");
assert.equal(protectedObservation.reason, "explicit_memory_protected");
assert.equal(store.listMemories(deviceId).find((item) => item.key === "preferred_vehicle_type").value, "street");

current = new Date("2026-09-02T00:00:01.000Z");
store.cleanupExpired();
assert.equal(store.getRecentMessages(deviceId, "session_12345678").length, 0);
assert.equal(store.listMemories(deviceId).length, 2);

store.setEnabled(deviceId, false);
assert.equal(store.appendMessage(deviceId, "session_12345678", "user", "不应保存"), null);
store.setEnabled(deviceId, true);
store.deleteMemory(deviceId, "riding_experience");
assert.equal(store.listMemories(deviceId).length, 1);

assert.throws(() => store.upsertMemory(deviceId, "phone", "13800000000"), /memory_key_not_allowed/);
assert.throws(() => store.ensureDevice("bad"), /invalid_device_id/);

store.upsertMemory(deviceId, "primary_usage", "commute");
store.clearMemory(deviceId);
assert.equal(store.listMemories(deviceId).length, 0);
fs.rmSync(directory, { recursive: true, force: true });
console.log("memory-store: 18 scenarios passed");
