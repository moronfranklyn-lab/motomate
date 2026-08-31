import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const suite = JSON.parse(readFileSync(new URL("../evaluations/smoke/smoke_cases_v0.1.json", import.meta.url), "utf8"));
const knowledgeBase = require("../knowledge_base_outputs/eligible_pool/first_batch_v1.json");
const semanticEnrichment = require("../knowledge_base_outputs/semantic_enrichment/first_batch_semantic_v0.1.json");
const { shortlistModels } = require("../rules-engine.js");
const { normalizeBudget, assessSufficiency, advanceConversation } = require("../decision-core.js");
const { runRecommendationPipeline } = require("../recommendation-pipeline.js");
const { validateCandidatePoolOutput } = require("../result-validator.js");
const { resolvePriceQuery } = require("../price-resolver.js");
const { analyzeUsedListing } = require("../used-text-risk-tool.js");
const { evaluateCostGuard } = require("../cost-guard.js");
const { verifyExternalCandidate } = require("../external-candidate-verifier.js");

const IMPLEMENTED_MODULES = new Set([
  "rules_engine",
  "budget_normalizer",
  "sufficiency_checker",
  "conversation_state",
  "recommendation_pipeline",
  "price_resolver",
  "result_validator",
  "used_text_risk_tool",
  "cost_guard",
  "external_candidate_verifier",
]);

function validateContract() {
  assert.equal(suite.schema_version, "motomate_smoke_cases_v0.1");
  assert.equal(suite.cases.length, 20);
  const ids = suite.cases.map((testCase) => testCase.case_id);
  assert.equal(new Set(ids).size, 20);
  assert.deepEqual(ids, Array.from({ length: 20 }, (_, index) => `smoke_${String(index + 1).padStart(3, "0")}`));
  for (const testCase of suite.cases) {
    assert.equal(typeof testCase.scenario, "string");
    assert.equal(typeof testCase.implemented_by, "string");
    assert.ok(testCase.input && typeof testCase.input === "object");
    assert.ok(testCase.expected && typeof testCase.expected === "object");
  }
}

function runRulesEngineCase(testCase) {
  const preview = testCase.case_id !== "smoke_011";
  const options = preview
    ? { allowUnapprovedPreview: true, semanticEnrichment }
    : {};
  const result = shortlistModels(knowledgeBase, testCase.input, options);

  switch (testCase.case_id) {
    case "smoke_001":
      assert.equal(result.status, "development_preview");
      assert.equal(result.recommendation_allowed, false);
      assert.equal(result.semantic_score_user_visible, false);
      assert.ok(result.candidates.every((candidate) => candidate.review_status !== "approved"));
      break;
    case "smoke_002":
      assert.ok(result.candidate_count > 0);
      assert.ok(result.candidates.every((candidate) => candidate.budget_guard_price_cny <= 20000));
      assert.ok(result.candidates.every((candidate) => candidate.vehicle_type === "踏板"));
      break;
    case "smoke_009":
      assert.equal(result.candidate_count, testCase.expected.candidate_count);
      assert.equal(result.candidates[0].model_name, testCase.expected.first_model_name);
      assert.equal(result.candidates[0].trim_name, testCase.expected.first_trim_name);
      break;
    case "smoke_010":
    case "smoke_011":
      assert.equal(result.candidate_count, testCase.expected.candidate_count);
      assert.equal(result.status, testCase.expected.status);
      if ("recommendation_allowed" in testCase.expected) {
        assert.equal(result.recommendation_allowed, testCase.expected.recommendation_allowed);
      }
      break;
    default:
      throw new Error(`No rules-engine runner for ${testCase.case_id}`);
  }
}

