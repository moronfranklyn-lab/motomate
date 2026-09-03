(function initAlphaOrchestrator(root) {
  const decisionApi = root.MotoMateDecisionCore || (typeof require !== "undefined" ? require("./decision-core.js") : null);
  const recommendationApi = root.MotoMateRecommendationPipeline || (typeof require !== "undefined" ? require("./recommendation-pipeline.js") : null);
  const priceApi = root.MotoMatePriceResolver || (typeof require !== "undefined" ? require("./price-resolver.js") : null);
  const usedApi = root.MotoMateUsedTextRiskTool || (typeof require !== "undefined" ? require("./used-text-risk-tool.js") : null);
  const externalApi = root.MotoMateExternalCandidateVerifier || (typeof require !== "undefined" ? require("./external-candidate-verifier.js") : null);
  const costApi = root.MotoMateCostGuard || (typeof require !== "undefined" ? require("./cost-guard.js") : null);

  function routeIntent(input = {}) {
    if (input.intent) return input.intent;
    const needs = input.needs || {};
    const text = typeof input.raw_text === "string" ? input.raw_text : "";
    const hasNeeds = ["budget_cny", "budget_wan", "budget_type", "usage", "new_used_preference", "vehicle_type"].some((field) => needs[field] !== undefined);
    if (!text.trim()) return "beginner_recommendation";
    if (input.listing_price_cny || /二手车源|事故|泡水|调表/.test(text)) return "used_text_risk";
    if (/多少钱|价格|售价|优惠/.test(text)) return "price_query";
    if (/什么|作用|区别|为什么|有必要|有什么用|怎么理解/.test(text)
      && /摩托|机车|骑行|驾照|护具|头盔|排量|座高|车重|ABS|TCS|保养|维修|改装|故障/i.test(text)) return "motorcycle_general";
    if (/没骑过|不会骑|零基础|第一次骑|新手.*怎么办|怎么学骑/.test(text)) return "motorcycle_general";
    if (/试乘|试驾|试坐|门店看车|到店看车|到店验车|原地挪车/.test(text)) return "motorcycle_general";
    if (/(门店|车行|销售|经销商).*(坑|套路|注意|报价|费用|合同|订金|定金|赠品|加价|落地)|(?:坑|套路).*(门店|车行|销售|经销商)/.test(text)) return "motorcycle_general";
    if (/买|选车|推荐|预算|裸车|落地|通勤|代步|新车|二手|踏板|街车|巡航|仿赛|复古|ADV|拉力|对比.*车|\d+(?:\.\d+)?\s*[万wW]|\d{4,6}\s*元/i.test(text)) return "beginner_recommendation";
    if (/摩托|机车|骑行|驾照|护具|头盔|排量|座高|车重|ABS|TCS|保养|维修|改装|故障/i.test(text)) return "motorcycle_general";
    if (/你好|嗨|谢谢|多谢|再见|心情/.test(text)) return "general_brief_redirect";
    return "general_brief_redirect";
  }

  function extractAlphaNeeds(input = {}) {
    const needs = { ...(input.needs || {}) };
    const text = typeof input.raw_text === "string" ? input.raw_text : "";
    if (!needs.raw_text && text) needs.raw_text = text;
    if (!needs.budget_cny && decisionApi?.extractBudgetFromText) {
      const budget = decisionApi.extractBudgetFromText(text);
      if (budget) needs.budget_cny = budget;
    }
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
      for (const type of ["踏板", "街车", "巡航", "太子", "跑车", "拉力", "ADV"]) {
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

    if (intent === "motorcycle_general" || intent === "general_brief_redirect") {
      return { ...base, status: "completed", next_action: "show_open_answer", result: { answer_mode: intent } };
    }
    if (intent === "beginner_recommendation" && input.card_authorized === false) {
      return {
        ...base,
        intent: "motorcycle_general",
        status: "completed",
        next_action: "show_open_answer",
        card_gate: { authorized: false, reason: "current_turn_did_not_authorize_cards" },
        result: { answer_mode: "motorcycle_general" },
      };
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
