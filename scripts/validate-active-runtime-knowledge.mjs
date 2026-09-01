import fs from "node:fs";

const pool = JSON.parse(fs.readFileSync("knowledge_base_outputs/eligible_pool/active_runtime_pool_v0.1.json", "utf8"));
const manifest = JSON.parse(fs.readFileSync("knowledge_base_outputs/eligible_pool/active_runtime_manifest_v0.1.json", "utf8"));
const semantic = JSON.parse(fs.readFileSync("knowledge_base_outputs/semantic_enrichment/active_runtime_semantic_v0.1.json", "utf8"));
const errors = [];
const ids = pool.models.map((model) => model.model_id);
const semanticIds = semantic.models.map((model) => model.model_id);
if (pool.models.length !== 30 || manifest.mvp_count !== 17 || manifest.expansion_count !== 13) errors.push("active pool counts invalid");
if (new Set(ids).size !== ids.length || new Set(semanticIds).size !== semanticIds.length) errors.push("duplicate model_id");
if (ids.length !== semanticIds.length || ids.some((id) => !semanticIds.includes(id))) errors.push("semantic identity coverage invalid");
if (pool.recommendation_approved_count !== 0 || semantic.recommendation_approved_count !== 0 || manifest.recommendation_approved_count !== 0) errors.push("recommendation approval boundary invalid");
for (const model of pool.models) {
  if (model.rule_pool_eligibility?.status !== "eligible" || model.sale_status !== "current") errors.push(`${model.model_id}: runtime eligibility invalid`);
  if (!Number.isFinite(model.budget_guard_price_cny) || model.budget_guard_price_cny < model.official_public_price_cny) errors.push(`${model.model_id}: price guard invalid`);
  if (model.recommendation_review_status?.status !== "codex_reviewed") errors.push(`${model.model_id}: operational review invalid`);
  if (!model.source_urls?.length) errors.push(`${model.model_id}: source chain missing`);
}
for (const item of semantic.models) {
  if (!item.usage_tags || !item.operation_pressure_level || !item.beginner_friendliness || !item.maintenance_convenience || !item.style_and_power_tags) errors.push(`${item.model_id}: semantic fields missing`);
  if (item.maintenance_convenience.value !== null || item.maintenance_convenience.availability !== "unavailable") errors.push(`${item.model_id}: maintenance must remain unknown`);
}
console.log(JSON.stringify({ passed: errors.length === 0, models: pool.models.length, semantics: semantic.models.length, recommendation_approved_count: 0, errors }, null, 2));
if (errors.length) process.exit(1);
