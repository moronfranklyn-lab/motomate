import fs from "node:fs";

const basePath = "knowledge_base_outputs/eligible_pool/first_batch_v1.json";
const additionsPath = "knowledge_base_outputs/verified_fields/alpha_coverage_additions_v0.1.json";
const cgxPath = "knowledge_base_outputs/verified_fields/cgx150_closure_additions_v0.1.json";
const outputPath = "knowledge_base_outputs/eligible_pool/alpha_pool_v0.1.json";
const base = JSON.parse(fs.readFileSync(basePath, "utf8"));
const additions = JSON.parse(fs.readFileSync(additionsPath, "utf8"));
const cgx = JSON.parse(fs.readFileSync(cgxPath, "utf8"));
const models = [...base.models, ...additions.models, ...cgx.models];

if (new Set(models.map((model) => model.model_id)).size !== models.length) throw new Error("duplicate model_id while building alpha pool");

const output = {
  schema_version: "kb_eligible_pool_v0.2",
  pool_version: "alpha_pool_v0.1",
  created_at: "2026-08-31T11:50:00+08:00",
  rule_version: "kb_admission_v0.2",
  source_scope: "first_batch_v1_plus_alpha_coverage_and_cgx150_closure",
  usage_scope: "internal_development_preview_only",
  recommendation_approved_count: 0,
  models,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
