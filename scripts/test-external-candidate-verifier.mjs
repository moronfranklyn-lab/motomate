import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { verifyExternalCandidate } = require("../external-candidate-verifier.js");

const noEvidence = verifyExternalCandidate({ raw_text: "推荐 5 万元进口 ADV" });
assert.equal(noEvidence.status, "external_verification_required");
assert.equal(noEvidence.specific_recommendation_allowed, false);
assert.equal(noEvidence.principles_only_on_failure, true);
assert.equal(noEvidence.output_mode, "principles_only");

const officialEvidence = {
  source_url: "https://official.example/model",
  verification_status: "verified",
  model_identity: true,
  current_sale_status: true,
  key_parameters: true,
  verified_at: "2026-08-31T12:00:00+08:00",
};
const platformEvidence = {
  source_url: "https://platform.example/model",
  verification_status: "verified",
  price_scope_match: true,
  verified_at: "2026-08-31T12:05:00+08:00",
};

const verified = verifyExternalCandidate({
  candidate: { model_id: "external-demo", model_name: "示例 ADV" },
  official_evidence: officialEvidence,
  platform_price_evidence: platformEvidence,
});
assert.equal(verified.status, "verified_temporary_candidate");
assert.equal(verified.specific_recommendation_allowed, true);
assert.equal(verified.formal_recommendation_allowed, false);
assert.equal(verified.temporary_candidate_only, true);
assert.equal(verified.evidence_summary.official_source_url, officialEvidence.source_url);

const missingOfficialFact = verifyExternalCandidate({
  candidate: { model_id: "external-demo" },
  official_evidence: { ...officialEvidence, current_sale_status: false },
  platform_price_evidence: platformEvidence,
});
assert.equal(missingOfficialFact.specific_recommendation_allowed, false);
assert.ok(missingOfficialFact.missing_requirements.includes("official_current_sale_status"));

const scopeMismatch = verifyExternalCandidate({
  candidate: { model_id: "external-demo" },
  official_evidence: officialEvidence,
  platform_price_evidence: { ...platformEvidence, price_scope_match: false },
});
assert.equal(scopeMismatch.output_mode, "principles_only");
assert.ok(scopeMismatch.missing_requirements.includes("platform_price_scope_match"));

const priceConflict = verifyExternalCandidate({
  candidate: { model_id: "external-demo" },
  official_evidence: officialEvidence,
  platform_price_evidence: platformEvidence,
  price_conflict_type: "true_same_scope_conflict",
});
assert.equal(priceConflict.specific_recommendation_allowed, false);
assert.ok(priceConflict.missing_requirements.includes("unresolved_same_scope_price_conflict"));

console.log("external-candidate-verifier: 5 scenarios passed");
