(function initDecisionCore(root) {
  const DEFAULT_COST_ASSUMPTIONS = Object.freeze({
    tax_and_fees_cny: { min: 1200, max: 2200, editable: true },
    insurance_cny: { min: 600, max: 1200, editable: true },
    registration_cny: { min: 200, max: 800, editable: true },
    basic_gear_cny: { min: 1500, max: 3000, editable: true },
  });

  const BUDGET_TYPES = new Set(["bare_vehicle_budget", "total_purchase_budget"]);
  const NEW_USED_PREFERENCES = new Set(["new", "used", "either"]);

  const QUESTIONS = Object.freeze({
    budget: "你这次准备拿多少预算买车？",
    budget_type: "这笔预算是只算裸车，还是包含保险、上牌和基础护具的购车总预算？",
    usage: "这辆车最主要用来做什么，比如日常通勤、周末休闲还是长途摩旅？",
    new_used_preference: "你这次主要考虑新车、二手，还是两者都可以？",
  });

  function finitePositiveNumber(value) {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
  }

  const CHINESE_DIGITS = Object.freeze({
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  });

  function parseChineseWanUnit(value) {
    if (value === "十") return 10;
    if (value.length === 1) return CHINESE_DIGITS[value] || null;
    const tens = value.match(/^([一二两三四五六七八九])?十([一二两三四五六七八九])?$/);
    if (!tens) return null;
    return (tens[1] ? CHINESE_DIGITS[tens[1]] : 1) * 10 + (tens[2] ? CHINESE_DIGITS[tens[2]] : 0);
  }

  function extractChineseWanBudget(rawText) {
    const match = rawText.match(/([一二两三四五六七八九十]+)万(?:([一二两三四五六七八九])千|([一二两三四五六七八九]))?/);
    if (!match) return null;
    const matchedText = match[0];
    const matchIndex = match.index || 0;
    const trailingText = rawText.slice(matchIndex + matchedText.length);
    if (/^(?:公里|km)/i.test(trailingText)) return null;
    if (/^(?:几|多)/.test(trailingText) || /十几$/.test(match[1])) return null;
    if (!match[1].includes("十") && match[1].length > 1) return null;
    const wan = parseChineseWanUnit(match[1]);
    if (!wan) return null;
    const thousands = CHINESE_DIGITS[match[2] || match[3]] || 0;
    return finitePositiveNumber(wan * 10000 + thousands * 1000);
  }

  function extractBudgetFromText(rawText) {
    if (typeof rawText !== "string") return null;
    const tenThousand = rawText.match(/(\d+(?:\.\d+)?)\s*[万wW]/);
    if (tenThousand && !/^(?:公里|km)/i.test(rawText.slice((tenThousand.index || 0) + tenThousand[0].length))) {
      return finitePositiveNumber(Number(tenThousand[1]) * 10000);
    }
    const chineseWan = extractChineseWanBudget(rawText);
    if (chineseWan) return chineseWan;
    const yuan = rawText.match(/(\d{4,6})\s*元/);
    return yuan ? finitePositiveNumber(Number(yuan[1])) : null;
  }

  function readBudgetAmount(input = {}) {
    return (
      finitePositiveNumber(input.budget_cny) ??
      (Number.isFinite(input.budget_wan) ? finitePositiveNumber(input.budget_wan * 10000) : null) ??
      extractBudgetFromText(input.raw_text)
    );
  }

  function sumAssumptionBound(assumptions, bound) {
    return Object.values(assumptions).reduce((sum, item) => sum + item[bound], 0);
  }

  function normalizeBudget(input = {}, options = {}) {
    const inputBudgetCny = readBudgetAmount(input);
    const budgetType = BUDGET_TYPES.has(input.budget_type) ? input.budget_type : null;

    if (inputBudgetCny === null) {
      return {
        schema_version: "motomate_budget_v0.1",
        status: "needs_budget",
        input_budget_cny: null,
        budget_type: budgetType,
        next_question_field: "budget",
      };
    }

    if (budgetType === null) {
      return {
        schema_version: "motomate_budget_v0.1",
        status: "needs_budget_type",
        input_budget_cny: inputBudgetCny,
        budget_type: null,
        next_question_field: "budget_type",
      };
    }

    const assumptions = options.assumptions || DEFAULT_COST_ASSUMPTIONS;
    if (budgetType === "bare_vehicle_budget") {
      return {
        schema_version: "motomate_budget_v0.1",
        status: "ready",
        input_budget_cny: inputBudgetCny,
        budget_type: budgetType,
        assumptions,
        available_bare_vehicle_budget_cny: { min: inputBudgetCny, max: inputBudgetCny },
        filter_budget_cny: inputBudgetCny,
        first_choice_must_not_exceed_total_budget: true,
        backup_overrun_limit_ratio: 0.05,
        notes: ["裸车预算不等于购车总成本", "首年持有成本不占用购车总预算"],
      };
    }

    const minReserve = sumAssumptionBound(assumptions, "min");
    const maxReserve = sumAssumptionBound(assumptions, "max");
    const minAvailable = Math.max(0, inputBudgetCny - maxReserve);
    const maxAvailable = Math.max(0, inputBudgetCny - minReserve);
    return {
      schema_version: "motomate_budget_v0.1",
      status: "ready",
      input_budget_cny: inputBudgetCny,
      budget_type: budgetType,
      assumptions,
      available_bare_vehicle_budget_cny: { min: minAvailable, max: maxAvailable },
      filter_budget_cny: maxAvailable,
      first_choice_must_not_exceed_total_budget: true,
      backup_overrun_limit_ratio: 0.05,
      notes: ["费用为可调整估算，不是精确落地价", "首年持有成本不占用购车总预算"],
    };
  }

  function normalizeNewUsedPreference(value) {
    if (NEW_USED_PREFERENCES.has(value)) return value;
    if (value === "new_first") return "new";
    if (value === "used_only") return "used";
    if (value === "new_and_used") return "either";
    return null;
  }

  function assessSufficiency(input = {}, state = {}) {
    const budget = normalizeBudget(input, state.budget_options);
    const missingFields = [];
    if (budget.status === "needs_budget") missingFields.push("budget");
    if (budget.status === "needs_budget_type") missingFields.push("budget_type");
    if (!input.usage) missingFields.push("usage");
    if (!normalizeNewUsedPreference(input.new_used_preference)) missingFields.push("new_used_preference");

    const criticalQuestionCount = Number.isInteger(state.critical_question_count)
      ? state.critical_question_count
      : 0;

    if (missingFields.length === 0) {
      return {
        status: "ready_for_recommendation",
        next_action: "recommend",
        next_question: null,
        next_question_field: null,
        missing_fields: [],
        critical_question_count: criticalQuestionCount,
        budget,
      };
    }

    if (criticalQuestionCount >= 2 && budget.status === "ready") {
      return {
        status: "ready_with_uncertainty",
        next_action: "recommend",
        next_question: null,
        next_question_field: null,
        missing_fields: missingFields,
        critical_question_count: criticalQuestionCount,
        recommendation_scope: "preliminary_candidates",
        uncertainty_disclosure_required: true,
        budget,
      };
    }

    if (criticalQuestionCount >= 2) {
      return {
        status: "partial_advice_only",
        next_action: "partial_advice_only",
        next_question: null,
        next_question_field: null,
        missing_fields: missingFields,
        critical_question_count: criticalQuestionCount,
        specific_recommendation_allowed: false,
        recommendation_scope: "direction_only",
        budget,
      };
    }

    const nextQuestionField = missingFields[0];
    return {
      status: "needs_one_question",
      next_action: "ask_one_question",
      next_question: QUESTIONS[nextQuestionField],
      next_question_field: nextQuestionField,
      missing_fields: missingFields,
      critical_question_count: criticalQuestionCount,
      budget,
    };
  }

  function advanceConversation(input = {}, state = {}) {
    const assessment = assessSufficiency(input, state);
    const questions = assessment.next_question ? [assessment.next_question] : [];
    return {
      ...assessment,
      questions,
      question_count_in_turn: questions.length,
      next_critical_question_count:
        assessment.next_action === "ask_one_question"
          ? assessment.critical_question_count + 1
          : assessment.critical_question_count,
    };
  }

  const api = { extractBudgetFromText, normalizeBudget, assessSufficiency, advanceConversation };
  root.MotoMateDecisionCore = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
