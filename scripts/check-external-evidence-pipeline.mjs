import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadLocalEnv } = require("../server/load-local-env.js");
const { createBochaSearchClient } = require("../bocha-search-client.js");
const { createExternalEvidencePipeline } = require("../external-evidence-pipeline.js");
const { createWebEvidenceFetcher } = require("../web-evidence-fetcher.js");

loadLocalEnv();
if (!process.env.BOCHA_API_KEY) process.exit(2);
const searchClient = createBochaSearchClient({
  apiKey: process.env.BOCHA_API_KEY,
  baseUrl: process.env.BOCHA_BASE_URL,
});
const pipeline = createExternalEvidencePipeline({ searchClient, fetchEvidencePage: createWebEvidenceFetcher() });
const result = await pipeline({
  candidate_id: "external_春风_250clc_2026",
  brand: "春风",
  model_name: "250CL-C",
  trim_name: null,
  model_year: 2026,
  vehicle_type: "巡航",
  discovered_price_cny: 14980,
  discovery_status: "unverified_draft",
});
console.log(JSON.stringify({
  status: result.status,
  official_search_status: result.official_search_status,
  platform_search_status: result.platform_search_status,
  official_source_found: Boolean(result.official_source_url),
  platform_source_found: Boolean(result.platform_source_url),
  missing_requirements: result.verification?.missing_requirements || [],
  fetch_failures: result.fetch_failures,
  candidate_released: Boolean(result.candidate),
}, null, 2));
if (result.status === "verified_temporary_candidate") process.exitCode = 2;