function runDecisionCoreCase(testCase) {
  switch (testCase.case_id) {
    case "smoke_003": {
      const result = normalizeBudget(testCase.input);
      assert.equal(result.status, "needs_budget_type");
      assert.equal(result.next_question_field, testCase.expected.question_field);
      break;
    }
    case "smoke_004":
    case "smoke_005":
    case "smoke_006": {
      const result = assessSufficiency(testCase.input);
      assert.equal(result.next_action, testCase.expected.next_action);
      if (testCase.expected.question_field) {
        assert.equal(result.next_question_field, testCase.expected.question_field);
        assert.equal(typeof result.next_question, "string");
      }
      if (testCase.expected.no_silent_default) {
        assert.equal(result.budget.status, "ready");
        assert.equal(result.next_question_field, "new_used_preference");
      }
      if ("extra_question_count" in testCase.expected) {
        assert.equal(result.next_question, null);
        assert.equal(testCase.expected.extra_question_count, 0);
      }
      break;
    }
    case "smoke_007": {
      const result = advanceConversation(testCase.input);
      assert.ok(result.question_count_in_turn <= testCase.expected.max_questions_in_turn);
      assert.equal(result.questions.length, result.question_count_in_turn);
      break;
    }
    case "smoke_008": {
      const result = advanceConversation(testCase.input, {
        critical_question_count: testCase.input.critical_question_count,
      });
      assert.equal(result.next_action, testCase.expected.next_action);
      assert.equal(result.specific_recommendation_allowed, testCase.expected.specific_recommendation_allowed);
      assert.equal(result.question_count_in_turn, 0);
      break;
    }
    default:
      throw new Error(`No decision-core runner for ${testCase.case_id}`);
  }
}

function runRecommendationPipelineCase(testCase) {
  switch (testCase.case_id) {
    case "smoke_012": {
      const result = runRecommendationPipeline(knowledgeBase, testCase.input, {
        allowUnapprovedPreview: true,
        semanticEnrichment,
      });
      assert.equal(result.formal_recommendation_allowed, testCase.expected.formal_recommendation_allowed);
      assert.equal(result.closest_candidates_separate, testCase.expected.closest_candidates_separate);
      assert.equal(result.condition_auto_relaxed, testCase.expected.condition_auto_relaxed);
      assert.ok(result.closest_candidates.length > 0);
      assert.ok(result.closest_candidates.every((candidate) => candidate.unmet_conditions.length > 0));
      break;
    }
    default:
      throw new Error(`No recommendation-pipeline runner for ${testCase.case_id}`);
  }
}

function runResultValidatorCase(testCase) {
  switch (testCase.case_id) {
    case "smoke_016": {
      const candidatePool = shortlistModels(
        knowledgeBase,
        { budget_cny: 30000 },
        { allowUnapprovedPreview: true, semanticEnrichment },
      );
      const result = validateCandidatePoolOutput(testCase.input, candidatePool);
      assert.equal(result.validation_status, testCase.expected.validation_status);
      assert.equal(result.output_blocked, testCase.expected.output_blocked);
      assert.ok(result.violations.some((violation) => violation.code === "candidate_pool_escape"));
      break;
    }
    default:
      throw new Error(`No result-validator runner for ${testCase.case_id}`);
  }
}

function runPriceResolverCase(testCase) {
  const result = resolvePriceQuery(testCase.input);
  switch (testCase.case_id) {
    case "smoke_014":
      assert.equal(result.show_stale_value, testCase.expected.show_stale_value);
      assert.equal(result.show_refresh_status, testCase.expected.show_refresh_status);
      assert.equal(result.model_memory_price_forbidden, testCase.expected.model_memory_price_forbidden);
      assert.equal(result.last_verified_at, testCase.input.last_verified_at);
      break;
    case "smoke_015":
      assert.equal(result.first_choice_allowed, testCase.expected.first_choice_allowed);
      assert.equal(result.show_as_price_check_candidate, testCase.expected.show_as_price_check_candidate);
      assert.equal(result.conflict_type, testCase.input.price_conflict_type);
      break;
    default:
      throw new Error(`No price-resolver runner for ${testCase.case_id}`);
  }
}

