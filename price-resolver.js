(function initPriceResolver(root) {
  const TRUE_CONFLICT = "true_same_scope_conflict";

  function hasCachedPrice(input) {
    return Number.isFinite(input.cached_price_cny) || Number.isFinite(input.price_cny);
  }

  function cachedPrice(input) {
    if (Number.isFinite(input.cached_price_cny)) return input.cached_price_cny;
    if (Number.isFinite(input.price_cny)) return input.price_cny;
    return null;
  }

  function resolvePriceQuery(input = {}) {
    const conflict = input.price_conflict_type === TRUE_CONFLICT;
    const cached = hasCachedPrice(input);
    const stale = input.price_status === "stale";

    if (conflict) {
      return {
        schema_version: "motomate_price_resolution_v0.1",
        status: "price_conflict",
        price_status: "conflict",
        conflict_type: TRUE_CONFLICT,
        difference_ratio: Number.isFinite(input.difference_ratio) ? input.difference_ratio : null,
        first_choice_allowed: false,
        show_as_price_check_candidate: true,
        candidate_bucket: "price_check",
        model_memory_price_forbidden: true,
      };
    }

    if (stale) {
      return {
        schema_version: "motomate_price_resolution_v0.1",
        status: "stale_while_revalidate",
        price_status: "stale",
        display_price_cny: cachedPrice(input),
        show_stale_value: true,
        last_verified_at: input.last_verified_at || null,
        show_refresh_status: true,
        refresh_status: input.refresh_status || "refreshing",
        first_choice_allowed: input.rule_pool_eligible === true,
        model_memory_price_forbidden: true,
      };
    }

    if (!cached) {
      return {
        schema_version: "motomate_price_resolution_v0.1",
        status: "verification_required",
        price_status: "unavailable",
        display_price_cny: null,
        show_stale_value: false,
        show_refresh_status: true,
        refresh_status: input.refresh_status || "pending",
        first_choice_allowed: false,
        model_memory_price_forbidden: true,
      };
    }

    return {
      schema_version: "motomate_price_resolution_v0.1",
      status: "cache_hit",
      price_status: input.price_status || "fresh",
      display_price_cny: cachedPrice(input),
      show_stale_value: false,
      last_verified_at: input.last_verified_at || null,
      show_refresh_status: false,
      refresh_status: "not_required",
      first_choice_allowed: input.rule_pool_eligible === true,
      model_memory_price_forbidden: true,
    };
  }

  const api = { resolvePriceQuery };
  root.MotoMatePriceResolver = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
