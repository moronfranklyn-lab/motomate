import fs from "node:fs";

const [poolPath, manifestPath, auditPath] = process.argv.slice(2);
if (!poolPath || !manifestPath || !auditPath) process.exit(2);
const pool = JSON.parse(fs.readFileSync(poolPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const errors = [];
const models = pool.models || [];
const ids = models.map((model) => model.model_id);
const allowedHosts = ["haojue.com", "yamaha-motor.com.cn", "cfmoto.com", "wuyang-honda.com", "58moto.com", "autohome.com.cn"];

if (models.length < 12 || models.length > 15) errors.push(`Alpha pool must contain 12-15 records, got ${models.length}`);
if (new Set(ids).size !== ids.length) errors.push("model_id values must be unique");
for (const model of models) {
  const id = model.model_id;
  if (model.model_year !== "current_version") errors.push(`${id}: model_year must be current_version`);
  if (model.sale_status !== "current") errors.push(`${id}: sale_status must be current`);
  if (model.rule_pool_eligibility?.status !== "eligible") errors.push(`${id}: non-eligible record in Alpha pool`);
  if (model.fact_verification_status?.overall !== "sufficient_for_rules") errors.push(`${id}: facts insufficient`);
  if (model.fact_verification_status?.fields?.sale_status !== "official_verified") errors.push(`${id}: sale status not official`);
  if (model.fact_verification_status?.fields?.official_public_price_cny !== "official_verified") errors.push(`${id}: price not official`);
  if (!(model.official_public_price_cny >= 10000 && model.official_public_price_cny <= 30000)) errors.push(`${id}: price outside range`);
  if (model.budget_guard_price_cny < model.official_public_price_cny) errors.push(`${id}: invalid budget guard`);
  if (model.recommendation_review_status?.status === "approved") errors.push(`${id}: recommendation approval inferred`);
  if (model.recommendation_review_status?.status !== "codex_reviewed") errors.push(`${id}: Codex review missing`);
  if (!model.source_urls?.some((url) => /haojue\.com|yamaha-motor\.com\.cn|cfmoto\.com|wuyang-honda\.com/.test(url))) errors.push(`${id}: official source missing`);
  if (!model.source_urls?.some((url) => /58moto\.com|autohome\.com\.cn/.test(url))) errors.push(`${id}: mainstream platform cross-check missing`);
  for (const source of model.source_urls || []) {
    const host = new URL(source).hostname;
    if (!allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) errors.push(`${id}: source host not allowed: ${host}`);
  }
}
if (manifest.model_count !== models.length || manifest.eligible_count !== models.length || manifest.recommendation_approved_count !== 0) errors.push("manifest counts or approval boundary invalid");
if (audit.added_eligible_model_ids?.some((id) => !ids.includes(id))) errors.push("audit addition missing from pool");
if (audit.codex_review?.human_fact_verification_claimed !== false || audit.recommendation_approved_count !== 0 || audit.model_api_usage?.used !== false) errors.push("audit guardrails invalid");

const result = {schema_version:pool.schema_version,pool_version:pool.pool_version,records_checked:models.length,valid:errors.length===0,eligible_count:models.length,recommendation_approved_count:0,errors};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exit(1);
