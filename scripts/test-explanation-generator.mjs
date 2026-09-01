import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createExplanationGenerator } = require("../explanation-generator.js");
const candidates = [{
  model_id: "sample_scooter",
  brand: "示例",
  model_name: "S150",
  trim_name: "标准版",
  vehicle_type: "踏板",
  budget_guard_price_cny: 15000,
  seat_height_mm: 760,
  curb_weight_kg: 140,
  max_power_kw: 10.5,
  abs: "双通道",
  tcs: "有",
  reason_codes: ["vehicle_type_match", "within_budget"],
}];

function clientFor(payload) {
  return { async createJsonCompletion() { return { content: JSON.stringify(payload), model: "deepseek-v4-flash", usage: { total_tokens: 200 } }; } };
}

const validDraft = { recommendations: [{
  model_id: "sample_scooter",
  summary: "适合作为通勤方向的内部预览候选。",
  pros: ["踏板车型符合已确认方向。", "预算保护价为15000元。"],
  cons: ["仍需线下确认实际骑姿。"],
  fit: ["主要用于城市通勤的人。"],
  not_fit: ["要求长途能力已经得到充分核验的人。"],
  next_steps: ["到店试坐并核对当前配置。"],
}] };
const completed = await createExplanationGenerator({ client: clientFor(validDraft) }).generate({ needs: { usage: "commute" }, candidates });
assert.equal(completed.status, "completed");
assert.equal(completed.recommendations[0].rank, "首选");
assert.match(completed.recommendations[0].caveats[0], /内部 Alpha/);

const modelNameNumber = structuredClone(validDraft);
modelNameNumber.recommendations[0].summary = "S150适合作为通勤方向的内部预览候选。";
const modelNameNumberResult = await createExplanationGenerator({ client: clientFor(modelNameNumber) }).generate({ candidates });
assert.equal(modelNameNumberResult.status, "completed");

const statedBudget = structuredClone(validDraft);
statedBudget.recommendations[0].summary = "符合用户明确提供的25000元预算范围。";
const statedBudgetResult = await createExplanationGenerator({ client: clientFor(statedBudget) }).generate({ needs: { budget_cny: 25000 }, candidates });
assert.equal(statedBudgetResult.status, "completed");

const escaped = structuredClone(validDraft);
escaped.recommendations[0].model_id = "outside_pool";
const escapedResult = await createExplanationGenerator({ client: clientFor(escaped) }).generate({ candidates });
assert.equal(escapedResult.status, "fallback");
assert.equal(escapedResult.error_code, "result_guardrail_failed");

const hallucinated = structuredClone(validDraft);
hallucinated.recommendations[0].pros = ["极速达到180公里。"];
const hallucinatedResult = await createExplanationGenerator({ client: clientFor(hallucinated) }).generate({ candidates });
assert.equal(hallucinatedResult.status, "fallback");
assert.ok(hallucinatedResult.validation.violations.some((item) => item.code === "explanation_unapproved_number"));

const guaranteed = structuredClone(validDraft);
guaranteed.recommendations[0].summary = "闭眼买，绝对没问题。";
const guaranteedResult = await createExplanationGenerator({ client: clientFor(guaranteed) }).generate({ candidates });
assert.equal(guaranteedResult.status, "fallback");

const invalidJson = await createExplanationGenerator({ client: { async createJsonCompletion() { return { content: "bad json" }; } } }).generate({ candidates });
assert.equal(invalidJson.error_code, "model_json_parse_failed");

console.log("explanation-generator: 7 scenarios passed");
