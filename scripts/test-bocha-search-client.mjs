import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildMotorcycleDiscoveryQuery, buildTargetedDiscoveryQueries, classifySource, createBochaSearchClient, isMotorcycleRelevant, normalizeSearchResults } = require("../bocha-search-client.js");

const query = buildMotorcycleDiscoveryQuery({ budget_cny: 30000, usage: "commute", vehicle_type: "踏板" });
assert.match(query, /3万元以内/);
assert.match(query, /城市通勤/);
assert.match(query, /踏板/);
const targetedQueries = buildTargetedDiscoveryQueries({ budget_cny: 40000, usage: "touring", vehicle_type: "踏板" });
assert.equal(targetedQueries.length, 2);
assert.match(targetedQueries[0], /豪爵.*踏板/);
assert.match(targetedQueries[1], /雅马哈.*踏板/);

const normalized = normalizeSearchResults({ data: { webPages: { value: [
  { name: "官方摩托车型", url: "https://example.com/model", siteName: "示例官网", snippet: "配置参数与价格" },
  { name: "本地地址", url: "http://127.0.0.1/private", siteName: "无效" },
] } } });
assert.equal(normalized.length, 1);
assert.equal(normalized[0].site_name, "示例官网");
assert.equal(isMotorcycleRelevant(normalized[0]), true);
assert.equal(isMotorcycleRelevant({ title: "前端文档", site_name: "技术站", snippet: "配置参数" }), false);
assert.equal(classifySource("https://m.58moto.com/brand/199"), "platform_motuofan");
assert.equal(classifySource("https://www.autohome.com.cn/motorbike/"), "platform_autohome");

let capturedRequest;
const client = createBochaSearchClient({
  apiKey: "test-key",
  fetchImpl: async (url, options) => {
    capturedRequest = { url, options };
    return { ok: true, json: async () => ({ code: 200, data: { webPages: { value: [
      { name: "踏板摩托车型页", url: "https://example.com/bike", siteName: "官网", snippet: "指导价与配置参数" },
    ] } } }) };
  },
});
const result = await client.search(query);
assert.equal(capturedRequest.url, "https://api.bochaai.com/v1/web-search");
assert.match(capturedRequest.options.headers.authorization, /^Bearer /);
assert.equal(result.status, "completed");
assert.equal(result.results.length, 1);
assert.equal(result.candidate_use_allowed, false);
assert.equal(result.evidence_verified, false);

const failedClient = createBochaSearchClient({ apiKey: "test-key", fetchImpl: async () => ({ ok: false, status: 429 }) });
const failed = await failedClient.search(query);
assert.equal(failed.status, "failed");
assert.equal(failed.results.length, 0);

console.log("bocha-search-client: 17 scenarios passed");
