import fs from "node:fs";
import path from "node:path";

const [handrailPath, topboxPath, repeatPath] = process.argv.slice(2);
if (!handrailPath || !topboxPath || !repeatPath) process.exit(2);

const read = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const runs = {
  handrail: read(handrailPath),
  airshock_topbox: read(topboxPath),
  handrail_repeat: read(repeatPath),
};
const targetFields = [
  "model_search_name", "model_year", "trim_name", "sale_status",
  "official_msrp_cny", "official_price_label", "displacement_cc",
  "seat_height_mm", "curb_weight_kg", "max_power_kw", "fuel_tank_l",
  "abs", "tcs", "vehicle_type",
];
const whitelist = new Set([
  "https://www.haojue.com/2026UHR150/",
  "https://www.haojue.com/2026UHR150/canshu.html",
  "https://www.haojue.com/2026UHR150/jiage.html",
  "https://www.58moto.com/good/19828.html",
]);
const expected = {
  handrail: { model_year: "2026", trim_name: "扶手版", official_msrp_cny: 13780, curb_weight_kg: 140 },
  airshock_topbox: { model_year: "2026", trim_name: "气囊减振/尾箱版", official_msrp_cny: 14680, curb_weight_kg: 144 },
};

function audit(name, run, binding) {
  const model = run.extracted?.model;
  const rootValid = Boolean(model) && !run.extracted?.models && !run.extracted?.answer;
  const present = rootValid ? targetFields.filter((field) => model[field] !== null && model[field] !== undefined && model[field] !== "") : [];
  const sourceUrls = rootValid
    ? Object.values(model.field_sources || {}).flat().filter((value) => typeof value === "string")
    : [];
  const sourceFieldsComplete = rootValid && targetFields.every((field) => Array.isArray(model.field_sources?.[field]) && model.field_sources[field].length > 0);
  const whitelistValid = sourceUrls.length > 0 && sourceUrls.every((url) => whitelist.has(url));
  const bindingValid = rootValid && Object.entries(binding).every(([field, value]) => model[field] === value);
  return {
    name,
    http_status: run.http_status,
    json_parseable: run.parseable === true,
    root_valid: rootValid,
    field_completeness: `${present.length}/${targetFields.length}`,
    field_completeness_rate: present.length / targetFields.length,
    source_fields_complete: sourceFieldsComplete,
    source_whitelist_valid: whitelistValid,
    hallucination_detected: !whitelistValid || !bindingValid,
    binding_valid: bindingValid,
    usage: run.usage,
    output_file: name === "handrail" ? handrailPath : name === "airshock_topbox" ? topboxPath : repeatPath,
    extraction_route_passed: run.http_status === 200 && run.parseable === true && rootValid && present.length === targetFields.length && sourceFieldsComplete && whitelistValid && bindingValid,
  };
}

const audits = [
  audit("handrail", runs.handrail, expected.handrail),
  audit("airshock_topbox", runs.airshock_topbox, expected.airshock_topbox),
  audit("handrail_repeat", runs.handrail_repeat, expected.handrail),
];
const original = runs.handrail.extracted?.model;
const repeated = runs.handrail_repeat.extracted?.model;
const repeatFields = [...targetFields, "field_sources"];
const repeatStable = repeatFields.every((field) => JSON.stringify(original?.[field]) === JSON.stringify(repeated?.[field]));
const mergedModels = [runs.handrail.extracted?.model, runs.airshock_topbox.extracted?.model];
const mergeBindingValid = mergedModels.length === 2
  && mergedModels[0]?.trim_name === "扶手版"
  && mergedModels[0]?.official_msrp_cny === 13780
  && mergedModels[0]?.curb_weight_kg === 140
  && mergedModels[1]?.trim_name === "气囊减振/尾箱版"
  && mergedModels[1]?.official_msrp_cny === 14680
  && mergedModels[1]?.curb_weight_kg === 144;
const extractionBatchRoutePassed = audits.every((item) => item.extraction_route_passed) && repeatStable && mergeBindingValid;
const output = {
  validation_type: "uhr150_single_trim_route",
  validated_at: new Date().toISOString(),
  status: "extraction_draft",
  model: "glm-4.5-air",
  audits,
  repeat_stable: repeatStable,
  merge_binding_valid: mergeBindingValid,
  extraction_batch_route_passed: extractionBatchRoutePassed,
  fact_verification_status: "not_evaluated",
  rule_pool_eligibility: "not_evaluated",
  recommendation_review_status: "not_started",
  merged: { models: mergedModels },
};
const outputDir = path.resolve("knowledge_base_outputs/route_validation");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, "uhr150_glm45air_single_trim_validation.json");
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify({ output_path: outputPath, extraction_batch_route_passed: extractionBatchRoutePassed, repeat_stable: repeatStable, merge_binding_valid: mergeBindingValid }));
if (!extractionBatchRoutePassed) process.exit(1);
