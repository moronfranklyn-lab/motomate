import fs from "node:fs";

const [manifestPath] = process.argv.slice(2);
if (!manifestPath) process.exit(2);

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const factOverall = new Set(["not_started", "in_progress", "sufficient_for_rules", "conflict", "stale", "insufficient"]);
const ruleStatuses = new Set(["not_evaluated", "pending_deterministic_check", "eligible", "blocked", "ineligible", "excluded"]);
const reviewStatuses = new Set(["not_started", "codex_review_pending", "codex_reviewed", "ethan_decision_required", "approved", "rejected"]);
const records = manifest.closest_to_eligible || [];
const errors = [];

if (records.length < 5 || records.length > 8) errors.push("closest_to_eligible must contain 5-8 records");

for (const record of records) {
  const id = record.model_id || "<missing_model_id>";
  const fact = record.fact_verification_status?.overall;
  const rule = record.rule_pool_eligibility?.status;
  const review = record.recommendation_review_status?.status;
  if (!factOverall.has(fact)) errors.push(`${id}: invalid fact_verification_status.overall`);
  if (!ruleStatuses.has(rule)) errors.push(`${id}: invalid rule_pool_eligibility.status`);
  if (!reviewStatuses.has(review)) errors.push(`${id}: invalid recommendation_review_status.status`);
  if (!Array.isArray(record.rule_pool_eligibility?.blockers)) errors.push(`${id}: rule blockers must be an array`);
  if (review === "approved" && rule !== "eligible") errors.push(`${id}: recommendation approved without rule eligibility`);
  if (rule === "eligible" && fact !== "sufficient_for_rules") errors.push(`${id}: eligible without sufficient facts`);
}

const result = {
  schema_version: manifest.schema_version,
  records_checked: records.length,
  valid: errors.length === 0,
  errors,
  guardrails: {
    no_automatic_recommendation_upgrade: manifest.automatic_recommendation_upgrade === false,
    approved_count: records.filter((record) => record.recommendation_review_status?.status === "approved").length,
    eligible_count: records.filter((record) => record.rule_pool_eligibility?.status === "eligible").length,
  },
};

console.log(JSON.stringify(result, null, 2));
if (!result.valid || !result.guardrails.no_automatic_recommendation_upgrade) process.exit(1);
