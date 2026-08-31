import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadLocalEnv } = require("../server/load-local-env.js");
const { createBochaSearchClient } = require("../bocha-search-client.js");
const { createExternalEvidencePipeline } = require("../external-evidence-pipeline.js");
const { createWebEvidenceFetcher } = require("../web-evidence-fetcher.js");

loadLocalEnv();
if (!process.env.BOCHA_API_KEY) process.exit(2);

const pipeline = createExternalEvidencePipeline({
  searchClient: createBochaSearchClient({
    apiKey: process.env.BOCHA_API_KEY,
    baseUrl: process.env.BOCHA_BASE_URL,
  }),
  fetchEvidencePage: createWebEvidenceFetcher(),
});

const result = await pipeline({
  candidate_id: "external_haojue_tvl350_2026",
  brand: "豪爵",
  model_name: "TVL350",
  trim_name: null,
  model_year: 2026,
  vehicle_type: "踏板",
  discovered_price_cny: 28980,
  discovery_status: "unverified_draft",
});

console.log(JSON.stringify({
  status: result.status,
  official_source_url: result.official_source_url,
  platform_source_url: result.platform_source_url,
  evidence_attempts: result.evidence_attempts,
  missing_requirements: result.verification?.missing_requirements || [],
  candidate_released: Boolean(result.candidate),
  candidate_scope: result.candidate ? {
    candidate_id: result.candidate.candidate_id,
    trim_name: result.candidate.trim_name,
    trim_scope_method: result.candidate.trim_scope_method,
    budget_guard_price_cny: result.candidate.budget_guard_price_cny,
    formal_recommendation_allowed: result.verification.formal_recommendation_allowed,
  } : null,
}, null, 2));

if (result.status !== "verified_temporary_candidate"
  || result.candidate?.trim_name !== "扶手版"
  || result.candidate?.trim_scope_method !== "official_price_trim_pair"
  || result.verification.formal_recommendation_allowed !== false) {
  process.exitCode = 1;
}
