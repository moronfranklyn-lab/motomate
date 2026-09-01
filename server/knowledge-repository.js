const { existsSync, statSync } = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function ensureDatabase(rootPath, databasePath) {
  const sources = [
    join(rootPath, "knowledge_base_outputs/eligible_pool/active_runtime_pool_v0.1.json"),
    join(rootPath, "knowledge_base_outputs/semantic_enrichment/active_runtime_semantic_v0.1.json"),
  ];
  const stale = !existsSync(databasePath) || sources.some((source) => statSync(source).mtimeMs > statSync(databasePath).mtimeMs);
  if (!stale) return;
  const result = spawnSync("node", [join(rootPath, "scripts/build-knowledge-sqlite.mjs")], {
    cwd: rootPath,
    env: { ...process.env, MOTOMATE_KB_SQLITE_PATH: databasePath },
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`knowledge_database_build_failed:${result.stderr.trim()}`);
}

function createKnowledgeRepository(options = {}) {
  const rootPath = options.rootPath || join(__dirname, "..");
  const databasePath = options.databasePath || join(rootPath, "runtime/motomate-knowledge.sqlite");
  ensureDatabase(rootPath, databasePath);

  function execute(statement) {
    const result = spawnSync("sqlite3", ["-json", "-readonly", databasePath], { input: statement, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(`knowledge_sqlite_error:${result.stderr.trim()}`);
    return result.stdout.trim() ? JSON.parse(result.stdout) : [];
  }

  const metadata = Object.fromEntries(execute("SELECT key,value FROM metadata;").map((row) => [row.key, row.value]));
  function queryModels(query = {}) {
    const where = [];
    if (query.eligibleOnly !== false) where.push("rule_status='eligible'");
    if (query.currentOnly !== false) where.push("sale_status='current'");
    if (Array.isArray(query.vehicleTypes) && query.vehicleTypes.length) where.push(`vehicle_type IN (${query.vehicleTypes.map(sql).join(",")})`);
    if (Number.isFinite(query.maxBudgetCny)) where.push(`budget_guard_price_cny<=${sql(query.maxBudgetCny)}`);
    if (Number.isFinite(query.minDisplacementCc)) where.push(`displacement_cc>=${sql(query.minDisplacementCc)}`);
    const rows = execute(`SELECT model_json FROM models${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY budget_guard_price_cny,model_id;`);
    return rows.map((row) => JSON.parse(row.model_json));
  }
  function querySemanticByModelIds(modelIds = []) {
    if (!modelIds.length) return [];
    return execute(`SELECT semantic_json FROM semantics WHERE model_id IN (${modelIds.map(sql).join(",")});`).map((row) => JSON.parse(row.semantic_json));
  }
  return {
    databasePath,
    storage_mode: "sqlite_indexed_readonly",
    pool_version: metadata.pool_version,
    rule_version: metadata.rule_version,
    recommendation_approved_count: Number(metadata.recommendation_approved_count || 0),
    model_count: Number(metadata.model_count || 0),
    queryModels,
    querySemanticByModelIds,
  };
}

module.exports = { createKnowledgeRepository };
