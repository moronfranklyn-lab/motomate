import fs from "node:fs";
import { spawnSync } from "node:child_process";

const poolPath = "knowledge_base_outputs/eligible_pool/active_runtime_pool_v0.1.json";
const semanticPath = "knowledge_base_outputs/semantic_enrichment/active_runtime_semantic_v0.1.json";
const databasePath = process.env.MOTOMATE_KB_SQLITE_PATH || "runtime/motomate-knowledge.sqlite";
const pool = JSON.parse(fs.readFileSync(poolPath, "utf8"));
const semantic = JSON.parse(fs.readFileSync(semanticPath, "utf8"));
const semanticById = new Map(semantic.models.map((item) => [item.model_id, item]));

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

fs.mkdirSync("runtime", { recursive: true });
const statements = [
  "PRAGMA journal_mode=WAL;",
  "BEGIN IMMEDIATE;",
  "DROP TABLE IF EXISTS metadata;",
  "DROP TABLE IF EXISTS semantics;",
  "DROP TABLE IF EXISTS models;",
  `CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);`,
  `CREATE TABLE models(
    model_id TEXT PRIMARY KEY, brand TEXT NOT NULL, model_name TEXT NOT NULL, trim_name TEXT,
    sale_status TEXT NOT NULL, vehicle_type TEXT, budget_guard_price_cny REAL NOT NULL,
    official_public_price_cny REAL NOT NULL, displacement_cc REAL, seat_height_mm REAL,
    curb_weight_kg REAL, max_power_kw REAL, abs TEXT, tcs TEXT,
    rule_status TEXT NOT NULL, review_status TEXT NOT NULL, source_pool TEXT, model_json TEXT NOT NULL
  );`,
  `CREATE TABLE semantics(model_id TEXT PRIMARY KEY REFERENCES models(model_id) ON DELETE CASCADE,semantic_json TEXT NOT NULL);`,
];
for (const model of pool.models) {
  statements.push(`INSERT INTO models VALUES(${[
    model.model_id, model.brand, model.model_name, model.trim_name, model.sale_status, model.vehicle_type,
    model.budget_guard_price_cny, model.official_public_price_cny, model.displacement_cc, model.seat_height_mm,
    model.curb_weight_kg, model.max_power_kw, model.abs, model.tcs, model.rule_pool_eligibility?.status,
    model.recommendation_review_status?.status, model.source_pool, JSON.stringify(model),
  ].map(sql).join(",")});`);
  const semanticItem = semanticById.get(model.model_id);
  if (!semanticItem) throw new Error(`semantic_missing:${model.model_id}`);
  statements.push(`INSERT INTO semantics VALUES(${sql(model.model_id)},${sql(JSON.stringify(semanticItem))});`);
}
for (const [key, value] of Object.entries({
  pool_version: pool.pool_version,
  rule_version: pool.rule_version,
  semantic_version: semantic.enrichment_version,
  model_count: String(pool.models.length),
  recommendation_approved_count: String(pool.recommendation_approved_count),
  source_pool_path: poolPath,
  source_semantic_path: semanticPath,
  built_at: new Date().toISOString(),
})) statements.push(`INSERT INTO metadata VALUES(${sql(key)},${sql(value)});`);
statements.push(
  "CREATE INDEX idx_models_hard_filter ON models(rule_status,sale_status,vehicle_type,budget_guard_price_cny);",
  "CREATE INDEX idx_models_budget ON models(budget_guard_price_cny);",
  "CREATE INDEX idx_models_brand_name ON models(brand,model_name);",
  "CREATE INDEX idx_models_displacement ON models(displacement_cc);",
  "COMMIT;",
  "PRAGMA optimize;",
);
const result = spawnSync("sqlite3", [databasePath], { input: statements.join("\n"), encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
if (result.status !== 0) throw new Error(`sqlite_build_failed:${result.stderr.trim()}`);
console.log(JSON.stringify({ database_path: databasePath, pool_version: pool.pool_version, model_count: pool.models.length, semantic_count: semantic.models.length, indexes: 4 }, null, 2));
