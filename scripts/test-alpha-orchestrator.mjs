import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const knowledgeBase = require("../knowledge_base_outputs/eligible_pool/first_batch_v1.json");
const semanticEnrichment = require("../knowledge_base_outputs/semantic_enrichment/first_batch_semantic_v0.1.json");
const { routeIntent, extractAlphaNeeds, runAlphaOrchestrator } = require("../alpha-orchestrator.js");
const dependencies = { knowledgeBase, semanticEnrichment };

assert.equal(routeIntent({ raw_text: "这台二手车是不是调表车" }), "used_text_risk");
assert.equal(routeIntent({ raw_text: "这款现在多少钱" }), "price_query");
assert.equal(routeIntent({ raw_text: "教我改装排气" }), "out_of_scope");

const extracted = extractAlphaNeeds({ raw_text: "2 万裸车预算，通勤用的新车踏板" });
assert.equal(extracted.usage, "commute");
assert.equal(extracted.new_used_preference, "new");
assert.equal(extracted.vehicle_type, "踏板");

const question = runAlphaOrchestrator({
  input: { raw_text: "预算 2 万，想买踏板" },
}, dependencies);
assert.equal(question.next_action, "ask_one_question");
assert.equal(question.sufficiency.next_question_field, "budget_type");

const recommendation = runAlphaOrchestrator({
  input: {
    needs: {
      budget_cny: 20000,
      budget_type: "bare_vehicle_budget",
      usage: "commute",
      new_used_preference: "new",
      vehicle_type: "踏板",
    },
  },
}, dependencies);
assert.equal(recommendation.run_mode, "development_preview");
assert.equal(recommendation.formal_recommendation_allowed, false);
assert.equal(recommendation.result.candidate_pool.status, "development_preview");
assert.ok(recommendation.result.recommendations.length > 0);

const totalBudgetRecommendation = runAlphaOrchestrator({
  input: {
    needs: {
      budget_cny: 30000,
      budget_type: "total_purchase_budget",
      usage: "commute",
      new_used_preference: "new",
      vehicle_type: "踏板",
    },
  },
}, dependencies);
assert.equal(totalBudgetRecommendation.result.candidate_pool.budget_cny, 26500);
assert.ok(totalBudgetRecommendation.result.candidate_pool.candidates.every((candidate) => candidate.budget_guard_price_cny <= 26500));
assert.equal(totalBudgetRecommendation.result.candidate_pool.candidates.some((candidate) => candidate.model_name === "NMAX155"), false);

const used = runAlphaOrchestrator({
  input: { intent: "used_text_risk", model: "示例车型", listing_price_cny: 16000 },
}, dependencies);
assert.equal(used.next_action, "show_used_text_guidance");
assert.ok(used.result.missing_fields.includes("year"));

const stalePrice = runAlphaOrchestrator({
  input: { intent: "price_query", price_status: "stale", last_verified_at: "2026-08-01T00:00:00+08:00" },
}, dependencies);
assert.equal(stalePrice.result.status, "stale_while_revalidate");

const basicMode = runAlphaOrchestrator({
  accumulated_model_cost_cny: 50,
  input: {
    needs: {
      budget_cny: 20000,
      budget_type: "bare_vehicle_budget",
      usage: "commute",
      new_used_preference: "new",
    },
  },
}, dependencies);
assert.equal(basicMode.cost_guard.mode, "basic");
assert.equal(basicMode.result.recommendations.length > 0, true);

console.log("alpha-orchestrator: 11 scenarios passed");
