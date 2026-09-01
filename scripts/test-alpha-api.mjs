import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createAlphaApi } = require("../server/alpha-api.js");
const alphaManifest = JSON.parse(fs.readFileSync("knowledge_base_outputs/eligible_pool/active_runtime_manifest_v0.1.json", "utf8"));

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "motomate-alpha-api-"));
const databasePath = path.join(temporaryDirectory, "test.sqlite");
const memoryDatabasePath = path.join(temporaryDirectory, "memory.sqlite");
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
let conversationAgentCalls = 0;
const conversationAgent = {
  async decide(context) {
    conversationAgentCalls += 1;
    const field = context.missing_fields.at(-1) || null;
    return {
      status: "completed",
      assistant_message: field ? "我已经理解了你提供的信息，再确认一个关键点就可以继续？" : "需求已经清楚，我现在开始筛选。",
      proposed_action: field ? "ask_one_question" : "recommend",
      question_field: field,
      model: "deepseek-v4-flash",
      usage: { total_tokens: 90 },
      error_code: null,
    };
  },
};
let openAnswerCalls = 0;
const openAnswerAgent = {
  async answer({ mode }) {
    openAnswerCalls += 1;
    return { status: "completed", answer: mode === "motorcycle_general" ? "ABS 是制动安全辅助配置。" : "可以简单聊聊，我也擅长帮你选车。", redirect_suggestions: ["开始新手选车"], model: "deepseek-v4-flash", usage: { total_tokens: 70 }, error_code: null };
  },
};
const { server, state } = createAlphaApi({ databasePath, memoryDatabasePath, needExtractor, explanationGenerator, conversationAgent, openAnswerAgent });
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
  assert.equal(healthBody.pool_version, "active_runtime_pool_v0.1");
  assert.equal(healthBody.model_count, alphaManifest.model_count);
  assert.equal(healthBody.need_extractor_enabled, true);
  assert.equal(healthBody.explanation_generator_enabled, true);
  assert.equal(healthBody.conversation_agent_enabled, true);
  assert.equal(healthBody.open_answer_agent_enabled, true);
  assert.equal(healthBody.memory_enabled, true);

  const deviceId = "device_1234567890abcdef";
  const preferredMemory = await fetch(`${baseUrl}/api/memory/preferred_vehicle_type`, {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ device_id: deviceId, value: "踏板" }),
  });
  assert.equal(preferredMemory.status, 200);
  const memoryList = await fetch(`${baseUrl}/api/memory?device_id=${deviceId}`);
  const memoryListBody = await memoryList.json();
  assert.equal(memoryListBody.memories.find((item) => item.key === "preferred_vehicle_type").value, "踏板");

  const memoryEdit = await fetch(`${baseUrl}/api/memory/primary_usage`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ device_id: deviceId, value: "commute" }),
  });
  assert.equal(memoryEdit.status, 200);
  const memoryOff = await fetch(`${baseUrl}/api/memory/settings`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ device_id: deviceId, memory_enabled: false }),
  });
  assert.equal((await memoryOff.json()).settings.memory_enabled, false);
  await fetch(`${baseUrl}/api/memory/settings`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ device_id: deviceId, memory_enabled: true }),
  });

  const relatedQuestion = await fetch(`${baseUrl}/api/alpha/run`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: "alpha_open_related", input: { raw_text: "摩托车 ABS 有什么用？" } }),
  });
  const relatedBody = await relatedQuestion.json();
  assert.equal(relatedBody.result.next_action, "show_open_answer");
  assert.equal(relatedBody.result.open_answer.status, "completed");
  assert.match(relatedBody.result.open_answer.answer, /ABS/);

  const generalQuestion = await fetch(`${baseUrl}/api/alpha/run`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: "alpha_open_general", input: { raw_text: "你好，今天心情怎么样？" } }),
  });
  const generalBody = await generalQuestion.json();
  assert.equal(generalBody.result.intent, "general_brief_redirect");
  assert.equal(generalBody.result.open_answer.status, "completed");
  assert.equal(openAnswerCalls, 2);
  assert.equal(modelExtractionCalls, 0);

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
  assert.ok(modelExtractedBody.result.sufficiency.missing_fields.includes("usage"));
  assert.equal(modelExtractedBody.result.sufficiency.next_question_field, "new_used_preference");
  assert.equal(modelExtractedBody.result.conversation.status, "completed");
  assert.equal(modelExtractedBody.result.conversation.question_field, "new_used_preference");
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
  assert.equal(firstBody.result.sufficiency.next_question_field, "new_used_preference");

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
  assert.equal(secondBody.result.conversation.proposed_action, "recommend");
  assert.equal(secondBody.result.result.recommendations[0].summary, "受控模型解释。");
  assert.equal(explanationGenerationCalls, 1);
  assert.ok(conversationAgentCalls >= 2);
  assert.equal(secondBody.recommendation_version.version_number, 1);
  assert.equal(secondBody.recommendation_version.pool_version, "active_runtime_pool_v0.1");
  assert.ok(secondBody.recommendation_version.candidate_model_ids.length > 0);

  const openFollowUp = await fetch(`${baseUrl}/api/alpha/run`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: "alpha_test_session", input: { raw_text: "我还没骑过车怎么办" } }),
  });
  const openFollowUpBody = await openFollowUp.json();
  assert.equal(openFollowUpBody.result.intent, "motorcycle_general");
  assert.equal(openFollowUpBody.result.next_action, "show_open_answer");
  assert.match(openFollowUpBody.result.open_answer.answer, /ABS|选车/);
  assert.equal(openFollowUpBody.recommendation_version, null);

  const expansion = await fetch(`${baseUrl}/api/alpha/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session_id: "active_expansion_session",
      input: { needs: { budget_cny: 40000, budget_type: "bare_vehicle_budget", usage: "weekend", new_used_preference: "new", vehicle_type: "街车" } },
    }),
  });
  assert.equal(expansion.status, 200);
  const expansionBody = await expansion.json();
  assert.equal(expansionBody.result.next_action, "show_development_preview");
  assert.equal(expansionBody.result.formal_recommendation_allowed, false);
  assert.ok(expansionBody.result.result.display_candidates.some((candidate) => candidate.model_id === "cfmoto_675nk_current_standard"));
  assert.equal(expansionBody.recommendation_version.pool_version, "active_runtime_pool_v0.1");

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
  assert.equal(auditBody.events.length, 4);
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
  assert.equal((await persistedAudit.json()).events.length, 4);

  const feedbackSummary = await fetch(`${restartedBaseUrl}/api/internal/feedback-summary`);
  assert.equal(feedbackSummary.status, 200);
  const feedbackSummaryBody = await feedbackSummary.json();
  assert.equal(feedbackSummaryBody.recommendation_version_count, 2);
  assert.equal(feedbackSummaryBody.feedback_count, 1);
  assert.equal(feedbackSummaryBody.average_rating, 4);
  assert.equal(feedbackSummaryBody.feedback_coverage_rate, 0.5);
  assert.equal(feedbackSummaryBody.success_sample_rate, 1);
  assert.equal(feedbackSummaryBody.help_tag_counts.narrowed_candidates, 1);
  assert.equal("session_id" in feedbackSummaryBody.recent_feedback[0], false);
  console.log("alpha-api: 25 scenarios passed");
} finally {
  await new Promise((resolve, reject) => restartedServer.close((error) => error ? reject(error) : resolve()));
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
