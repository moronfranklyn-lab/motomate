import fs from "node:fs";

const registryPath = "knowledge_base_outputs/expansion/candidate_registry/expansion_candidates_v0.1.json";
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const records = registry.records
  .filter((record) => record.expansion_pool_eligibility?.status === "eligible")
  .map((record) => ({
    ...record,
    model_year: "current_version",
    budget_guard_price_cny: record.official_public_price_cny,
    qualified_platform_reference_price_cny: null,
    source_urls: (record.official_sources || []).map((source) => source.url),
  }));

const generatedAt = new Date().toISOString();
const output = {
  schema_version: "kb_expansion_eligible_pool_v0.1",
  pool_version: "expansion_pool_v0.1",
  generated_at: generatedAt,
  source_registry: registryPath,
  scope: "isolated_large_displacement_and_electric_motorcycle_expansion",
  product_use_boundary: "future_expansion_rule_filtering_only",
  recommendation_approved_count: 0,
  records,
};
const outputDir = "knowledge_base_outputs/expansion/eligible_pool";
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(`${outputDir}/expansion_pool_v0.1.json`, `${JSON.stringify(output, null, 2)}\n`);
fs.writeFileSync(`${outputDir}/manifest_v0.1.json`, `${JSON.stringify({
  schema_version: "kb_expansion_eligible_manifest_v0.1",
  generated_at: generatedAt,
  pool_path: `${outputDir}/expansion_pool_v0.1.json`,
  source_registry: registryPath,
  record_count: records.length,
  large_displacement_count: records.filter((record) => record.group === "large_displacement").length,
  electric_motorcycle_count: records.filter((record) => record.group === "electric_motorcycle").length,
  recommendation_approved_count: 0,
  validator: "scripts/validate-expansion-eligible-pool.mjs",
}, null, 2)}\n`);
console.log(JSON.stringify({ record_count: records.length, model_ids: records.map((record) => record.model_id) }, null, 2));
