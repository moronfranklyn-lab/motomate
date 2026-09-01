const http = require("node:http");
const { randomUUID } = require("node:crypto");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { URL } = require("node:url");
const knowledgeBase = require("../knowledge_base_outputs/eligible_pool/mvp_eligible_pool_v0.1.json");
const semanticEnrichment = require("../knowledge_base_outputs/semantic_enrichment/mvp_semantic_v0.1.json");
const candidateRegistry = require("../knowledge_base_outputs/candidate_registry/mvp_candidates_v0.1.json");
const { runAlphaOrchestrator } = require("../alpha-orchestrator.js");
const { buildMotorcycleDiscoveryQuery, buildTargetedDiscoveryQueries, createBochaSearchClient } = require("../bocha-search-client.js");
const { extractCandidateDrafts } = require("../external-candidate-discovery.js");
const { evaluateCostGuard } = require("../cost-guard.js");
const { createSqliteStore } = require("./sqlite-store.js");

const MAX_BODY_BYTES = 64 * 1024;
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,80}$/;
const STATIC_FILES = Object.freeze({
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
});
const HELP_TAGS = new Set(["narrowed_candidates", "understood_budget_tradeoff", "excluded_unsuitable", "clear_next_step", "other"]);
const FAILURE_REASONS = new Set(["over_budget", "usage_mismatch", "dislike_model_or_style", "possible_data_error", "too_many_questions", "hard_to_understand", "missing_target_model", "other"]);

