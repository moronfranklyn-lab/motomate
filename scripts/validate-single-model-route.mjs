import fs from "node:fs";
import path from "node:path";

const [manifestPath, ...runPaths] = process.argv.slice(2);
if (!manifestPath || runPaths.length === 0) process.exit(2);

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const manifest = readJson(manifestPath);
const targetFields = [
  "model_search_name", "model_year", "trim_name", "sale_status",
  "official_msrp_cny", "official_price_label", "displacement_cc",
  "seat_height_mm", "curb_weight_kg", "max_power_kw", "fuel_tank_l",
  "abs", "tcs", "vehicle_type",
];

if (!Array.isArray(manifest.runs) || manifest.runs.length !== runPaths.length) process.exit(2);

function audit(spec, runPath) {
  const run = readJson(runPath);
  const model = run.extracted?.model;
  const rootValid = Boolean(model) && !run.extracted?.models && !run.extracted?.answer;
  const schemaValid = rootValid
    && targetFields.every((field) => Object.hasOwn(model, field))
    && model.field_sources && typeof model.field_sources === "object" && !Array.isArray(model.field_sources)
    && Array.isArray(model.warnings);
  const presentFields = rootValid
    ? targetFields.filter((field) => Object.hasOwn(model, field))
    : [];
  const nonNullFields = schemaValid
    ? targetFields.filter((field) => model[field] !== null && model[field] !== undefined && model[field] !== "")
    : [];
  const sourcedNonNullFields = schemaValid
    ? nonNullFields.filter((field) => Array.isArray(model.field_sources[field]) && model.field_sources[field].length > 0)
    : [];
  const sourceUrls = schemaValid
    ? Object.values(model.field_sources).flat().filter((value) => typeof value === "string")
    : [];
  const whitelist = new Set(spec.source_url_whitelist || []);
  const whitelistValid = sourceUrls.length > 0 && sourceUrls.every((url) => whitelist.has(url));
  const bindingValid = schemaValid && Object.entries(spec.expected_binding || {})
    .every(([field, value]) => model[field] === value);
  const unauthorizedSourceCompletion = !whitelistValid || sourcedNonNullFields.length !== nonNullFields.length;
  const hallucinationDetected = unauthorizedSourceCompletion;
  const extractionRoutePassed = run.http_status === 200
    && run.parseable === true
    && schemaValid
    && sourcedNonNullFields.length === nonNullFields.length
    && whitelistValid
    && bindingValid;

  return {
    id: spec.id,
    http_status: run.http_status,
    retry_count: run.retry_count ?? 0,
    latency_ms: run.latency_ms ?? null,
    json_parseable: run.parseable === true,
    root_valid: rootValid,
    schema_valid: schemaValid,
    schema_field_presence: `${presentFields.length}/${targetFields.length}`,
    schema_field_presence_rate: presentFields.length / targetFields.length,
    non_null_field_count: `${nonNullFields.length}/${targetFields.length}`,
    non_null_field_rate: nonNullFields.length / targetFields.length,
    non_null_fields_have_sources: sourcedNonNullFields.length === nonNullFields.length,
    source_whitelist_valid: whitelistValid,
    unauthorized_source_completion: unauthorizedSourceCompletion,
    binding_valid: bindingValid,
    hallucination_detected: hallucinationDetected,
    usage: run.usage,
    output_file: runPath,
    extraction_route_passed: extractionRoutePassed,
    fact_verification_status: "not_evaluated",
    rule_pool_eligibility: "not_evaluated",
    recommendation_review_status: "not_started",
    expected_binding_note: "Test expectation only; not a fact source.",
  };
}

const audits = manifest.runs.map((spec, index) => audit(spec, runPaths[index]));
const consecutiveStructuralFailures = audits.reduce((state, item) => {
  const failed = !item.json_parseable || !item.root_valid || !item.schema_valid;
  return failed ? { current: state.current + 1, max: Math.max(state.max, state.current + 1) } : { current: 0, max: state.max };
}, { current: 0, max: 0 }).max;
const circuitBreakerTriggered = consecutiveStructuralFailures >= 3;
const totalUsage = audits.reduce((sum, item) => ({
  prompt_tokens: sum.prompt_tokens + Number(item.usage?.prompt_tokens || 0),
  completion_tokens: sum.completion_tokens + Number(item.usage?.completion_tokens || 0),
  total_tokens: sum.total_tokens + Number(item.usage?.total_tokens || 0),
}), { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
const latencyValues = audits.map((item) => item.latency_ms).filter((value) => Number.isFinite(value));
const output = {
  validation_type: "single_model_batch_route",
  validated_at: new Date().toISOString(),
  status: "extraction_draft",
  model: process.env.VALIDATION_MODEL || manifest.model || "glm-4.5-air",
  audits,
  total_usage: totalUsage,
  latency: {
    measured_calls: latencyValues.length,
    total_ms: latencyValues.reduce((sum, value) => sum + value, 0),
    average_ms: latencyValues.length ? latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length : null,
  },
  extraction_route_pass_rate: audits.length ? audits.filter((item) => item.extraction_route_passed).length / audits.length : 0,
  consecutive_structural_failures: consecutiveStructuralFailures,
  circuit_breaker_triggered: circuitBreakerTriggered,
  extraction_batch_route_passed: audits.every((item) => item.extraction_route_passed) && !circuitBreakerTriggered,
  fact_verification_status: "not_evaluated",
  rule_pool_eligibility: "not_evaluated",
  recommendation_review_status: "not_started",
};

const outputPath = path.resolve(process.env.VALIDATION_OUTPUT_PATH || manifest.output_path || "knowledge_base_outputs/route_validation/small_batch_validation.json");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify({
  output_path: outputPath,
  extraction_batch_route_passed: output.extraction_batch_route_passed,
  extraction_route_pass_rate: output.extraction_route_pass_rate,
  circuit_breaker_triggered: output.circuit_breaker_triggered,
  total_usage: totalUsage,
}));
if (!output.extraction_batch_route_passed) process.exit(1);
