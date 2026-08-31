import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const alphaPool = require("../knowledge_base_outputs/eligible_pool/alpha_pool_v0.1.json");
const alphaSemantic = require("../knowledge_base_outputs/semantic_enrichment/alpha_semantic_v0.2.json");
const { assessCandidateCoverage, budgetTier, selectDisplayCandidates } = require("../candidate-coverage.js");
const { shortlistModels } = require("../rules-engine.js");

assert.equal(budgetTier(14000, 30000), "entry");
assert.equal(budgetTier(20000, 30000), "balanced");
assert.equal(budgetTier(28000, 30000), "upgrade");

const scooterNeeds = {
  budget_cny: 30000,
  budget_type: "bare_vehicle_budget",
  usage: "commute",
  new_used_preference: "new",
  rider_experience: "beginner",
  vehicle_type: "踏板",
};
const scooterPool = shortlistModels(alphaPool, scooterNeeds, {
  allowUnapprovedPreview: true,
  semanticEnrichment: alphaSemantic,
});
const scooterCoverage = assessCandidateCoverage(scooterPool.candidates, scooterNeeds);
const scooterDisplay = selectDisplayCandidates(scooterPool.candidates, scooterNeeds);
assert.equal(scooterCoverage.status, "sufficient");
assert.equal(scooterCoverage.external_search_required, false);
assert.deepEqual(scooterDisplay.map((item) => item.budget_tier), ["entry", "balanced", "upgrade"]);
assert.ok(scooterDisplay.some((item) => item.budget_guard_price_cny >= 27000));

const narrowNeeds = { ...scooterNeeds, vehicle_type: "巡航", budget_cny: 18000 };
const narrowPool = shortlistModels(alphaPool, narrowNeeds, {
  allowUnapprovedPreview: true,
  semanticEnrichment: alphaSemantic,
});
const narrowCoverage = assessCandidateCoverage(narrowPool.candidates, narrowNeeds);
assert.equal(narrowCoverage.status, "insufficient");
assert.equal(narrowCoverage.external_search_required, true);
assert.ok(narrowCoverage.reasons.includes("candidate_count_below_3"));
assert.equal(narrowCoverage.search_request.vehicle_type, "巡航");

const thinCandidates = [
  { model_id: "a", vehicle_type: "踏板", budget_guard_price_cny: 12000 },
  { model_id: "b", vehicle_type: "踏板", budget_guard_price_cny: 15000 },
  { model_id: "c", vehicle_type: "踏板", budget_guard_price_cny: 17000 },
];
const thinCoverage = assessCandidateCoverage(thinCandidates, { budget_cny: 30000, usage: "commute" });
assert.equal(thinCoverage.external_search_required, true);
assert.ok(thinCoverage.reasons.includes("budget_upper_range_uncovered"));
assert.ok(thinCoverage.reasons.includes("vehicle_type_diversity_insufficient"));

console.log("candidate-coverage: 8 scenarios passed");
