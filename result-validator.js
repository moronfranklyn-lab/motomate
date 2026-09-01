(function initResultValidator(root) {
  function listCandidateIds(candidatePool) {
    if (Array.isArray(candidatePool)) return candidatePool.map((candidate) => candidate.model_id);
    if (Array.isArray(candidatePool?.candidates)) {
      return candidatePool.candidates.map((candidate) => candidate.model_id);
    }
    return [];
  }

  function readDraftModelIds(draft = {}) {
    if (Array.isArray(draft.draft_model_ids)) return draft.draft_model_ids;
    if (Array.isArray(draft.recommendations)) {
      return draft.recommendations.map((item) => item.model_id).filter(Boolean);
    }
    return [];
  }

  function validateCandidatePoolOutput(draft = {}, candidatePool = {}, options = {}) {
    const candidateIds = new Set(listCandidateIds(candidatePool));
    const draftModelIds = readDraftModelIds(draft);
    const violations = [];

    for (const modelId of draftModelIds) {
      if (!candidateIds.has(modelId)) {
        violations.push({
          code: "candidate_pool_escape",
          model_id: modelId,
          message: "Draft output contains a model outside the verified candidate pool.",
        });
      }
    }

    if (options.requireApproved === true) {
      const candidates = Array.isArray(candidatePool?.candidates) ? candidatePool.candidates : [];
      for (const candidate of candidates) {
        if (draftModelIds.includes(candidate.model_id) && candidate.review_status !== "approved") {
          violations.push({
            code: "recommendation_not_approved",
            model_id: candidate.model_id,
            message: "Draft output contains a candidate that is not approved for production recommendation.",
          });
        }
      }
    }

    return {
      schema_version: "motomate_result_validation_v0.1",
      validation_status: violations.length === 0 ? "pass" : "fail",
      output_blocked: violations.length > 0,
      checked_model_ids: draftModelIds,
      candidate_pool_size: candidateIds.size,
      violations,
    };
  }

  const EXPLANATION_FIELDS = Object.freeze(["summary", "pros", "cons", "fit", "not_fit", "next_steps"]);
  const FORBIDDEN_EXPLANATION_PATTERNS = Object.freeze([
    /闭眼买|绝对没问题|一定安全|必然保值|百分之百/,
    /https?:\/\//i,
    /正式推荐批准|已经批准|官方推荐/,
  ]);

  function textList(value, maxItems, maxLength) {
    if (!Array.isArray(value) || value.length < 1 || value.length > maxItems) return null;
    const cleaned = value.map((item) => typeof item === "string" ? item.trim() : "");
    return cleaned.every((item) => item.length > 0 && item.length <= maxLength) ? cleaned : null;
  }

  function collectNumbers(value) {
    return String(value || "").match(/\d+(?:\.\d+)?/g) || [];
  }

  function validateExplanationOutput(draft = {}, context = {}) {
    const expectedCandidates = Array.isArray(context.candidates) ? context.candidates : [];
    const recommendations = Array.isArray(draft.recommendations) ? draft.recommendations : [];
    const expectedIds = expectedCandidates.map((item) => item.model_id);
    const actualIds = recommendations.map((item) => item?.model_id);
    const violations = [];

    if (recommendations.length !== expectedCandidates.length || actualIds.some((id, index) => id !== expectedIds[index])) {
      violations.push({ code: "explanation_candidate_mismatch", message: "Explanation changed candidate membership or order." });
    }

    for (let index = 0; index < Math.min(recommendations.length, expectedCandidates.length); index += 1) {
      const item = recommendations[index] || {};
      const candidate = expectedCandidates[index];
      const normalized = {
        summary: typeof item.summary === "string" ? item.summary.trim() : "",
        pros: textList(item.pros, 3, 120),
        cons: textList(item.cons, 3, 120),
        fit: textList(item.fit, 3, 120),
        not_fit: textList(item.not_fit, 3, 120),
        next_steps: textList(item.next_steps, 3, 120),
      };
      for (const field of EXPLANATION_FIELDS) {
        const valid = field === "summary"
          ? normalized.summary.length > 0 && normalized.summary.length <= 240
          : normalized[field] !== null;
        if (!valid) violations.push({ code: "explanation_field_invalid", model_id: candidate.model_id, field });
      }
      const allText = [normalized.summary, ...(normalized.pros || []), ...(normalized.cons || []), ...(normalized.fit || []), ...(normalized.not_fit || []), ...(normalized.next_steps || [])].join(" ");
      if (FORBIDDEN_EXPLANATION_PATTERNS.some((pattern) => pattern.test(allText))) {
        violations.push({ code: "explanation_forbidden_claim", model_id: candidate.model_id });
      }
      const allowedNumbers = new Set((candidate.allowed_numbers || []).map(String));
      for (const number of collectNumbers(allText)) {
        if (!allowedNumbers.has(number)) violations.push({ code: "explanation_unapproved_number", model_id: candidate.model_id, value: number });
      }
    }

    return {
      schema_version: "motomate_explanation_validation_v0.1",
      validation_status: violations.length === 0 ? "pass" : "fail",
      output_blocked: violations.length > 0,
      checked_model_ids: actualIds.filter(Boolean),
      violations,
    };
  }

  const api = { validateCandidatePoolOutput, validateExplanationOutput };
  root.MotoMateResultValidator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
