import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createConversationAgent, SYSTEM_PROMPT } = require("../conversation-agent.js");
assert.match(SYSTEM_PROMPT, /年轻懂车朋友/);
assert.match(SYSTEM_PROMPT, /我已经理解了/);

function clientFor(payload) {
  return { async createJsonCompletion() { return { content: JSON.stringify(payload), model: "deepseek-v4-flash", usage: { total_tokens: 100 } }; } };
}

const context = { confirmed_needs: { budget_cny: 20000, usage: "commute" }, missing_fields: ["budget_type", "new_used_preference"], allowed_actions: ["ask_one_question"] };
const valid = await createConversationAgent({ client: clientFor({ assistant_message: "明白，你主要用于上下班通勤，预算约两万元。这笔预算是裸车预算，还是包含保险和上牌的总预算？", proposed_action: "ask_one_question", question_field: "budget_type" }) }).decide(context);
assert.equal(valid.status, "completed");
assert.equal(valid.question_field, "budget_type");

const escaped = await createConversationAgent({ client: clientFor({ assistant_message: "你身高多少？", proposed_action: "ask_one_question", question_field: "height" }) }).decide(context);
assert.equal(escaped.status, "fallback");

const premature = await createConversationAgent({ client: clientFor({ assistant_message: "我现在开始推荐。", proposed_action: "recommend", question_field: null }) }).decide(context);
assert.equal(premature.status, "fallback");

const readyContext = { confirmed_needs: { budget_cny: 20000, budget_type: "bare_vehicle_budget", usage: "commute", new_used_preference: "new" }, missing_fields: [], allowed_actions: ["recommend"] };
const ready = await createConversationAgent({ client: clientFor({ assistant_message: "需求已经清楚了，我先按通勤和裸车预算为你筛选，你随时可以修改条件。", proposed_action: "recommend", question_field: null }) }).decide(readyContext);
assert.equal(ready.status, "completed");

const guaranteed = await createConversationAgent({ client: clientFor({ assistant_message: "闭眼买，绝对没问题。", proposed_action: "recommend", question_field: null }) }).decide(readyContext);
assert.equal(guaranteed.status, "fallback");

console.log("conversation-agent: 5 scenarios passed");
