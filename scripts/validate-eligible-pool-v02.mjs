import fs from "node:fs";

const [poolPath, manifestPath, exceptionsPath] = process.argv.slice(2);
if (!poolPath || !manifestPath || !exceptionsPath) {
  console.error("usage: node scripts/validate-eligible-pool-v02.mjs <pool> <manifest> <exceptions>");
  process.exit(2);
}

const pool = JSON.parse(fs.readFileSync(poolPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const exceptions = JSON.parse(fs.readFileSync(exceptionsPath, "utf8"));
const expectedIds = new Set([
  "haojue_uhr150_2026_handrail",
  "haojue_uhr150_2026_airshock_topbox",
  "yamaha_nmax155_2026_tech_max",
  "yamaha_nmax155_2026_25th",
  "cfmoto_450nk_2026_standard",
  "cfmoto_450clc_2026_standard",
  "cfmoto_450clc_2025_amt",
  "wuyang_honda_pcx160_2025_standard",
]);
const terminalStatuses = new Set(["eligible", "blocked", "ineligible", "excluded"]);
const allowedHosts = ["haojue.com", "yamaha-motor.com.cn", "cfmoto.com", "wuyang-honda.com", "58moto.com"];
const errors = [];
const models = pool.models || [];
const ids = models.map((model) => model.model_id);

if (models.length !== 8) errors.push(`expected 8 models, got ${models.length}`);
if (new Set(ids).size !== ids.length) errors.push("model_id values must be unique");
for (const id of expectedIds) if (!ids.includes(id)) errors.push(`missing expected model: ${id}`);
for (const id of ids) if (!expectedIds.has(id)) errors.push(`unexpected model: ${id}`);

for (const model of models) {
  const id = model.model_id || "<missing_model_id>";
  const ruleStatus = model.rule_pool_eligibility?.status;
  if (!terminalStatuses.has(ruleStatus)) errors.push(`${id}: rule status is not terminal`);
  if (ruleStatus !== "eligible") continue;
  if (model.model_year !== "current_version") errors.push(`${id}: model_year must be current_version`);
  if (model.sale_status !== "current") errors.push(`${id}: sale_status must be current`);
  if (!model.manufacturer || !model.model_name || !model.trim_name) errors.push(`${id}: identity fields incomplete`);
  if (model.fact_verification_status?.overall !== "sufficient_for_rules") errors.push(`${id}: facts not sufficient for rules`);
  if (model.fact_verification_status?.fields?.sale_status !== "official_verified") errors.push(`${id}: sale status lacks official verification`);
  if (model.fact_verification_status?.fields?.official_public_price_cny !== "official_verified") errors.push(`${id}: price lacks official verification`);
  if (!(model.official_public_price_cny >= 10000 && model.official_public_price_cny <= 30000)) errors.push(`${id}: official public price outside 10k-30k`);
  if (model.budget_guard_price_cny < model.official_public_price_cny) errors.push(`${id}: budget guard below official public price`);
  if (model.qualified_platform_reference_price_cny != null && model.budget_guard_price_cny < model.qualified_platform_reference_price_cny) errors.push(`${id}: budget guard below qualified platform reference`);
  if (model.rule_pool_eligibility?.blockers?.length) errors.push(`${id}: eligible record still has blockers`);
  if (model.recommendation_review_status?.status !== "codex_reviewed") errors.push(`${id}: missing Codex review`);
  if (model.recommendation_review_status?.status === "approved") errors.push(`${id}: recommendation approval must not be inferred`);
  if (!Array.isArray(model.source_urls) || model.source_urls.length < 2) errors.push(`${id}: insufficient source URLs`);
  for (const source of model.source_urls || []) {
    const host = new URL(source).hostname;
    if (!allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) errors.push(`${id}: source host not allowed: ${host}`);
  }
}

const pcx = models.find((model) => model.model_id === "wuyang_honda_pcx160_2025_standard");
if (pcx?.max_power_kw !== null || pcx?.fact_verification_status?.fields?.max_power_kw !== "unverified_non_hard_null") errors.push("PCX160: power must remain null and explicitly non-hard");
const amt = models.find((model) => model.model_id === "cfmoto_450clc_2025_amt");
if (amt?.trim_name !== "AMT版" || amt?.reconstruction_method !== "deterministic_from_verified_single_configuration_sources" || amt?.model_extraction_used_for_trim !== false) errors.push("450CL-C AMT: deterministic trim reconstruction marker missing");

if (manifest.model_count !== models.length || manifest.eligible_count !== models.filter((model) => model.rule_pool_eligibility.status === "eligible").length) errors.push("manifest counts do not match pool");
if (manifest.recommendation_approved_count !== 0) errors.push("manifest must have zero recommendation approvals");
if ((exceptions.blocking_exceptions || []).length !== models.filter((model) => model.rule_pool_eligibility.status === "blocked").length) errors.push("exception blocking count does not match pool");
if (exceptions.erroneous_release_count !== 0) errors.push("erroneous release count must be zero");

const result = {
  schema_version: pool.schema_version,
  records_checked: models.length,
  valid: errors.length === 0,
  eligible_count: models.filter((model) => model.rule_pool_eligibility.status === "eligible").length,
  blocked_count: models.filter((model) => model.rule_pool_eligibility.status === "blocked").length,
  recommendation_approved_count: models.filter((model) => model.recommendation_review_status.status === "approved").length,
  pending_deterministic_check_count: models.filter((model) => model.rule_pool_eligibility.status === "pending_deterministic_check").length,
  erroneous_release_count: exceptions.erroneous_release_count,
  errors,
};

console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exit(1);
