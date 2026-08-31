(function initAlphaOrchestrator(root) {
  const decisionApi = root.MotoMateDecisionCore || (typeof require !== "undefined" ? require("./decision-core.js") : null);
  const recommendationApi = root.MotoMateRecommendationPipeline || (typeof require !== "undefined" ? require("./recommendation-pipeline.js") : null);
  const priceApi = root.MotoMatePriceResolver || (typeof require !== "undefined" ? require("./price-resolver.js") : null);
  const usedApi = root.MotoMateUsedTextRiskTool || (typeof require !== "undefined" ? require("./used-text-risk-tool.js") : null);
  const externalApi = root.MotoMateExternalCandidateVerifier || (typeof require !== "undefined" ? require("./external-candidate-verifier.js") : null);
  const costApi = root.MotoMateCostGuard || (typeof require !== "undefined" ? require("./cost-guard.js") : null);

  function routeIntent(input = {}) {
    if (input.intent) return input.intent;
    const text = typeof input.raw_text === "string" ? input.raw_text : "";
    if (input.listing_price_cny || /二手车源|事故|泡水|调表/.test(text)) return "used_text_risk";
    if (/多少钱|价格|售价|优惠/.test(text)) return "price_query";
    if (/维修|改装|骑行教学|故障诊断/.test(text)) return "out_of_scope";
    return "beginner_recommendation";
  }

  function extractAlphaNeeds(input = {}) {
    const needs = { ...(input.needs || {}) };
    const text = typeof input.raw_text === "string" ? input.raw_text : "";
    if (!needs.raw_text && text) needs.raw_text = text;
    if (!needs.usage) {
      if (/通勤|代步/.test(text)) needs.usage = "commute";
      else if (/周末|休闲/.test(text)) needs.usage = "weekend";
      else if (/长途|摩旅/.test(text)) needs.usage = "touring";
    }
    if (!needs.new_used_preference) {
      if (/二手/.test(text) && /新车/.test(text)) needs.new_used_preference = "either";
      else if (/二手/.test(text)) needs.new_used_preference = "used";
      else if (/新车/.test(text)) needs.new_used_preference = "new";
    }
    if (!needs.vehicle_type) {
      for (const type of ["踏板", "街车", "巡航", "太子"]) {
        if (text.includes(type)) {
          needs.vehicle_type = type;
          break;
        }
      }
    }
    return needs;
  }

  function runAlphaOrchestrator(context = {}, dependencies = {}) {
    if (!decisionApi || !recommendationApi || !costApi) throw new Error("alpha_orchestrator_dependency_unavailable");
    const input = context.input || {};
    const cost = costApi.evaluateCostGuard({
      accumulated_model_cost_cny: context.accumulated_model_cost_cny ?? 0,
      estimated_next_call_cost_cny: context.estimated_next_call_cost_cny ?? 0,
    });
    const intent = routeIntent(input);
    const base = {
      schema_version: "motomate_alpha_orchestrator_v0.1",
      run_mode: "development_preview",
      formal_recommendation_allowed: false,
      intent,
      cost_guard: cost,
    };

    if (intent === "out_of_scope") {
      return { ...base, status: "redirected", next_action: "return_to_purchase_decision", result: null };
    }
    if (intent === "used_text_risk") {
      return { ...base, status: "completed", next_action: "show_used_text_guidance", result: usedApi.analyzeUsedListing(input) };
    }
    if (intent === "price_query") {
      return { ...base, status: "completed", next_action: "show_price_state", result: priceApi.resolvePriceQuery(input.price_context || input) };
    }
    if (intent === "external_candidate") {
      return { ...base, status: "completed", next_action: "show_external_verification", result: externalApi.verifyExternalCandidate(input) };
    }

    const needs = extractAlphaNeeds(input);
    const sufficiency = decisionApi.assessSufficiency(needs, context.conversation_state || {});
    if (sufficiency.next_action !== "recommend") {
      return {
        ...base,
        status: sufficiency.status,
        next_action: sufficiency.next_action,
        needs,
        sufficiency,
        result: null,
      };
    }

    const screeningNeeds = {
      ...needs,
      filter_budget_cny: sufficiency.budget.filter_budget_cny,
    };
    const result = recommendationApi.runRecommendationPipeline(dependencies.knowledgeBase, screeningNeeds, {
      allowUnapprovedPreview: true,
      semanticEnrichment: dependencies.semanticEnrichment,
    });
    return {
      ...base,
      status: result.status,
      next_action: "show_development_preview",
      needs,
      sufficiency,
      result,
    };
  }

  const api = { routeIntent, extractAlphaNeeds, runAlphaOrchestrator };
  root.MotoMateAlphaOrchestrator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
