import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadLocalEnv } = require("../server/load-local-env.js");
const { buildMotorcycleDiscoveryQuery, createBochaSearchClient } = require("../bocha-search-client.js");

loadLocalEnv();
if (!process.env.BOCHA_API_KEY) {
  console.error("Missing BOCHA_API_KEY in local .env");
  process.exit(1);
}

const client = createBochaSearchClient({
  apiKey: process.env.BOCHA_API_KEY,
  baseUrl: process.env.BOCHA_BASE_URL,
});
const query = buildMotorcycleDiscoveryQuery({
  budget_cny: 30000,
  usage: "commute",
  vehicle_type: "踏板",
});
const result = await client.search(query, { count: 3, freshness: "oneYear" });
console.log(JSON.stringify({
  provider: result.provider,
  status: result.status,
  result_count: result.results.length,
  raw_result_count: result.raw_result_count || 0,
  evidence_verified: result.evidence_verified,
  candidate_use_allowed: result.candidate_use_allowed,
  site_names: result.results.map((item) => item.site_name).filter(Boolean),
  error_code: result.error_code || null,
}, null, 2));
if (result.status !== "completed" || result.results.length === 0) process.exitCode = 1;
