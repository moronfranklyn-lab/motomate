import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createNeedExtractor, parseModelJson } = require("../need-extractor.js");
const { createDeepSeekClient } = require("../deepseek-client.js");

assert.throws(() => createDeepSeekClient(), /deepseek_api_key_missing/);

let capturedRequest = null;
const deepSeekClient = createDeepSeekClient({
  apiKey: "test-key",
  fetchImpl: async (url, options) => {
    capturedRequest = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      model: "deepseek-v4-flash",
      choices: [{ message: { content: '{"usage":"commute"}' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }), { status: 200 });
  },
});
const clientResult = await deepSeekClient.createJsonCompletion({ systemPrompt: "system", userPrompt: "user" });
assert.equal(capturedRequest.url, "https://api.deepseek.com/chat/completions");
assert.equal(capturedRequest.body.model, "deepseek-v4-flash");
assert.deepEqual(capturedRequest.body.response_format, { type: "json_object" });
assert.deepEqual(capturedRequest.body.thinking, { type: "disabled" });
assert.equal(clientResult.model, "deepseek-v4-flash");

assert.deepEqual(parseModelJson(JSON.stringify({
  budget_cny: 30000,
  budget_type: "total_purchase_budget",
  usage: "commute",
  new_used_preference: "new",
  vehicle_type: "踏板",
})), {
  budget_cny: 30000,
  budget_type: "total_purchase_budget",
  usage: "commute",
  new_used_preference: "new",
  vehicle_type: "踏板",
});

assert.deepEqual(parseModelJson(JSON.stringify({
  budget_cny: 20,
  budget_type: "unknown",
  usage: "race",
  new_used_preference: "new_first",
  vehicle_type: "飞机",
})), {
  budget_cny: null,
  budget_type: null,
  usage: null,
  new_used_preference: null,
  vehicle_type: null,
});

const client = {
  async createJsonCompletion() {
    return {
      content: JSON.stringify({
        budget_cny: 30000,
        budget_type: "total_purchase_budget",
        usage: "commute",
        new_used_preference: "new",
        vehicle_type: "踏板",
      }),
      model: "deepseek-v4-flash",
      usage: { prompt_tokens: 100, completion_tokens: 40 },
    };
  },
};

const extractor = createNeedExtractor({ client });
const completed = await extractor.extract({
  raw_text: "三万落地，主要上下班，想买新踏板",
  needs: { vehicle_type: "街车" },
});
assert.equal(completed.status, "completed");
assert.equal(completed.needs.budget_cny, 30000);
assert.equal(completed.needs.vehicle_type, "街车");
assert.equal(completed.extracted_fields.includes("vehicle_type"), false);

const failedExtractor = createNeedExtractor({
  client: { async createJsonCompletion() { return { content: "not json", model: "deepseek-v4-flash" }; } },
  fallbackExtractor(input) { return { ...(input.needs || {}), usage: "commute" }; },
});
const fallback = await failedExtractor.extract({ raw_text: "通勤", needs: {} });
assert.equal(fallback.status, "fallback");
assert.equal(fallback.error_code, "model_json_parse_failed");
assert.equal(fallback.needs.usage, "commute");

console.log("need-extractor: 7 scenarios passed");
