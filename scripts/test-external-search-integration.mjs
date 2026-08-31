import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createAlphaApi, enforceExternalBudget, selectEvidenceCandidate } = require("../server/alpha-api.js");

assert.equal(selectEvidenceCandidate([{ model_name: "DL150", vehicle_type: null, registry_match: null }], { vehicle_type: "踏板" }), null);
assert.equal(selectEvidenceCandidate([{ model_name: "TVL350", vehicle_type: "踏板", registry_match: null }], { vehicle_type: "踏板" }).model_name, "TVL350");
const overBudgetEvidence = enforceExternalBudget({
  status: "verified_temporary_candidate",
  candidate: { budget_guard_price_cny: 20000 },
  verification: { status: "verified_temporary_candidate", missing_requirements: [] },
}, 18000);
assert.equal(overBudgetEvidence.status, "external_verification_required");
assert.equal(overBudgetEvidence.candidate, null);
assert.ok(overBudgetEvidence.verification.missing_requirements.includes("within_user_budget"));

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "motomate-search-integration-"));
let receivedQuery = null;
const externalSearchClient = {
  async search(query) {
    receivedQuery = query;
    return {
      schema_version: "motomate_external_discovery_v0.1",
      provider: "bocha_web_search",
      status: "completed",
      results: [{
        title: "14980元，春风动力250CL-C 2026款巡航摩托车上市",
        url: "https://example.com/bike",
        site_name: "示例来源",
        snippet: "春风动力发布250CL-C 2026款，售价14980元",
      }],
      evidence_verified: false,
      candidate_use_allowed: false,
    };
  },
};
let receivedEvidenceCandidate = null;
const externalEvidencePipeline = async (candidate) => {
  receivedEvidenceCandidate = candidate;
  return {
    status: "verified_temporary_candidate",
    candidate,
    verification: { formal_recommendation_allowed: false },
  };
};
const { server } = createAlphaApi({
  databasePath: path.join(directory, "test.sqlite"),
  externalSearchClient,
  externalEvidencePipeline,
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
  const response = await fetch(`${baseUrl}/api/alpha/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session_id: "search_integration_test",
      input: { needs: {
        budget_cny: 18000,
        budget_type: "bare_vehicle_budget",
        usage: "commute",
        new_used_preference: "new",
        vehicle_type: "巡航",
      } },
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(receivedQuery, /巡航/);
  assert.equal(body.result.result.candidate_coverage.external_search_required, true);
  assert.equal(body.result.result.external_discovery.status, "completed");
  assert.equal(body.result.result.external_discovery.candidate_use_allowed, false);
  assert.equal(body.result.result.external_discovery.candidate_drafts[0].model_name, "250CL-C");
  assert.equal(receivedEvidenceCandidate.model_name, "250CL-C");
  assert.equal(body.result.result.temporary_candidates.length, 1);
  assert.ok(body.result.result.candidate_pool.candidates.some((item) => item.model_name === "CU250Ⅱ代"));
  assert.equal(body.result.result.closest_candidates_separate, false);
  console.log("external-search-integration: 9 scenarios passed");
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  fs.rmSync(directory, { recursive: true, force: true });
}
