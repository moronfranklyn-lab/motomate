import fs from "node:fs";

const poolPath = "knowledge_base_outputs/expansion/eligible_pool/expansion_pool_v0.1.json";
const manifestPath = "knowledge_base_outputs/expansion/eligible_pool/manifest_v0.1.json";
const registryPath = "knowledge_base_outputs/expansion/candidate_registry/expansion_candidates_v0.1.json";
const pool = JSON.parse(fs.readFileSync(poolPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const errors = [];
const eligibleById = new Map(registry.records.filter((record) => record.expansion_pool_eligibility?.status === "eligible").map((record) => [record.model_id, record]));
const ids = pool.records.map((record) => record.model_id);

if (new Set(ids).size !== ids.length) errors.push("duplicate model_id");
if (pool.recommendation_approved_count !== 0 || manifest.recommendation_approved_count !== 0) errors.push("recommendation approval boundary invalid");
if (pool.records.length !== eligibleById.size || manifest.record_count !== pool.records.length) errors.push("eligible pool count mismatch");
for (const record of pool.records) {
  const source = eligibleById.get(record.model_id);
  if (!source) { errors.push(`${record.model_id}: not eligible in source registry`); continue; }
  if (record.model_year !== "current_version" || record.current_version !== true || record.china_sale_status !== "current") errors.push(`${record.model_id}: current version/status invalid`);
  if (!(record.displacement_cc >= 400) || !Number.isFinite(record.official_public_price_cny)) errors.push(`${record.model_id}: hard fields invalid`);
  if (record.budget_guard_price_cny !== record.official_public_price_cny || record.qualified_platform_reference_price_cny !== null) errors.push(`${record.model_id}: price policy invalid`);
  if (record.fact_verification_status?.fields?.china_sale_status !== "official_verified" || record.fact_verification_status?.fields?.official_public_price_cny !== "official_verified" || record.fact_verification_status?.fields?.displacement_cc !== "official_verified") errors.push(`${record.model_id}: official verification invalid`);
  if (record.expansion_pool_eligibility?.status !== "eligible" || record.recommendation_review_status?.status !== "codex_reviewed") errors.push(`${record.model_id}: orthogonal status invalid`);
  if (!record.source_urls?.length || record.source_urls.some((url) => !/^https:\/\//.test(url))) errors.push(`${record.model_id}: source URLs invalid`);
  if (JSON.stringify(record.official_sources) !== JSON.stringify(source.official_sources)) errors.push(`${record.model_id}: provenance changed during projection`);
}
for (const id of eligibleById.keys()) if (!ids.includes(id)) errors.push(`${id}: eligible registry record missing from pool`);

console.log(JSON.stringify({ passed: errors.length === 0, records_checked: pool.records.length, recommendation_approved_count: 0, errors }, null, 2));
if (errors.length) process.exit(1);
