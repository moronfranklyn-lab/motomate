import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createAlphaApi } = require("../server/alpha-api.js");
const alphaManifest = JSON.parse(fs.readFileSync("knowledge_base_outputs/eligible_pool/mvp_eligible_manifest_v0.1.json", "utf8"));

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "motomate-alpha-api-"));
const databasePath = path.join(temporaryDirectory, "test.sqlite");
let modelExtractionCalls = 0;
const needExtractor = {
  async extract(input) {
    modelExtractionCalls += 1;
    return {
      schema_version: "motomate_need_extraction_v0.1",
      status: "completed",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      needs: { ...(input.needs || {}), budget_cny: 30000, budget_type: "total_purchase_budget" },
      extracted_fields: ["budget_cny", "budget_type"],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      error_code: null,
    };
  },
};
let explanationGenerationCalls = 0;
const explanationGenerator = {
  async generate({ candidates }) {
    explanationGenerationCalls += 1;
    return {
      status: "completed",
      model: "deepseek-v4-flash",
      usage: { prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 },
      error_code: null,
      validation: { schema_version: "motomate_explanation_validation_v0.1", validation_status: "pass", output_blocked: false, violations: [] },
      recommendations: candidates.map((candidate, index) => ({
        rank: index === 0 ? "首选" : index === 1 ? "次选" : "备选",
        model_id: candidate.model_id,
        title: `${candidate.brand} ${candidate.model_name} ${candidate.trim_name}`,
        summary: "受控模型解释。",
        pros: ["候选来自规则池。"],
        cons: ["仍需线下核验。"],
        fit: ["符合当前结构化需求的人。"],
        not_fit: ["需求尚未覆盖的人。"],
        next_steps: ["到店试坐。"],
        caveats: ["内部 Alpha 预览。"],
      })),
    };
  },
};
const { server, state } = createAlphaApi({ databasePath, needExtractor, explanationGenerator });
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /内部 Alpha/);

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  const healthBody = await health.json();
  assert.equal(healthBody.run_mode, "development_preview");
  assert.equal(healthBody.pool_version, "mvp_eligible_pool_v0.1");
  assert.equal(healthBody.model_count, alphaManifest.model_count);
  assert.equal(healthBody.need_extractor_enabled, true);
  assert.equal(healthBody.explanation_generator_enabled, true);

  const modelExtracted = await fetch(`${baseUrl}/api/alpha/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: "alpha_model_session", input: { raw_text: "三万元落地" } }),
  });
  assert.equal(modelExtracted.status, 200);
  const modelExtractedBody = await modelExtracted.json();
  assert.equal(modelExtractedBody.result.need_extraction.status, "completed");
  assert.equal(modelExtractedBody.result.needs.budget_cny, 30000);
  assert.equal("raw_text" in modelExtractedBody.result.needs, false);
  assert.equal(modelExtractedBody.result.sufficiency.next_question_field, "usage");
  assert.equal(modelExtractionCalls, 1);

  state.accumulated_model_cost_cny = 50;
  const modelSkipped = await fetch(`${baseUrl}/api/alpha/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: "alpha_cost_session", input: { raw_text: "帮我选车" } }),
  });
  assert.equal(modelSkipped.status, 200);
  const modelSkippedBody = await modelSkipped.json();
  assert.equal(modelSkippedBody.result.need_extraction.status, "skipped");
  assert.equal(modelSkippedBody.result.need_extraction.error_code, "cost_limit_reached");
  assert.equal(modelExtractionCalls, 1);
  state.accumulated_model_cost_cny = 0;

  const first = await fetch(`${baseUrl}/api/alpha/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session_id: "alpha_test_session",
      input: { needs: { budget_cny: 20000, budget_type: "bare_vehicle_budget" } },
    }),
  });
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.result.next_action, "ask_one_question");
  assert.equal(firstBody.result.sufficiency.next_question_field, "usage");

  const second = await fetch(`${baseUrl}/api/alpha/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session_id: "alpha_test_session",
      input: { needs: { usage: "commute", new_used_preference: "new", vehicle_type: "踏板" } },
    }),
  });
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  assert.equal(secondBody.result.next_action, "show_development_preview");
  assert.equal(secondBody.result.formal_recommendation_allowed, false);
  assert.ok(secondBody.result.result.recommendations.length > 0);
  assert.equal(secondBody.result.explanation_generation.status, "completed");
  assert.equal(secondBody.result.result.recommendations[0].summary, "受控模型解释。");
  assert.equal(explanationGenerationCalls, 1);
  assert.equal(secondBody.recommendation_version.version_number, 1);
  assert.equal(secondBody.recommendation_version.pool_version, "mvp_eligible_pool_v0.1");
  assert.ok(secondBody.recommendation_version.candidate_model_ids.length > 0);

  const invalidLowFeedback = await fetch(`${baseUrl}/api/recommendations/${secondBody.recommendation_version.recommendation_version_id}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: "alpha_test_session", rating: 2, help_tags: ["other"] }),
  });
  assert.equal(invalidLowFeedback.status, 400);
  assert.equal((await invalidLowFeedback.json()).error, "failure_reason_required");

  const feedback = await fetch(`${baseUrl}/api/recommendations/${secondBody.recommendation_version.recommendation_version_id}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session_id: "alpha_test_session",
      rating: 4,
      help_tags: ["narrowed_candidates"],
    }),
  });
  assert.equal(feedback.status, 201);
  assert.equal((await feedback.json()).feedback.success_sample, true);

  const duplicateFeedback = await fetch(`${baseUrl}/api/recommendations/${secondBody.recommendation_version.recommendation_version_id}/feedback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: "alpha_test_session", rating: 5, help_tags: ["clear_next_step"] }),
  });
  assert.equal(duplicateFeedback.status, 409);

  const versions = await fetch(`${baseUrl}/api/sessions/alpha_test_session/recommendations`);
  assert.equal(versions.status, 200);
  const versionsBody = await versions.json();
  assert.equal(versionsBody.recommendation_versions.length, 1);
  assert.equal(versionsBody.recommendation_versions[0].needs_snapshot.usage, "commute");
  assert.equal("raw_text" in versionsBody.recommendation_versions[0].needs_snapshot, false);
  assert.equal(versionsBody.recommendation_versions[0].feedback.rating, 4);

  const audit = await fetch(`${baseUrl}/api/sessions/alpha_test_session/audit`);
  assert.equal(audit.status, 200);
  const auditBody = await audit.json();
  assert.equal(auditBody.events.length, 3);
  assert.equal("raw_text" in auditBody.events[0], false);
  assert.equal(auditBody.events[1].event_type, "alpha_orchestrator_run");

  const invalidSession = await fetch(`${baseUrl}/api/alpha/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: "bad id", input: {} }),
  });
  assert.equal(invalidSession.status, 400);

  const invalidJson = await fetch(`${baseUrl}/api/alpha/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(invalidJson.status, 400);

} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

const { server: restartedServer } = createAlphaApi({ databasePath });
await new Promise((resolve) => restartedServer.listen(0, "127.0.0.1", resolve));
const restartedAddress = restartedServer.address();
const restartedBaseUrl = `http://127.0.0.1:${restartedAddress.port}`;
try {
  const persistedVersions = await fetch(`${restartedBaseUrl}/api/sessions/alpha_test_session/recommendations`);
  assert.equal(persistedVersions.status, 200);
  const persistedVersionsBody = await persistedVersions.json();
  assert.equal(persistedVersionsBody.recommendation_versions.length, 1);
  assert.equal(persistedVersionsBody.recommendation_versions[0].feedback.rating, 4);

  const persistedAudit = await fetch(`${restartedBaseUrl}/api/sessions/alpha_test_session/audit`);
  assert.equal(persistedAudit.status, 200);
  assert.equal((await persistedAudit.json()).events.length, 3);

  const feedbackSummary = await fetch(`${restartedBaseUrl}/api/internal/feedback-summary`);
  assert.equal(feedbackSummary.status, 200);
  const feedbackSummaryBody = await feedbackSummary.json();
  assert.equal(feedbackSummaryBody.recommendation_version_count, 1);
  assert.equal(feedbackSummaryBody.feedback_count, 1);
  assert.equal(feedbackSummaryBody.average_rating, 4);
  assert.equal(feedbackSummaryBody.feedback_coverage_rate, 1);
  assert.equal(feedbackSummaryBody.success_sample_rate, 1);
  assert.equal(feedbackSummaryBody.help_tag_counts.narrowed_candidates, 1);
  assert.equal("session_id" in feedbackSummaryBody.recent_feedback[0], false);
  console.log("alpha-api: 17 scenarios passed");
} finally {
  await new Promise((resolve, reject) => restartedServer.close((error) => error ? reject(error) : resolve()));
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
