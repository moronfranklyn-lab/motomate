import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const suite = JSON.parse(readFileSync(new URL("../evaluations/golden/golden_cases_v0.1.json", import.meta.url), "utf8"));
const knowledgeBase = require("../knowledge_base_outputs/eligible_pool/mvp_eligible_pool_v0.1.json");
const semanticEnrichment = require("../knowledge_base_outputs/semantic_enrichment/mvp_semantic_v0.1.json");
const { runAlphaOrchestrator } = require("../alpha-orchestrator.js");
const { runRecommendationPipeline } = require("../recommendation-pipeline.js");
const { resolvePriceQuery } = require("../price-resolver.js");
const { analyzeUsedListing } = require("../used-text-risk-tool.js");
const { verifyExternalCandidate } = require("../external-candidate-verifier.js");
const { enforceExternalBudget } = require("../server/alpha-api.js");
const { evaluateCostGuard } = require("../cost-guard.js");

const dependencies = { knowledgeBase, semanticEnrichment };

function valueAtPath(value, path, missingAsNull = false) {
  let current = value;
  for (const segment of path.split(".")) {
    if (current === null || current === undefined || !(segment in Object(current))) {
      return missingAsNull ? null : undefined;
    }
    current = current[segment];
  }
  return current;
}

function execute(testCase) {
  if (testCase.executor === "orchestrator") return runAlphaOrchestrator(testCase.input, dependencies);
  if (testCase.executor === "pipeline") {
    return runRecommendationPipeline(knowledgeBase, testCase.input, { allowUnapprovedPreview: true, semanticEnrichment });
  }
  if (testCase.executor === "price") return resolvePriceQuery(testCase.input);
  if (testCase.executor === "used") return analyzeUsedListing(testCase.input);
  if (testCase.executor === "external_verifier") return verifyExternalCandidate(testCase.input);
  if (testCase.executor === "external_budget") return enforceExternalBudget(testCase.input.evidence_run, testCase.input.budget_cny);
  if (testCase.executor === "cost") return evaluateCostGuard(testCase.input);
  throw new Error(`unknown_executor:${testCase.executor}`);
}

function checkResult(result, check) {
  const actual = valueAtPath(result, check.path, check.missing_as_null === true);
  if (check.op === "equals") assert.deepEqual(actual, check.value);
  else if (check.op === "includes") assert.ok(Array.isArray(actual) && actual.includes(check.value));
  else if (check.op === "all_field_lte") {
    assert.ok(Array.isArray(actual) && actual.every((item) => Number(item?.[check.field]) <= check.value));
  } else if (check.op === "none_field_equals") {
    assert.ok(Array.isArray(actual) && actual.every((item) => item?.[check.field] !== check.value));
  } else {
    throw new Error(`unknown_check_op:${check.op}`);
  }
}

assert.equal(suite.schema_version, "motomate_golden_cases_v0.1");
assert.equal(suite.pool_version, knowledgeBase.pool_version);
assert.equal(suite.semantic_enrichment_version, semanticEnrichment.enrichment_version);
assert.equal(suite.cases.length, 50);
assert.deepEqual(
  suite.cases.map((item) => item.case_id),
  Array.from({ length: 50 }, (_, index) => `golden_${String(index + 1).padStart(3, "0")}`),
);
assert.equal(new Set(suite.cases.map((item) => item.case_id)).size, 50);

const results = [];
for (const testCase of suite.cases) {
  try {
    const result = execute(testCase);
    for (const check of testCase.checks) checkResult(result, check);
    results.push({ case_id: testCase.case_id, category: testCase.category, status: "passed" });
  } catch (error) {
    results.push({ case_id: testCase.case_id, category: testCase.category, status: "failed", reason: error.message });
  }
}

const counts = results.reduce((summary, result) => {
  summary[result.status] += 1;
  return summary;
}, { passed: 0, failed: 0 });
const categoryCounts = results.reduce((summary, result) => {
  const category = summary[result.category] || { passed: 0, failed: 0 };
  category[result.status] += 1;
  summary[result.category] = category;
  return summary;
}, {});

console.log(JSON.stringify({
  suite: suite.schema_version,
  total: results.length,
  counts,
  category_counts: categoryCounts,
  results,
}, null, 2));

if (counts.failed > 0) process.exitCode = 1;
