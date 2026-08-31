(function initCostGuard(root) {
  const DEFAULT_HARD_LIMIT_CNY = 50;

  function validCost(value) {
    return Number.isFinite(value) && value >= 0;
  }

  function evaluateCostGuard(input = {}, options = {}) {
    const hardLimitCny = validCost(options.hard_limit_cny)
      ? options.hard_limit_cny
      : DEFAULT_HARD_LIMIT_CNY;
    const accumulatedCostCny = validCost(input.accumulated_model_cost_cny)
      ? input.accumulated_model_cost_cny
      : null;
    const estimatedNextCallCostCny = validCost(input.estimated_next_call_cost_cny)
      ? input.estimated_next_call_cost_cny
      : 0;

    if (accumulatedCostCny === null) {
      return {
        schema_version: "motomate_cost_guard_v0.1",
        status: "cost_data_unavailable",
        mode: "basic",
        hard_limit_cny: hardLimitCny,
        accumulated_model_cost_cny: null,
        paid_model_calls_allowed: false,
        rules_and_template_available: true,
        history_available: true,
        downgrade_notice_required: true,
        reason: "missing_or_invalid_accumulated_cost",
      };
    }

    const projectedCostCny = accumulatedCostCny + estimatedNextCallCostCny;
    const limitReached = accumulatedCostCny >= hardLimitCny;
    const nextCallWouldExceedLimit = projectedCostCny > hardLimitCny;
    const basicMode = limitReached || nextCallWouldExceedLimit;

    return {
      schema_version: "motomate_cost_guard_v0.1",
      status: basicMode ? "cost_limit_enforced" : "within_cost_limit",
      mode: basicMode ? "basic" : "full",
      hard_limit_cny: hardLimitCny,
      accumulated_model_cost_cny: accumulatedCostCny,
      estimated_next_call_cost_cny: estimatedNextCallCostCny,
      projected_model_cost_cny: projectedCostCny,
      remaining_budget_cny: Math.max(0, hardLimitCny - accumulatedCostCny),
      paid_model_calls_allowed: !basicMode,
      rules_and_template_available: true,
      history_available: true,
      downgrade_notice_required: basicMode,
      reason: limitReached
        ? "hard_limit_reached"
        : nextCallWouldExceedLimit
          ? "next_call_would_exceed_hard_limit"
          : null,
    };
  }

  const api = { evaluateCostGuard, DEFAULT_HARD_LIMIT_CNY };
  root.MotoMateCostGuard = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
