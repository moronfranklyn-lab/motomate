import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { evaluateCostGuard, DEFAULT_HARD_LIMIT_CNY } = require("../cost-guard.js");

assert.equal(DEFAULT_HARD_LIMIT_CNY, 50);

const withinLimit = evaluateCostGuard({ accumulated_model_cost_cny: 49 });
assert.equal(withinLimit.mode, "full");
assert.equal(withinLimit.paid_model_calls_allowed, true);
assert.equal(withinLimit.remaining_budget_cny, 1);

const exactLimit = evaluateCostGuard({ accumulated_model_cost_cny: 50 });
assert.equal(exactLimit.mode, "basic");
assert.equal(exactLimit.paid_model_calls_allowed, false);
assert.equal(exactLimit.rules_and_template_available, true);
assert.equal(exactLimit.history_available, true);
assert.equal(exactLimit.reason, "hard_limit_reached");

const aboveLimit = evaluateCostGuard({ accumulated_model_cost_cny: 52 });
assert.equal(aboveLimit.mode, "basic");
assert.equal(aboveLimit.remaining_budget_cny, 0);

const projectedOverrun = evaluateCostGuard({
  accumulated_model_cost_cny: 49,
  estimated_next_call_cost_cny: 1.5,
});
assert.equal(projectedOverrun.mode, "basic");
assert.equal(projectedOverrun.reason, "next_call_would_exceed_hard_limit");
assert.equal(projectedOverrun.projected_model_cost_cny, 50.5);

const missingCost = evaluateCostGuard({});
assert.equal(missingCost.status, "cost_data_unavailable");
assert.equal(missingCost.paid_model_calls_allowed, false);
assert.equal(missingCost.rules_and_template_available, true);

console.log("cost-guard: 5 scenarios passed");
