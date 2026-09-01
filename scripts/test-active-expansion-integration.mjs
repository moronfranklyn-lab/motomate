import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pool = require("../knowledge_base_outputs/eligible_pool/active_runtime_pool_v0.1.json");
const semantic = require("../knowledge_base_outputs/semantic_enrichment/active_runtime_semantic_v0.1.json");
const { runRecommendationPipeline } = require("../recommendation-pipeline.js");
const { runAlphaOrchestrator } = require("../alpha-orchestrator.js");

const street = runRecommendationPipeline(pool, {
  budget_cny: 40000,
  budget_type: "bare_vehicle_budget",
  usage: "weekend",
  vehicle_type: "街车",
  new_used_preference: "new",
}, { allowUnapprovedPreview: true, semanticEnrichment: semantic });
assert.equal(street.status, "development_preview");
assert.ok(street.candidate_pool.candidates.some((candidate) => candidate.model_id === "cfmoto_675nk_current_standard"));
assert.equal(street.formal_recommendation_allowed, false);

const sport = runAlphaOrchestrator({ input: { needs: {
  budget_cny: 40000,
  budget_type: "bare_vehicle_budget",
  usage: "weekend",
  vehicle_type: "跑车",
  new_used_preference: "new",
} } }, { knowledgeBase: pool, semanticEnrichment: semantic });
assert.equal(sport.next_action, "show_development_preview");
assert.ok(sport.result.display_candidates.some((candidate) => candidate.model_id === "cfmoto_675srr_current_standard"));
assert.equal(sport.formal_recommendation_allowed, false);

const mvp = runRecommendationPipeline(pool, {
  budget_cny: 30000,
  budget_type: "bare_vehicle_budget",
  usage: "commute",
  vehicle_type: "踏板",
  new_used_preference: "new",
}, { allowUnapprovedPreview: true, semanticEnrichment: semantic });
assert.ok(mvp.display_candidates.length > 0);
assert.ok(mvp.display_candidates.every((candidate) => candidate.budget_guard_price_cny <= 30000));
assert.ok(mvp.display_candidates.every((candidate) => !candidate.model_id.startsWith("cfmoto_675")));

const adventure = runRecommendationPipeline(pool, {
  budget_cny: 60000,
  budget_type: "bare_vehicle_budget",
  usage: "touring",
  vehicle_type: "拉力",
  new_used_preference: "new",
}, { allowUnapprovedPreview: true, semanticEnrichment: semantic });
assert.equal(adventure.status, "development_preview");
assert.ok(adventure.display_candidates.some((candidate) => [
  "cfmoto_700mt_current_loboo",
  "cfmoto_800mtx_current_standard",
  "cfmoto_1000mtx_current_standard",
  "cfmoto_800mtes_current_standard",
  "cfmoto_800mtexplore_current_standard",
].includes(candidate.model_id)));
assert.equal(adventure.formal_recommendation_allowed, false);

console.log("active-expansion-integration: 4 scenarios passed");
