(function initExternalCandidateVerifier(root) {
  const REQUIRED_KEY_PARAMETERS = Object.freeze(["model_identity", "current_sale_status", "key_parameters"]);

  function verifiedEvidence(evidence) {
    return evidence && evidence.verification_status === "verified" && typeof evidence.source_url === "string";
  }

  function verifyExternalCandidate(input = {}) {
    const candidate = input.candidate || null;
    const officialEvidence = input.official_evidence || null;
    const platformEvidence = input.platform_price_evidence || null;
    const missingRequirements = [];

    if (!candidate) missingRequirements.push("candidate");
    if (!verifiedEvidence(officialEvidence)) missingRequirements.push("verified_official_source");
    if (verifiedEvidence(officialEvidence)) {
      for (const field of REQUIRED_KEY_PARAMETERS) {
        if (officialEvidence[field] !== true) missingRequirements.push(`official_${field}`);
      }
    }
    if (!verifiedEvidence(platformEvidence)) missingRequirements.push("verified_platform_price_source");
    if (verifiedEvidence(platformEvidence) && platformEvidence.price_scope_match !== true) {
      missingRequirements.push("platform_price_scope_match");
    }
    if (input.price_conflict_type === "true_same_scope_conflict") {
      missingRequirements.push("unresolved_same_scope_price_conflict");
    }

    const verified = missingRequirements.length === 0;
    return {
      schema_version: "motomate_external_candidate_verification_v0.1",
      status: verified ? "verified_temporary_candidate" : "external_verification_required",
      external_verification_complete: verified,
      specific_recommendation_requires_external_verification: true,
      specific_recommendation_allowed: verified,
      formal_recommendation_allowed: false,
      temporary_candidate_only: verified,
      principles_only_on_failure: true,
      output_mode: verified ? "temporary_candidate" : "principles_only",
      candidate: verified ? candidate : null,
      evidence_summary: verified
        ? {
            official_source_url: officialEvidence.source_url,
            platform_price_source_url: platformEvidence.source_url,
            official_verified_at: officialEvidence.verified_at || null,
            platform_price_verified_at: platformEvidence.verified_at || null,
          }
        : null,
      missing_requirements: missingRequirements,
    };
  }

  const api = { verifyExternalCandidate };
  root.MotoMateExternalCandidateVerifier = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
