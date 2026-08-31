(function initRecommendationPipeline(root) {
  const rulesApi =
    root.MotoMateRules ||
    (typeof require !== "undefined" ? require("./rules-engine.js") : null);
  const validatorApi =
    root.MotoMateResultValidator ||
    (typeof require !== "undefined" ? require("./result-validator.js") : null);
  const coverageApi =
    root.MotoMateCandidateCoverage ||
    (typeof require !== "undefined" ? require("./candidate-coverage.js") : null);

  function normalizeBudgetCny(needs) {
    if (Number.isFinite(needs?.filter_budget_cny)) return needs.filter_budget_cny;
    if (Number.isFinite(needs?.budget_cny)) return needs.budget_cny;
    if (Number.isFinite(needs?.budget_wan)) return Math.round(needs.budget_wan * 10000);
    return null;
  }

  function matchesType(model, requestedType) {
    if (!requestedType) return true;
    const aliases = {
      "巡航": ["巡航", "巡航太子"],
      "太子": ["巡航", "巡航太子"],
      "街车": ["街车"],
      "踏板": ["踏板"],
    }[requestedType] || [requestedType];
    return aliases.includes(model.vehicle_type);
  }

  function buildUnmetConditions(model, needs, budgetCny) {
    const unmet = [];
    if (budgetCny !== null && model.budget_guard_price_cny > budgetCny) {
      unmet.push({
        field: "budget_cny",
        expected: `<=${budgetCny}`,
        actual: model.budget_guard_price_cny,
        delta_cny: model.budget_guard_price_cny - budgetCny,
      });
    }
    if (needs.vehicle_type && !matchesType(model, needs.vehicle_type)) {
      unmet.push({
        field: "vehicle_type",
        expected: needs.vehicle_type,
        actual: model.vehicle_type,
      });
    }
    return unmet;
  }

  function closestCandidates(knowledgeBase, needs = {}, limit = 3) {
    const budgetCny = normalizeBudgetCny(needs);
    return (knowledgeBase?.models || [])
      .filter((model) => model.rule_pool_eligibility?.status === "eligible")
      .filter((model) => model.sale_status === "current")
      .filter((model) => matchesType(model, needs.vehicle_type))
      .map((model) => ({
        model_id: model.model_id,
        brand: model.brand,
        model_name: model.model_name,
        trim_name: model.trim_name,
        vehicle_type: model.vehicle_type,
        budget_guard_price_cny: model.budget_guard_price_cny,
        review_status: model.recommendation_review_status?.status || "unknown",
        unmet_conditions: buildUnmetConditions(model, needs, budgetCny),
      }))
      .filter((candidate) => candidate.unmet_conditions.length > 0)
      .sort((a, b) => {
        const aBudgetGap = a.unmet_conditions.find((item) => item.field === "budget_cny")?.delta_cny || 0;
        const bBudgetGap = b.unmet_conditions.find((item) => item.field === "budget_cny")?.delta_cny || 0;
        return aBudgetGap - bBudgetGap || a.budget_guard_price_cny - b.budget_guard_price_cny;
      })
      .slice(0, limit);
  }

  function renderTemplateExplanation(candidates) {
    return candidates.map((candidate, index) => ({
      rank: index === 0 ? "首选" : index === 1 ? "次选" : "备选",
      model_id: candidate.model_id,
      title: `${candidate.brand} ${candidate.model_name} ${candidate.trim_name}`,
      summary: "内部 Alpha 预览候选，仅基于当前规则池和低权重语义排序生成。",
      caveats: [
        "当前批次尚未完成正式推荐批准，不得对外宣称为正式推荐。",
        "语义排序信号只用于内部测试，不向用户展示分数。",
      ],
    }));
  }

  function runRecommendationPipeline(knowledgeBase, needs = {}, options = {}) {
    if (!rulesApi?.shortlistModels) throw new Error("rules_engine_unavailable");
    if (!validatorApi?.validateCandidatePoolOutput) throw new Error("result_validator_unavailable");
    if (!coverageApi?.assessCandidateCoverage || !coverageApi?.selectDisplayCandidates) throw new Error("candidate_coverage_unavailable");

    const candidatePool = rulesApi.shortlistModels(knowledgeBase, needs, {
      allowUnapprovedPreview: options.allowUnapprovedPreview === true,
      semanticEnrichment: options.semanticEnrichment,
    });

    if (candidatePool.candidate_count === 0) {
      const closest = closestCandidates(knowledgeBase, needs, options.closestLimit || 3);
      return {
        schema_version: "motomate_recommendation_pipeline_v0.1",
        status: closest.length > 0 ? "no_exact_match" : "no_eligible_candidate",
        formal_recommendation_allowed: false,
        closest_candidates_separate: closest.length > 0,
        condition_auto_relaxed: false,
        candidate_pool: candidatePool,
        closest_candidates: closest,
        result_validation: null,
        recommendations: [],
        display_candidates: [],
        candidate_coverage: coverageApi.assessCandidateCoverage([], needs),
      };
    }

    const candidateCoverage = coverageApi.assessCandidateCoverage(candidatePool.candidates, needs);
    const displayCandidates = coverageApi.selectDisplayCandidates(candidatePool.candidates, needs, 3);
    const recommendations = renderTemplateExplanation(displayCandidates);
    const resultValidation = validatorApi.validateCandidatePoolOutput(
      { recommendations },
      candidatePool,
      { requireApproved: options.requireApproved === true },
    );

    return {
      schema_version: "motomate_recommendation_pipeline_v0.1",
      status: candidatePool.status,
      formal_recommendation_allowed: candidatePool.recommendation_allowed === true,
      closest_candidates_separate: false,
      condition_auto_relaxed: false,
      candidate_pool: candidatePool,
      closest_candidates: [],
      result_validation: resultValidation,
      recommendations: resultValidation.output_blocked ? [] : recommendations,
      display_candidates: resultValidation.output_blocked ? [] : displayCandidates,
      candidate_coverage: candidateCoverage,
      selection_strategy: "semantic_fit_with_budget_tier_diversity_v0.1",
    };
  }

  const api = { runRecommendationPipeline };
  root.MotoMateRecommendationPipeline = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
