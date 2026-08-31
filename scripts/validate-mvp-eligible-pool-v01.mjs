import fs from "node:fs";

const pool = JSON.parse(fs.readFileSync("knowledge_base_outputs/eligible_pool/mvp_eligible_pool_v0.1.json","utf8"));
const manifest = JSON.parse(fs.readFileSync("knowledge_base_outputs/eligible_pool/mvp_eligible_manifest_v0.1.json","utf8"));
const errors = [];
const ids = pool.models.map((model) => model.model_id);
const allowedHosts = ["haojue.com","yamaha-motor.com.cn","cfmoto.com","wuyang-honda.com","58moto.com","autohome.com.cn","api.vogemotor.com"];
if (pool.models.length !== 17) errors.push(`expected 17 models, got ${pool.models.length}`);
if (new Set(ids).size !== ids.length) errors.push("duplicate model_id");
if (pool.recommendation_approved_count !== 0 || manifest.recommendation_approved_count !== 0) errors.push("approval boundary invalid");
for (const model of pool.models) {
  const id = model.model_id;
  if (model.model_year !== "current_version" || model.sale_status !== "current") errors.push(`${id}: current identity invalid`);
  if (model.rule_pool_eligibility?.status !== "eligible" || model.fact_verification_status?.overall !== "sufficient_for_rules") errors.push(`${id}: eligibility invalid`);
  if (model.fact_verification_status?.fields?.sale_status !== "official_verified" || model.fact_verification_status?.fields?.official_public_price_cny !== "official_verified") errors.push(`${id}: sale/price not official`);
  if (!(model.official_public_price_cny >= 10000 && model.official_public_price_cny <= 30000)) errors.push(`${id}: official price outside range`);
  if (model.budget_guard_price_cny < model.official_public_price_cny) errors.push(`${id}: budget guard below official price`);
  if (model.recommendation_review_status?.status !== "codex_reviewed") errors.push(`${id}: Codex review missing`);
  if (model.recommendation_review_status?.status === "approved") errors.push(`${id}: unauthorized approval`);
  if (!model.source_urls?.length) errors.push(`${id}: sources missing`);
  for (const source of model.source_urls || []) {
    const host = new URL(source).hostname;
    if (!allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) errors.push(`${id}: source host not allowed: ${host}`);
  }
}
if (manifest.model_count !== pool.models.length || manifest.eligible_count !== pool.models.length || manifest.blocked_count !== 0) errors.push("manifest counts invalid");
console.log(JSON.stringify({schema_version:pool.schema_version,pool_version:pool.pool_version,records_checked:pool.models.length,valid:errors.length===0,eligible_count:pool.models.length,recommendation_approved_count:0,errors},null,2));
if (errors.length) process.exit(1);
