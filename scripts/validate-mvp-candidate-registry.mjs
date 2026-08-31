import fs from "node:fs";

const registry = JSON.parse(fs.readFileSync("knowledge_base_outputs/candidate_registry/mvp_candidates_v0.1.json", "utf8"));
const eligiblePool = JSON.parse(fs.readFileSync("knowledge_base_outputs/eligible_pool/mvp_eligible_pool_v0.1.json", "utf8"));
const allowed = new Set(["eligible", "blocked", "ineligible", "excluded"]);
const ids = registry.models.map((item) => item.model_id);
const alphaIds = new Set(eligiblePool.models.map((item) => item.model_id));
const errors = [];

if (registry.candidate_count < 25 || registry.candidate_count > 35) errors.push("candidate_count must be 25..35");
if (registry.candidate_count !== registry.models.length) errors.push("candidate_count mismatch");
if (new Set(ids).size !== ids.length) errors.push("model_id must be unique");
if (registry.recommendation_approved_count !== 0) errors.push("recommendation approvals must remain zero");
for (const item of registry.models) {
  if (!allowed.has(item.rule_pool_eligibility)) errors.push(`${item.model_id}: invalid terminal status`);
  if (!item.brand || !item.model_name || !("trim_name" in item)) errors.push(`${item.model_id}: identity fields incomplete`);
  if (item.rule_pool_eligibility === "eligible") {
    if (!alphaIds.has(item.model_id)) errors.push(`${item.model_id}: eligible record not in active MVP eligible pool`);
    if (item.blocker !== null || !item.verified_record_source) errors.push(`${item.model_id}: eligible provenance invalid`);
  } else {
    if (!item.blocker) errors.push(`${item.model_id}: non-eligible record missing blocker`);
    if (item.recommendation_review_status === "approved") errors.push(`${item.model_id}: unauthorized approval`);
  }
  if (item.extraction_draft_path) {
    const draft = JSON.parse(fs.readFileSync(item.extraction_draft_path, "utf8"));
    if (draft.status !== "extraction_draft" || !draft.parseable || Array.isArray(draft.extracted?.model)) errors.push(`${item.model_id}: invalid draft linkage`);
    if (draft.input_paths?.[0] !== item.public_evidence_path) errors.push(`${item.model_id}: draft/input mismatch`);
  }
  for (const path of [item.public_evidence_path, item.verified_record_source].filter(Boolean)) {
    if (!fs.existsSync(path)) errors.push(`${item.model_id}: missing provenance ${path}`);
  }
}
console.log(JSON.stringify({passed: errors.length === 0, candidate_count: registry.models.length, errors}, null, 2));
if (errors.length) process.exit(1);
