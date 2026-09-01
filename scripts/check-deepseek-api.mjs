import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadLocalEnv } = require("../server/load-local-env.js");
const { createDeepSeekClient } = require("../deepseek-client.js");
const { createNeedExtractor } = require("../need-extractor.js");
const { extractAlphaNeeds } = require("../alpha-orchestrator.js");

loadLocalEnv();

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error(JSON.stringify({ ok: false, error_code: "deepseek_api_key_missing" }));
  process.exit(1);
}

const client = createDeepSeekClient({
  apiKey,
  model: process.env.DEEPSEEK_MODEL,
  baseUrl: process.env.DEEPSEEK_BASE_URL,
  timeoutMs: 12000,
});
const extractor = createNeedExtractor({ client, fallbackExtractor: extractAlphaNeeds });
const result = await extractor.extract({
  raw_text: "预算三万元落地，主要在市区上下班，偶尔周末骑一骑，只考虑新车。",
});

console.log(JSON.stringify({
  ok: result.status === "completed",
  status: result.status,
  provider: result.provider,
  model: result.model,
  needs: result.needs,
  extracted_fields: result.extracted_fields,
  usage: result.usage,
  error_code: result.error_code,
}, null, 2));

if (result.status !== "completed") process.exit(1);
