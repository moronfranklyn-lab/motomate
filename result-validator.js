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

  const api = { validateCandidatePoolOutput };
  root.MotoMateResultValidator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
