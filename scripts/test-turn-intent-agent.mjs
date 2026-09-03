import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createTurnIntentAgent, enforceDecision } = require("../turn-intent-agent.js");

function clientFor(payload) { return { async createJsonCompletion() { return { content: JSON.stringify(payload), model: "deepseek-v4-flash", usage: { total_tokens: 60 } }; } }; }

const open = await createTurnIntentAgent({ client: clientFor({ intent: "dealer_advice", card_action: "none", confidence: 0.96, reason: "询问门店风险" }) }).decide({ raw_text: "他会不会坑我", current_needs: {}, deterministic_intent: "general_brief_redirect" });
assert.equal(open.orchestrator_intent, "motorcycle_general");
assert.equal(open.card_authorized, false);

const recommend = await createTurnIntentAgent({ client: clientFor({ intent: "recommendation_request", card_action: "show_cards", confidence: 0.95, reason: "明确要求选车" }) }).decide({ raw_text: "2 万通勤，帮我选车", current_needs: { budget_cny: 20000 } });
assert.equal(recommend.card_authorized, true);

const badCard = enforceDecision({ intent: "dealer_advice", card_action: "show_cards", confidence: 0.9 }, { raw_text: "门店会坑我吗", current_needs: {} });
assert.equal(badCard.card_authorized, false);

const historyCannotAuthorize = await createTurnIntentAgent({ client: clientFor({ intent: "recommendation_request", card_action: "show_cards", confidence: 0.6, reason: "误用历史需求" }) }).decide({ raw_text: "他会不会坑我", current_needs: {}, confirmed_needs: { budget_cny: 20000 } });
assert.equal(historyCannotAuthorize.card_authorized, false);

console.log("turn-intent-agent: 4 scenarios passed");
