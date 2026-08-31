import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { normalizeBudget, assessSufficiency, advanceConversation } = require("../decision-core.js");

const totalBudget = normalizeBudget({
  budget_cny: 30000,
  budget_type: "total_purchase_budget",
});
assert.equal(totalBudget.status, "ready");
assert.deepEqual(totalBudget.available_bare_vehicle_budget_cny, { min: 22800, max: 26500 });
assert.equal(totalBudget.filter_budget_cny, 26500);
assert.equal(totalBudget.backup_overrun_limit_ratio, 0.05);

const bareBudget = normalizeBudget({
  budget_cny: 20000,
  budget_type: "bare_vehicle_budget",
});
assert.deepEqual(bareBudget.available_bare_vehicle_budget_cny, { min: 20000, max: 20000 });
assert.equal(bareBudget.filter_budget_cny, 20000);

const ambiguousTextBudget = normalizeBudget({ raw_text: "3 万够吗" });
assert.equal(ambiguousTextBudget.input_budget_cny, 30000);
assert.equal(ambiguousTextBudget.status, "needs_budget_type");

const missingPreference = assessSufficiency({
  budget_cny: 20000,
  budget_type: "bare_vehicle_budget",
  usage: "commute",
});
assert.equal(missingPreference.next_question_field, "new_used_preference");
assert.match(missingPreference.next_question, /新车、二手/);

const ready = assessSufficiency({
  budget_cny: 20000,
  budget_type: "bare_vehicle_budget",
  usage: "commute",
  new_used_preference: "new",
});
assert.equal(ready.status, "ready_for_recommendation");
assert.equal(ready.next_question, null);

const questionLimit = advanceConversation(
  { budget_cny: 20000, budget_type: "bare_vehicle_budget" },
  { critical_question_count: 3 },
);
assert.equal(questionLimit.status, "partial_advice_only");
assert.equal(questionLimit.specific_recommendation_allowed, false);
assert.equal(questionLimit.question_count_in_turn, 0);

const oneQuestion = advanceConversation({});
assert.equal(oneQuestion.question_count_in_turn, 1);
assert.equal(oneQuestion.questions.length, 1);
assert.equal(oneQuestion.next_question_field, "budget");

console.log("decision-core: 7 scenarios passed");
