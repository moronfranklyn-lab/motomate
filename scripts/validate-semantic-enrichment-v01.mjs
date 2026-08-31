import fs from "node:fs";

const [semanticPath, poolPath, manifestPath, exceptionsPath] = process.argv.slice(2);
if (!semanticPath || !poolPath || !manifestPath || !exceptionsPath) {
  console.error("usage: node scripts/validate-semantic-enrichment-v01.mjs <semantic> <pool> <manifest> <exceptions>");
  process.exit(2);
}

const semantic = JSON.parse(fs.readFileSync(semanticPath, "utf8"));
const pool = JSON.parse(fs.readFileSync(poolPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const exceptions = JSON.parse(fs.readFileSync(exceptionsPath, "utf8"));
const errors = [];
const levels = new Set(["low", "medium", "high", "unknown"]);
const availability = new Set(["rule_sorting", "ai_explanation_only", "unavailable"]);
const usageTags = new Set(["urban_commute", "daily_transport", "weekend_leisure"]);
const styles = new Set(["scooter", "street_naked", "cruiser"]);
const powerBands = new Set(["entry", "moderate", "strong", "unknown"]);
const allowedHosts = ["haojue.com", "yamaha-motor.com.cn", "cfmoto.com", "wuyang-honda.com", "58moto.com"];
const semanticModels = semantic.models || [];
const poolModels = pool.models || [];
const poolById = new Map(poolModels.map((model) => [model.model_id, model]));

if (semantic.schema_version !== "kb_semantic_enrichment_v0.1") errors.push("invalid schema_version");
if (semantic.recommendation_approved_count !== 0 || pool.recommendation_approved_count !== 0 || manifest.recommendation_approved_count !== 0) errors.push("recommendation approval boundary changed");
if (semantic.model_output_used !== false || manifest.model_api_calls !== 0) errors.push("unexpected model output usage");
if (semanticModels.length !== 8 || poolModels.length !== 8) errors.push("semantic and source pools must each contain 8 records");
if (new Set(semanticModels.map((model) => model.model_id)).size !== semanticModels.length) errors.push("duplicate semantic model_id");

function pressurePoints(power, weight, seat) {
  if ([power, weight, seat].some((value) => value == null)) return null;
  const p = power <= 15 ? 0 : power < 30 ? 1 : 2;
  const w = weight <= 145 ? 0 : weight <= 180 ? 1 : 2;
  const s = seat <= 770 ? 0 : seat <= 790 ? 1 : 2;
  const total = p + w + s;
  return { power: p, weight: w, seat_height: s, total, level: total <= 1 ? "low" : total <= 3 ? "medium" : "high" };
}

for (const model of semanticModels) {
  const source = poolById.get(model.model_id);
  const id = model.model_id || "<missing_model_id>";
  if (!source) { errors.push(`${id}: absent from source pool`); continue; }
  if (model.model_year !== source.model_year || model.trim_name !== source.trim_name) errors.push(`${id}: identity/version/trim conflict with source pool`);
  for (const tag of model.usage_tags?.value || []) {
    if (!usageTags.has(tag.tag) || !levels.has(tag.intensity) || tag.intensity === "unknown") errors.push(`${id}: invalid usage tag`);
  }
  if (!model.usage_tags?.value?.length || !model.usage_tags.derivation_rule || !model.usage_tags.derivation_version) errors.push(`${id}: usage derivation incomplete`);
  const pressure = pressurePoints(source.max_power_kw, source.curb_weight_kg, source.seat_height_mm);
  const actualPressure = model.operation_pressure_level;
  if (pressure) {
    if (actualPressure.value !== pressure.level || JSON.stringify(actualPressure.component_points) !== JSON.stringify({power:pressure.power,weight:pressure.weight,seat_height:pressure.seat_height,total:pressure.total})) errors.push(`${id}: operation pressure derivation mismatch`);
  } else if (actualPressure.value !== null || actualPressure.status !== "unknown" || actualPressure.availability !== "unavailable") errors.push(`${id}: incomplete pressure inputs must produce explicit unknown`);
  if (!actualPressure.derivation_rule || !actualPressure.derivation_version || !availability.has(actualPressure.availability)) errors.push(`${id}: operation pressure metadata invalid`);
  const beginner = model.beginner_friendliness;
  if (beginner.value !== null && !levels.has(beginner.value)) errors.push(`${id}: invalid beginner friendliness`);
  if (beginner.value === null && beginner.status !== "unknown") errors.push(`${id}: null beginner friendliness must be explicit unknown`);
  if (!availability.has(beginner.availability) || !beginner.derivation_rule || !beginner.derivation_version) errors.push(`${id}: beginner metadata invalid`);
  const maintenance = model.maintenance_convenience;
  if (maintenance.value !== null || maintenance.status !== "unknown" || maintenance.availability !== "unavailable" || !maintenance.missing_evidence?.length) errors.push(`${id}: maintenance must remain explicit unknown with missing evidence`);
  const style = model.style_and_power_tags;
  if (!styles.has(style.style_tag) || !powerBands.has(style.power_band) || !availability.has(style.availability) || !style.derivation_rule || !style.derivation_version) errors.push(`${id}: style/power metadata invalid`);
  if (source.max_power_kw == null && style.power_band !== "unknown") errors.push(`${id}: missing power cannot produce power band`);
  if (source.max_power_kw != null) {
    const expectedBand = source.max_power_kw <= 15 ? "entry" : source.max_power_kw < 30 ? "moderate" : "strong";
    if (style.power_band !== expectedBand) errors.push(`${id}: power band mismatch`);
  }
  if (!model.evidence_refs?.length) errors.push(`${id}: no evidence refs`);
  for (const ref of model.evidence_refs || []) {
    if (!ref.url || !ref.captured_at || !Array.isArray(ref.supports)) errors.push(`${id}: incomplete evidence ref`);
    try {
      const host = new URL(ref.url).hostname;
      if (!allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) errors.push(`${id}: source host not allowed: ${host}`);
      if (!source.source_urls.includes(ref.url)) errors.push(`${id}: evidence URL not present in source pool`);
    } catch { errors.push(`${id}: invalid evidence URL`); }
  }
}

for (const source of poolModels) if (!semanticModels.some((model) => model.model_id === source.model_id)) errors.push(`${source.model_id}: missing semantic record`);
const counts = {
  usage: semanticModels.filter((m) => m.usage_tags.availability === "rule_sorting").length,
  pressure: semanticModels.filter((m) => m.operation_pressure_level.availability === "rule_sorting").length,
  beginner: semanticModels.filter((m) => m.beginner_friendliness.availability === "rule_sorting").length,
  style: semanticModels.filter((m) => m.style_and_power_tags.availability === "rule_sorting").length,
  power: semanticModels.filter((m) => m.style_and_power_tags.availability === "rule_sorting" && m.style_and_power_tags.power_band !== "unknown").length,
  maintenance: semanticModels.filter((m) => m.maintenance_convenience.availability === "rule_sorting").length,
};
if (manifest.model_count !== semanticModels.length || manifest.usage_tags_rule_sorting_count !== counts.usage || manifest.operation_pressure_rule_sorting_count !== counts.pressure || manifest.beginner_friendliness_rule_sorting_count !== counts.beginner || manifest.style_rule_sorting_count !== counts.style || manifest.power_band_rule_sorting_count !== counts.power || manifest.maintenance_convenience_rule_sorting_count !== counts.maintenance) errors.push("manifest counts do not match semantic data");
if (exceptions.recommendation_approval_changed !== false || exceptions.model_api_usage?.used !== false) errors.push("exception guardrails invalid");
const strategy = manifest.product_strategy_review;
if (strategy?.status !== "approved_for_low_weight_internal_testing" || strategy?.decision !== "option_a" || strategy?.ranking_weight_policy !== "low_weight") errors.push("product strategy option A is not closed correctly");
if (strategy?.external_score_display_allowed !== false || strategy?.objective_fact_claim_allowed !== false || strategy?.safety_guarantee_allowed !== false) errors.push("product strategy display/fact/safety guardrails invalid");
if (strategy?.field_by_field_fact_human_verification !== false || strategy?.recommendation_approval_granted !== false) errors.push("product strategy approval is incorrectly represented as fact or recommendation approval");
if (manifest.neutral_missing_policy?.maintenance_convenience !== "unknown_no_ranking_effect") errors.push("maintenance neutral missing policy invalid");
const pcxNeutral = manifest.neutral_missing_policy?.wuyang_honda_pcx160_2025_standard || [];
for (const field of ["max_power_kw", "operation_pressure_level", "beginner_friendliness", "power_band"]) if (!pcxNeutral.includes(field)) errors.push(`PCX160 neutral missing policy lacks ${field}`);
if (exceptions.product_strategy_decision?.decision !== "option_a" || exceptions.product_strategy_decision?.not_fact_human_verification !== true || exceptions.product_strategy_decision?.not_recommendation_approval !== true) errors.push("exception decision audit invalid");

console.log(JSON.stringify({schema_version:semantic.schema_version,records_checked:semanticModels.length,valid:errors.length===0,rule_sorting_counts:counts,recommendation_approved_count:0,model_api_calls:0,errors}, null, 2));
if (errors.length) process.exit(1);