function runUsedTextRiskCase(testCase) {
  const result = analyzeUsedListing(testCase.input);
  switch (testCase.case_id) {
    case "smoke_017":
      for (const field of testCase.expected.must_include) {
        assert.ok(field in result, `Missing used-text output field: ${field}`);
      }
      assert.equal(result.extracted_fields.listing_price_cny, testCase.input.listing_price_cny);
      break;
    case "smoke_018":
      for (const field of testCase.expected.missing_fields) {
        assert.ok(result.missing_fields.includes(field), `Missing expected gap: ${field}`);
      }
      assert.equal(result.fabricated_condition_forbidden, testCase.expected.fabricated_condition_forbidden);
      assert.equal("condition" in result.extracted_fields, false);
      break;
    case "smoke_019":
      assert.equal(result.diagnosis_refused, testCase.expected.diagnosis_refused);
      assert.equal(result.offline_inspection_guidance, testCase.expected.offline_inspection_guidance);
      assert.ok(result.inspection_checklist.length > 0);
      break;
    default:
      throw new Error(`No used-text-risk runner for ${testCase.case_id}`);
  }
}

function runCostGuardCase(testCase) {
  if (testCase.case_id !== "smoke_020") {
    throw new Error(`No cost-guard runner for ${testCase.case_id}`);
  }
  const result = evaluateCostGuard(testCase.input);
  assert.equal(result.mode, testCase.expected.mode);
  assert.equal(result.paid_model_calls_allowed, testCase.expected.paid_model_calls_allowed);
  assert.equal(result.rules_and_template_available, testCase.expected.rules_and_template_available);
  assert.equal(result.hard_limit_cny, testCase.input.accumulated_model_cost_cny);
}

function runExternalCandidateVerifierCase(testCase) {
  if (testCase.case_id !== "smoke_013") {
    throw new Error(`No external-candidate runner for ${testCase.case_id}`);
  }
  const result = verifyExternalCandidate(testCase.input);
  assert.equal(
    result.specific_recommendation_requires_external_verification,
    testCase.expected.specific_recommendation_requires_external_verification,
  );
  assert.equal(result.principles_only_on_failure, testCase.expected.principles_only_on_failure);
  assert.equal(result.specific_recommendation_allowed, false);
  assert.equal(result.output_mode, "principles_only");
}

validateContract();

const results = [];
for (const testCase of suite.cases) {
  if (!IMPLEMENTED_MODULES.has(testCase.implemented_by)) {
    results.push({ case_id: testCase.case_id, status: "blocked", reason: `module_not_implemented:${testCase.implemented_by}` });
    continue;
  }
  try {
    if (testCase.implemented_by === "rules_engine") runRulesEngineCase(testCase);
    else if (testCase.implemented_by === "recommendation_pipeline") runRecommendationPipelineCase(testCase);
    else if (testCase.implemented_by === "price_resolver") runPriceResolverCase(testCase);
    else if (testCase.implemented_by === "result_validator") runResultValidatorCase(testCase);
    else if (testCase.implemented_by === "used_text_risk_tool") runUsedTextRiskCase(testCase);
    else if (testCase.implemented_by === "cost_guard") runCostGuardCase(testCase);
    else if (testCase.implemented_by === "external_candidate_verifier") runExternalCandidateVerifierCase(testCase);
    else runDecisionCoreCase(testCase);
    results.push({ case_id: testCase.case_id, status: "passed" });
  } catch (error) {
    results.push({ case_id: testCase.case_id, status: "failed", reason: error.message });
  }
}

const counts = results.reduce((summary, result) => {
  summary[result.status] += 1;
  return summary;
}, { passed: 0, failed: 0, blocked: 0 });

console.log(JSON.stringify({ suite: suite.schema_version, total: results.length, counts, results }, null, 2));

if (counts.failed > 0) process.exitCode = 1;
if (process.argv.includes("--require-all") && counts.blocked > 0) process.exitCode = 2;
