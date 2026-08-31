(function initCandidateCoverage(root) {
  const TIER_ORDER = ["entry", "balanced", "upgrade"];

  function normalizeBudgetCny(needs) {
    if (Number.isFinite(needs?.filter_budget_cny)) return needs.filter_budget_cny;
    if (Number.isFinite(needs?.budget_cny)) return needs.budget_cny;
    if (Number.isFinite(needs?.budget_wan)) return Math.round(needs.budget_wan * 10000);
    return null;
  }

  function budgetTier(priceCny, budgetCny) {
    if (!Number.isFinite(priceCny) || !Number.isFinite(budgetCny) || budgetCny <= 0) return "unknown";
    const utilization = priceCny / budgetCny;
    if (utilization < 0.65) return "entry";
    if (utilization < 0.85) return "balanced";
    return "upgrade";
  }

  function annotateCandidates(candidates, budgetCny) {
    return candidates.map((candidate) => ({
      ...candidate,
      budget_utilization: Number.isFinite(budgetCny) && budgetCny > 0
        ? Number((candidate.budget_guard_price_cny / budgetCny).toFixed(3))
        : null,
      budget_tier: budgetTier(candidate.budget_guard_price_cny, budgetCny),
    }));
  }

  function selectDisplayCandidates(candidates, needs = {}, limit = 3) {
    const budgetCny = normalizeBudgetCny(needs);
    const annotated = annotateCandidates(candidates, budgetCny);
    if (!Number.isFinite(budgetCny)) return annotated.slice(0, limit);

    const selected = [];
    for (const tier of TIER_ORDER) {
      const candidate = annotated.find((item) => item.budget_tier === tier && !selected.includes(item));
      if (candidate) selected.push(candidate);
    }
    for (const candidate of annotated) {
      if (selected.length >= limit) break;
      if (!selected.includes(candidate)) selected.push(candidate);
    }
    return selected.slice(0, limit);
  }

  function assessCandidateCoverage(candidates, needs = {}) {
    const budgetCny = normalizeBudgetCny(needs);
    const annotated = annotateCandidates(candidates, budgetCny);
    const tiers = [...new Set(annotated.map((item) => item.budget_tier).filter((tier) => tier !== "unknown"))];
    const vehicleTypes = [...new Set(annotated.map((item) => item.vehicle_type).filter(Boolean))];
    const maxBudgetUtilization = annotated.reduce(
      (max, item) => Math.max(max, Number(item.budget_utilization) || 0),
      0,
    );
    const reasons = [];

    if (annotated.length < 3) reasons.push("candidate_count_below_3");
    if (Number.isFinite(budgetCny) && maxBudgetUtilization < 0.75) reasons.push("budget_upper_range_uncovered");
    if (Number.isFinite(budgetCny) && tiers.length < 2) reasons.push("budget_choice_layers_insufficient");
    if (!needs.vehicle_type && annotated.length > 0 && vehicleTypes.length < 2) reasons.push("vehicle_type_diversity_insufficient");

    return {
      schema_version: "motomate_candidate_coverage_v0.1",
      status: reasons.length === 0 ? "sufficient" : "insufficient",
      external_search_required: reasons.length > 0,
      reasons,
      metrics: {
        candidate_count: annotated.length,
        budget_tiers: TIER_ORDER.filter((tier) => tiers.includes(tier)),
        vehicle_type_count: vehicleTypes.length,
        max_budget_utilization: Number(maxBudgetUtilization.toFixed(3)),
      },
      search_request: reasons.length > 0 ? {
        budget_cny: budgetCny,
        usage: needs.usage || null,
        vehicle_type: needs.vehicle_type || null,
        missing_coverage: reasons,
      } : null,
    };
  }

  const api = { assessCandidateCoverage, budgetTier, selectDisplayCandidates };
  root.MotoMateCandidateCoverage = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
