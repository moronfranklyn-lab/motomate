import fs from "node:fs";

const mvpPath = "knowledge_base_outputs/eligible_pool/mvp_eligible_pool_v0.1.json";
const expansionPath = "knowledge_base_outputs/expansion/eligible_pool/expansion_pool_v0.1.json";
const mvpSemanticPath = "knowledge_base_outputs/semantic_enrichment/mvp_semantic_v0.1.json";
const mvp = JSON.parse(fs.readFileSync(mvpPath, "utf8"));
const expansion = JSON.parse(fs.readFileSync(expansionPath, "utf8"));
const mvpSemantic = JSON.parse(fs.readFileSync(mvpSemanticPath, "utf8"));
const generatedAt = new Date().toISOString();

function projectExpansion(record) {
  return {
    model_id: record.model_id,
    brand: record.brand,
    manufacturer: record.manufacturer,
    model_name: record.model_name,
    model_year: "current_version",
    trim_name: record.trim_name,
    sale_status: record.china_sale_status,
    vehicle_type: record.vehicle_type,
    official_public_price_cny: record.official_public_price_cny,
    official_public_price_label: record.official_price_label,
    qualified_platform_reference_price_cny: record.qualified_platform_reference_price_cny,
    budget_guard_price_cny: record.budget_guard_price_cny,
    displacement_cc: record.displacement_cc,
    seat_height_mm: record.seat_height_mm,
    curb_weight_kg: record.curb_weight_kg,
    max_power_kw: record.max_power_kw,
    fuel_tank_l: record.fuel_tank_l,
    abs: record.abs,
    tcs: record.tcs,
    fact_verification_status: {
      overall: "sufficient_for_rules",
      fields: {
        sale_status: record.fact_verification_status.fields.china_sale_status,
        official_public_price_cny: record.fact_verification_status.fields.official_public_price_cny,
        displacement_cc: record.fact_verification_status.fields.displacement_cc,
        seat_height_mm: record.fact_verification_status.fields.seat_height_mm,
        curb_weight_kg: record.fact_verification_status.fields.curb_weight_kg,
        max_power_kw: record.fact_verification_status.fields.max_power_kw,
        fuel_tank_l: record.fact_verification_status.fields.fuel_tank_l,
        abs: record.fact_verification_status.fields.abs,
        tcs: record.fact_verification_status.fields.tcs,
        vehicle_type: "deterministic_classification",
      },
    },
    rule_pool_eligibility: {
      status: "eligible",
      blockers: [],
      rule_version: record.expansion_pool_eligibility.rule_version,
      evaluated_at: record.expansion_pool_eligibility.evaluated_at,
    },
    recommendation_review_status: record.recommendation_review_status,
    source_urls: record.source_urls,
    source_pool: "expansion_pool_v0.1",
    source_scope: record.group,
  };
}

function pressure(model) {
  const points = {
    power: model.max_power_kw >= 35 ? 2 : model.max_power_kw >= 20 ? 1 : 0,
    weight: model.curb_weight_kg >= 190 ? 2 : model.curb_weight_kg >= 165 ? 1 : 0,
    seat_height: model.seat_height_mm >= 800 ? 2 : model.seat_height_mm >= 770 ? 1 : 0,
  };
  points.total = points.power + points.weight + points.seat_height;
  return { value: points.total >= 4 ? "high" : points.total >= 2 ? "medium" : "low", points };
}

