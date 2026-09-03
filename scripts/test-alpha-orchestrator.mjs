import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const knowledgeBase = require("../knowledge_base_outputs/eligible_pool/first_batch_v1.json");
const semanticEnrichment = require("../knowledge_base_outputs/semantic_enrichment/first_batch_semantic_v0.1.json");
const { routeIntent, extractAlphaNeeds, runAlphaOrchestrator } = require("../alpha-orchestrator.js");
const dependencies = { knowledgeBase, semanticEnrichment };

assert.equal(routeIntent({ raw_text: "这台二手车是不是调表车" }), "used_text_risk");
assert.equal(routeIntent({ raw_text: "这款现在多少钱" }), "price_query");
assert.equal(routeIntent({ raw_text: "摩托车 ABS 有什么用" }), "motorcycle_general");
assert.equal(routeIntent({ raw_text: "ABS 和 TCS 有什么区别，新手选车有必要关注吗" }), "motorcycle_general");
assert.equal(routeIntent({ raw_text: "我是新手，请帮我选车" }), "beginner_recommendation");
assert.equal(routeIntent({ raw_text: "我还没骑过车怎么办", needs: { budget_cny: 30000, usage: "weekend", new_used_preference: "new" } }), "motorcycle_general");
assert.equal(routeIntent({ raw_text: "我去门店试乘试驾的时候应该注意些什么？" }), "motorcycle_general");
assert.equal(routeIntent({ raw_text: "我去门店试坐要注意什么？" }), "motorcycle_general");
assert.equal(routeIntent({ raw_text: "去门店应该注意什么？他会不会坑我？", needs: { budget_cny: 20000, usage: "commute" } }), "motorcycle_general");
assert.equal(routeIntent({ raw_text: "销售会不会套路我？", needs: { budget_cny: 20000 } }), "motorcycle_general");
assert.equal(routeIntent({ raw_text: "谢谢", needs: { budget_cny: 30000, usage: "weekend", new_used_preference: "new" } }), "general_brief_redirect");
assert.equal(routeIntent({ raw_text: "这是裸车预算", needs: { budget_cny: 30000 } }), "beginner_recommendation");
assert.equal(routeIntent({ raw_text: "你好，今天心情怎么样" }), "general_brief_redirect");

const extracted = extractAlphaNeeds({ raw_text: "2 万裸车预算，通勤用的新车踏板" });
assert.equal(extracted.budget_cny, 20000);
assert.equal(extracted.usage, "commute");
assert.equal(extracted.new_used_preference, "new");
assert.equal(extracted.vehicle_type, "踏板");

const chineseBudgetNeeds = extractAlphaNeeds({ raw_text: "预算两万元，主要上下班通勤" });
assert.equal(chineseBudgetNeeds.budget_cny, 20000);
assert.equal(chineseBudgetNeeds.usage, "commute");

const chineseBudgetQuestion = runAlphaOrchestrator({
  input: { raw_text: "预算两万元，主要上下班通勤" },
}, dependencies);
assert.equal(chineseBudgetQuestion.next_action, "ask_one_question");
assert.equal(chineseBudgetQuestion.sufficiency.next_question_field, "budget_type");

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

const preliminaryAfterTwoQuestions = runAlphaOrchestrator({
  input: { needs: { budget_cny: 20000, budget_type: "bare_vehicle_budget" } },
  conversation_state: { critical_question_count: 2 },
}, dependencies);
assert.equal(preliminaryAfterTwoQuestions.next_action, "show_development_preview");
assert.equal(preliminaryAfterTwoQuestions.sufficiency.recommendation_scope, "preliminary_candidates");
assert.deepEqual(preliminaryAfterTwoQuestions.sufficiency.missing_fields, ["usage", "new_used_preference"]);

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

console.log("alpha-orchestrator: 19 scenarios passed");