function jsonResponse(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

async function staticResponse(response, pathname) {
  const staticFile = STATIC_FILES[pathname];
  if (!staticFile) return false;
  const [filename, contentType] = staticFile;
  const body = await readFile(join(__dirname, "..", filename));
  response.writeHead(200, {
    "content-type": contentType,
    "content-length": body.length,
    "cache-control": "no-store",
  });
  response.end(body);
  return true;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("request_body_too_large"), { statusCode: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(Object.assign(new Error("invalid_json"), { statusCode: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function createRuntimeState() {
  return {
    accumulated_model_cost_cny: 0,
  };
}

function cleanSessionId(value) {
  if (value === undefined || value === null) return randomUUID();
  if (typeof value !== "string" || !SESSION_ID_PATTERN.test(value)) {
    throw Object.assign(new Error("invalid_session_id"), { statusCode: 400 });
  }
  return value;
}

function mergeNeeds(previousNeeds = {}, input = {}) {
  const merged = { ...previousNeeds, ...(input.needs || {}) };
  for (const field of input.deleted_fields || []) delete merged[field];
  return merged;
}

function sanitizePersistedNeeds(needs = {}) {
  const sanitized = { ...needs };
  delete sanitized.raw_text;
  return sanitized;
}

function selectEvidenceCandidate(drafts, searchRequest) {
  return drafts.find((draft) => {
    if (draft.registry_match) return false;
    if (searchRequest?.vehicle_type && draft.vehicle_type !== searchRequest.vehicle_type) return false;
    if (Number.isFinite(searchRequest?.budget_cny) && Number.isFinite(draft.discovered_price_cny)
      && draft.discovered_price_cny > searchRequest.budget_cny) return false;
    return true;
  }) || null;
}

function enforceExternalBudget(evidenceRun, budgetCny) {
  const priceCny = evidenceRun?.candidate?.budget_guard_price_cny;
  if (evidenceRun?.status !== "verified_temporary_candidate"
    || !Number.isFinite(budgetCny)
    || !Number.isFinite(priceCny)
    || priceCny <= budgetCny) return evidenceRun;
  return {
    ...evidenceRun,
    status: "external_verification_required",
    candidate: null,
    verification: {
      ...evidenceRun.verification,
      status: "external_verification_required",
      external_verification_complete: false,
      specific_recommendation_allowed: false,
      temporary_candidate_only: false,
      output_mode: "principles_only",
      candidate: null,
      missing_requirements: [...new Set([...(evidenceRun.verification?.missing_requirements || []), "within_user_budget"])],
    },
  };
}

function summarizeNeedExtraction(extraction) {
  if (!extraction) return null;
  return {
    schema_version: extraction.schema_version,
    status: extraction.status,
    provider: extraction.provider,
    model: extraction.model,
    extracted_fields: extraction.extracted_fields || [],
    usage: extraction.usage || null,
    error_code: extraction.error_code || null,
  };
}

function summarizeExplanationGeneration(generation) {
  if (!generation) return null;
  return {
    status: generation.status,
    model: generation.model,
    usage: generation.usage || null,
    error_code: generation.error_code || null,
    validation_status: generation.validation?.validation_status || null,
    violation_codes: [...new Set((generation.validation?.violations || []).map((item) => item.code))],
    validation_violations: (generation.validation?.violations || []).slice(0, 12).map((item) => ({
      code: item.code,
      model_id: item.model_id || null,
      field: item.field || null,
      value: item.value || null,
    })),
  };
}

async function applyNeedExtraction(input, context = {}) {
  const extractor = context.needExtractor;
  if (!extractor || typeof extractor.extract !== "function") {
    return { input, extraction: null };
  }
  if (typeof input.raw_text !== "string" || !input.raw_text.trim()) {
    return { input, extraction: null };
  }
  const cost = evaluateCostGuard({
    accumulated_model_cost_cny: context.accumulatedModelCostCny,
    estimated_next_call_cost_cny: context.estimatedNextCallCostCny,
  });
  if (!cost.paid_model_calls_allowed) {
    return {
      input,
      extraction: {
        schema_version: "motomate_need_extraction_v0.1",
        status: "skipped",
        provider: null,
        model: null,
        extracted_fields: [],
        usage: null,
        error_code: "cost_limit_reached",
      },
    };
  }
  const extraction = await extractor.extract(input);
  return {
    input: { ...input, needs: extraction.needs || input.needs },
    extraction,
  };
}

async function applyExplanationGeneration(result, input, context = {}) {
  const generator = context.explanationGenerator;
  if (!generator || typeof generator.generate !== "function") return null;
  if (result.next_action !== "show_development_preview" || !Array.isArray(result.result?.display_candidates) || result.result.display_candidates.length === 0) return null;
  if (!result.cost_guard?.paid_model_calls_allowed) {
    return { status: "skipped", recommendations: null, validation: null, usage: null, model: null, error_code: "cost_limit_reached" };
  }
  const generation = await generator.generate({
    needs: result.needs || input.needs || {},
    candidates: result.result.display_candidates,
  });
  if (generation.status === "completed" && Array.isArray(generation.recommendations)) {
    result.result.recommendations = generation.recommendations;
    result.result.explanation_validation = generation.validation;
  }
  return generation;
}

function auditEvent(sessionId, result, needExtraction, explanationGeneration) {
  return {
    event_id: randomUUID(),
    session_id: sessionId,
    occurred_at: new Date().toISOString(),
    event_type: "alpha_orchestrator_run",
    intent: result.intent,
    status: result.status,
    next_action: result.next_action,
    run_mode: result.run_mode,
    candidate_count: result.result?.candidate_pool?.candidate_count ?? 0,
    candidate_coverage_status: result.result?.candidate_coverage?.status ?? null,
    external_search_required: result.result?.candidate_coverage?.external_search_required === true,
    external_discovery_status: result.result?.external_discovery?.status ?? null,
    external_discovery_result_count: result.result?.external_discovery?.results?.length ?? 0,
    external_evidence_status: result.result?.external_evidence_run?.status ?? null,
    need_extraction: summarizeNeedExtraction(needExtraction),
    explanation_generation: summarizeExplanationGeneration(explanationGeneration),
  };
}

function createRecommendationVersion(sessionId, needs, result) {
  if (result.next_action !== "show_development_preview") return null;
  const recommendation = result.result || {};
  return {
    recommendation_version_id: randomUUID(),
    session_id: sessionId,
    version_number: 0,
    created_at: new Date().toISOString(),
    run_mode: result.run_mode,
    pool_version: knowledgeBase.pool_version,
    rule_version: knowledgeBase.rule_version,
    needs_snapshot: structuredClone(sanitizePersistedNeeds(needs)),
    candidate_model_ids: (recommendation.display_candidates || recommendation.candidate_pool?.candidates || []).slice(0, 3).map((item) => item.model_id),
    closest_candidate_model_ids: (recommendation.closest_candidates || []).map((item) => item.model_id),
    status: recommendation.status,
    candidate_coverage_status: recommendation.candidate_coverage?.status || "unknown",
    temporary_candidate_ids: (recommendation.temporary_candidates || []).map((item) => item.candidate_id),
    feedback: null,
  };
}

function validateFeedback(body) {
  const rating = body.rating;
  const helpTags = Array.isArray(body.help_tags) ? [...new Set(body.help_tags)] : [];
  const failureReasons = Array.isArray(body.failure_reasons) ? [...new Set(body.failure_reasons)] : [];
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw Object.assign(new Error("invalid_rating"), { statusCode: 400 });
  if (helpTags.length === 0 || helpTags.some((tag) => !HELP_TAGS.has(tag))) throw Object.assign(new Error("invalid_help_tags"), { statusCode: 400 });
  if (rating <= 3 && (failureReasons.length === 0 || failureReasons.some((reason) => !FAILURE_REASONS.has(reason)))) {
    throw Object.assign(new Error("failure_reason_required"), { statusCode: 400 });
  }
  if (rating > 3 && failureReasons.some((reason) => !FAILURE_REASONS.has(reason))) throw Object.assign(new Error("invalid_failure_reasons"), { statusCode: 400 });
  if (comment.length > 500) throw Object.assign(new Error("comment_too_long"), { statusCode: 400 });
  return { rating, help_tags: helpTags, failure_reasons: failureReasons, comment: comment || null };
}

function createAlphaApi(options = {}) {
  const state = options.state || createRuntimeState();
  const store = options.store || createSqliteStore(options.databasePath || join(__dirname, "..", "runtime", "motomate-alpha.sqlite"));
  const dependencies = options.dependencies || { knowledgeBase, semanticEnrichment };
  const externalSearchClient = options.externalSearchClient || null;
  const externalEvidencePipeline = options.externalEvidencePipeline || null;
  const needExtractor = options.needExtractor || null;
  const explanationGenerator = options.explanationGenerator || null;

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, "http://127.0.0.1");
    try {
      if (request.method === "GET" && await staticResponse(response, requestUrl.pathname)) return;
      if (request.method === "GET" && requestUrl.pathname === "/health") {
        jsonResponse(response, 200, {
          status: "ok",
          service: "motomate-alpha-api",
          run_mode: "development_preview",
          pool_version: knowledgeBase.pool_version,
          model_count: knowledgeBase.models.length,
          need_extractor_enabled: Boolean(needExtractor),
          explanation_generator_enabled: Boolean(explanationGenerator),
        });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/internal/feedback-summary") {
        jsonResponse(response, 200, store.getFeedbackSummary());
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/alpha/run") {
        const body = await readJsonBody(request);
        const sessionId = cleanSessionId(body.session_id);
        const existing = store.getSession(sessionId) || {
          needs: {},
          critical_question_count: 0,
          audit_events: [],
          recommendation_versions: [],
        };
        const mergedInput = { ...(body.input || {}), needs: mergeNeeds(existing.needs, body.input || {}) };
        const needExtractionRun = await applyNeedExtraction(mergedInput, {
          needExtractor,
          accumulatedModelCostCny: state.accumulated_model_cost_cny,
          estimatedNextCallCostCny: body.estimated_next_call_cost_cny || 0,
        });
        const input = needExtractionRun.input;
        const result = runAlphaOrchestrator({
          input,
          accumulated_model_cost_cny: state.accumulated_model_cost_cny,
          estimated_next_call_cost_cny: body.estimated_next_call_cost_cny || 0,
          conversation_state: { critical_question_count: existing.critical_question_count },
        }, dependencies);
        result.need_extraction = summarizeNeedExtraction(needExtractionRun.extraction);
        if (result.result?.candidate_coverage?.external_search_required && externalSearchClient) {
          const searchRequest = result.result.candidate_coverage.search_request;
          const query = buildMotorcycleDiscoveryQuery(searchRequest);
          result.result.external_discovery = await externalSearchClient.search(query, { count: 8, freshness: "oneYear" });
          let discoveryResults = [...result.result.external_discovery.results];
          let drafts = extractCandidateDrafts(discoveryResults, candidateRegistry);
          let evidenceCandidate = selectEvidenceCandidate(drafts, searchRequest);
          let targetedSearchCount = 0;
          if (!evidenceCandidate) {
            for (const targetedQuery of buildTargetedDiscoveryQueries(searchRequest)) {
              const targetedRun = await externalSearchClient.search(targetedQuery, { count: 8, freshness: "oneYear" });
              targetedSearchCount += 1;
              const seenUrls = new Set(discoveryResults.map((item) => item.url));
              discoveryResults.push(...targetedRun.results.filter((item) => !seenUrls.has(item.url)));
              drafts = extractCandidateDrafts(discoveryResults, candidateRegistry);
              evidenceCandidate = selectEvidenceCandidate(drafts, searchRequest);
              if (evidenceCandidate) break;
            }
          }
          result.result.external_discovery.results = discoveryResults;
          result.result.external_discovery.candidate_drafts = drafts;
          result.result.external_discovery.targeted_search_count = targetedSearchCount;
          if (evidenceCandidate && externalEvidencePipeline) {
            result.result.external_evidence_run = enforceExternalBudget(
              await externalEvidencePipeline(evidenceCandidate),
              searchRequest.budget_cny,
            );
            result.result.temporary_candidates = result.result.external_evidence_run.status === "verified_temporary_candidate"
              ? [result.result.external_evidence_run.candidate]
              : [];
          }
        }
        const explanationGeneration = await applyExplanationGeneration(result, input, { explanationGenerator });
        result.explanation_generation = summarizeExplanationGeneration(explanationGeneration);
        const nextQuestionCount = result.sufficiency?.next_action === "ask_one_question"
          ? existing.critical_question_count + 1
          : existing.critical_question_count;
        const event = auditEvent(sessionId, result, needExtractionRun.extraction, explanationGeneration);
        const recommendationVersion = createRecommendationVersion(sessionId, result.needs || input.needs, result);
        if (recommendationVersion) recommendationVersion.version_number = existing.recommendation_versions.length + 1;
        if (result.needs) result.needs = sanitizePersistedNeeds(result.needs);
        const nextSession = {
          needs: sanitizePersistedNeeds(result.needs || input.needs),
          critical_question_count: nextQuestionCount,
        };
        store.saveRun(sessionId, nextSession, event, recommendationVersion);
        jsonResponse(response, 200, {
          session_id: sessionId,
          recommendation_version: recommendationVersion,
          result,
        });
        return;
      }

      const feedbackMatch = requestUrl.pathname.match(/^\/api\/recommendations\/([^/]+)\/feedback$/);
      if (request.method === "POST" && feedbackMatch) {
        const body = await readJsonBody(request);
        const sessionId = cleanSessionId(body.session_id);
        const session = store.getSession(sessionId);
        if (!session) {
          jsonResponse(response, 404, { error: "session_not_found" });
          return;
        }
        const version = session.recommendation_versions.find((item) => item.recommendation_version_id === feedbackMatch[1]);
        if (!version) {
          jsonResponse(response, 404, { error: "recommendation_version_not_found" });
          return;
        }
        if (version.feedback) {
          jsonResponse(response, 409, { error: "feedback_already_submitted" });
          return;
        }
        const feedback = validateFeedback(body);
        const savedFeedback = {
          feedback_id: randomUUID(),
          submitted_at: new Date().toISOString(),
          ...feedback,
          success_sample: feedback.rating >= 4 && feedback.help_tags.length > 0,
        };
        const feedbackEvent = {
          event_id: randomUUID(),
          session_id: sessionId,
          occurred_at: savedFeedback.submitted_at,
          event_type: "recommendation_feedback_submitted",
          recommendation_version_id: version.recommendation_version_id,
          rating: savedFeedback.rating,
          success_sample: savedFeedback.success_sample,
        };
        store.saveFeedback(sessionId, version.recommendation_version_id, savedFeedback, feedbackEvent);
        jsonResponse(response, 201, {
          recommendation_version_id: version.recommendation_version_id,
          feedback: savedFeedback,
        });
        return;
      }

      const versionsMatch = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/recommendations$/);
      if (request.method === "GET" && versionsMatch) {
        const sessionId = cleanSessionId(versionsMatch[1]);
        const session = store.getSession(sessionId);
        if (!session) {
          jsonResponse(response, 404, { error: "session_not_found" });
          return;
        }
        jsonResponse(response, 200, {
          session_id: sessionId,
          recommendation_versions: session.recommendation_versions,
        });
        return;
      }

      const auditMatch = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/audit$/);
      if (request.method === "GET" && auditMatch) {
        const sessionId = cleanSessionId(auditMatch[1]);
        const session = store.getSession(sessionId);
        if (!session) {
          jsonResponse(response, 404, { error: "session_not_found" });
          return;
        }
        jsonResponse(response, 200, { session_id: sessionId, events: session.audit_events });
        return;
      }

      jsonResponse(response, 404, { error: "route_not_found" });
    } catch (error) {
      if (!response.headersSent) {
        jsonResponse(response, error.statusCode || 500, {
          error: error.statusCode ? error.message : "internal_server_error",
        });
      }
    }
  });

  return { server, state, store };
}

if (require.main === module) {
  const { loadLocalEnv } = require("./load-local-env.js");
  const { createWebEvidenceFetcher } = require("../web-evidence-fetcher.js");
  const { createExternalEvidencePipeline } = require("../external-evidence-pipeline.js");
  const { createDeepSeekClient } = require("../deepseek-client.js");
  const { createNeedExtractor } = require("../need-extractor.js");
  const { createExplanationGenerator } = require("../explanation-generator.js");
  const { extractAlphaNeeds } = require("../alpha-orchestrator.js");
  loadLocalEnv(join(__dirname, ".."));
  const port = Number(process.env.MOTOMATE_PORT || 4173);
  const externalSearchClient = process.env.BOCHA_API_KEY
    ? createBochaSearchClient({ apiKey: process.env.BOCHA_API_KEY, baseUrl: process.env.BOCHA_BASE_URL })
    : null;
  const externalEvidencePipeline = externalSearchClient
    ? createExternalEvidencePipeline({ searchClient: externalSearchClient, fetchEvidencePage: createWebEvidenceFetcher() })
    : null;
  const deepSeekClient = process.env.DEEPSEEK_API_KEY
    ? createDeepSeekClient({
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL,
      baseUrl: process.env.DEEPSEEK_BASE_URL,
    })
    : null;
  const needExtractor = process.env.MOTOMATE_NEED_EXTRACTOR_ENABLED === "true" && deepSeekClient
    ? createNeedExtractor({ client: deepSeekClient, fallbackExtractor: extractAlphaNeeds })
    : null;
  const explanationGenerator = process.env.MOTOMATE_EXPLANATION_GENERATOR_ENABLED === "true" && deepSeekClient
    ? createExplanationGenerator({ client: deepSeekClient })
    : null;
  const { server } = createAlphaApi({ externalSearchClient, externalEvidencePipeline, needExtractor, explanationGenerator });
  server.listen(port, "127.0.0.1", () => {
    console.log(`MotoMate Alpha API: http://127.0.0.1:${port}`);
  });
}

module.exports = { applyExplanationGeneration, applyNeedExtraction, createAlphaApi, createRuntimeState, enforceExternalBudget, sanitizePersistedNeeds, selectEvidenceCandidate, summarizeExplanationGeneration, summarizeNeedExtraction };