function semanticFor(model) {
  const measured = pressure(model);
  const style = model.vehicle_type === "街车" ? "street_naked" : model.vehicle_type === "跑车" ? "sport" : model.vehicle_type === "拉力" ? "adventure" : "cruiser";
  const usage = model.vehicle_type === "跑车"
    ? [{ tag: "urban_commute", intensity: "low" }, { tag: "weekend_leisure", intensity: "high" }]
    : model.vehicle_type === "拉力"
      ? [{ tag: "urban_commute", intensity: "low" }, { tag: "weekend_leisure", intensity: "medium" }, { tag: "long_distance_touring", intensity: "high" }]
    : model.vehicle_type === "街车"
      ? [{ tag: "urban_commute", intensity: "medium" }, { tag: "weekend_leisure", intensity: "high" }]
      : [{ tag: "urban_commute", intensity: "medium" }, { tag: "weekend_leisure", intensity: "high" }];
  return {
    model_id: model.model_id,
    model_year: model.model_year,
    trim_name: model.trim_name,
    usage_tags: { value: usage, basis_type: "product_hypothesis", derivation_rule: "usage_by_vehicle_type", derivation_version: "v0.1", inputs: { vehicle_type: model.vehicle_type }, availability: "rule_sorting" },
    operation_pressure_level: { value: measured.value, basis_type: "product_hypothesis", derivation_rule: "measurable_operation_pressure", derivation_version: "v0.1", inputs: { max_power_kw: model.max_power_kw, curb_weight_kg: model.curb_weight_kg, seat_height_mm: model.seat_height_mm }, component_points: measured.points, unknown_components: ["throttle_response", "low_speed_handling", "experience_requirement"], availability: "rule_sorting" },
    beginner_friendliness: { value: measured.value === "high" ? "low" : measured.value === "medium" ? "medium" : "high", basis_type: "product_hypothesis", derivation_rule: "beginner_safety_candidate", derivation_version: "v0.1", inputs: { operation_pressure: measured.value, abs: model.abs, tcs: model.tcs }, limitations: ["不是安全保证", "需用户测试校准"], availability: "rule_sorting" },
    maintenance_convenience: { value: null, status: "unknown", missing_evidence: ["service_network", "parts_availability", "maintenance_cost"], availability: "unavailable" },
    style_and_power_tags: { style_tag: style, power_band: "strong", basis_type: "deterministic_derived", derivation_rule: "style_and_power", derivation_version: "v0.1", inputs: { vehicle_type: model.vehicle_type, max_power_kw: model.max_power_kw }, availability: "rule_sorting" },
    evidence_refs: model.source_urls.map((url) => ({ url, source_type: "official", captured_at: model.recommendation_review_status.reviewed_at, supports: ["vehicle_type", "max_power_kw", "curb_weight_kg", "seat_height_mm", "abs", "tcs"] })),
  };
}

const expansionModels = expansion.records.map(projectExpansion);
const models = [...mvp.models.map((model) => ({ ...model, source_pool: "mvp_eligible_pool_v0.1", source_scope: "mvp_10000_30000" })), ...expansionModels];
if (new Set(models.map((model) => model.model_id)).size !== models.length) throw new Error("duplicate model_id in active pool");
const activePool = {
  schema_version: "kb_active_runtime_pool_v0.1",
  pool_version: "active_runtime_pool_v0.1",
  created_at: generatedAt,
  rule_version: "kb_admission_v0.2_plus_expansion_v0.1",
  source_pools: [mvpPath, expansionPath],
  usage_scope: "development_preview_main_chain_not_recommendation_approved",
  recommendation_approved_count: 0,
  models,
};
const semantics = [...mvpSemantic.models, ...expansionModels.map(semanticFor)];
const activeSemantic = {
  schema_version: "kb_semantic_enrichment_v0.3",
  enrichment_version: "active_runtime_semantic_v0.1",
  created_at: generatedAt,
  source_pool: "knowledge_base_outputs/eligible_pool/active_runtime_pool_v0.1.json",
  source_pool_version: activePool.pool_version,
  usage_scope: "low_weight_internal_development_preview",
  recommendation_approved_count: 0,
  model_output_used: false,
  models: semantics,
};
fs.writeFileSync("knowledge_base_outputs/eligible_pool/active_runtime_pool_v0.1.json", `${JSON.stringify(activePool, null, 2)}\n`);
fs.writeFileSync("knowledge_base_outputs/eligible_pool/active_runtime_manifest_v0.1.json", `${JSON.stringify({ schema_version: "kb_active_runtime_manifest_v0.1", active_pool_file: "knowledge_base_outputs/eligible_pool/active_runtime_pool_v0.1.json", pool_version: activePool.pool_version, model_count: models.length, mvp_count: mvp.models.length, expansion_count: expansionModels.length, recommendation_approved_count: 0, validator: "scripts/validate-active-runtime-knowledge.mjs" }, null, 2)}\n`);
fs.writeFileSync("knowledge_base_outputs/semantic_enrichment/active_runtime_semantic_v0.1.json", `${JSON.stringify(activeSemantic, null, 2)}\n`);
console.log(JSON.stringify({ models: models.length, semantics: semantics.length, expansion: expansionModels.length }, null, 2));
