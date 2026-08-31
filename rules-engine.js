(function initRulesEngine(root) {
  const TYPE_ALIASES = {
    "巡航": ["巡航", "巡航太子"],
    "太子": ["巡航", "巡航太子"],
    "街车": ["街车"],
    "踏板": ["踏板"],
  };

  const USAGE_TAGS = {
    commute: "urban_commute",
    transport: "daily_transport",
    weekend: "weekend_leisure",
  };

  const INTENSITY_POINTS = { high: 3, medium: 2, low: 0 };
  const BEGINNER_POINTS = { high: 2, medium: 1, low: 0 };
  const PRESSURE_POINTS = { low: 1, medium: 0.5, high: 0 };

  function normalizeBudgetCny(needs) {
    if (Number.isFinite(needs.filter_budget_cny)) return needs.filter_budget_cny;
    if (Number.isFinite(needs.budget_cny)) return needs.budget_cny;
    if (Number.isFinite(needs.budget_wan)) return Math.round(needs.budget_wan * 10000);
    return null;
  }

  function matchesType(model, requestedType) {
    if (!requestedType) return true;
    const aliases = TYPE_ALIASES[requestedType] || [requestedType];
    return aliases.includes(model.vehicle_type);
  }

  function reviewIsApproved(model) {
    return model.recommendation_review_status?.status === "approved";
  }

  function sourceLabel(url, index) {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      const officialHosts = ["haojue.com", "cfmoto.com", "yamaha-motor.com.cn", "wuyang-honda.com"];
      if (officialHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) return `品牌官方来源 ${index + 1}`;
      if (hostname.includes("58moto.com")) return `摩托范参考 ${index + 1}`;
      if (hostname.includes("autohome.com.cn")) return `汽车之家参考 ${index + 1}`;
      return `公开来源 ${index + 1}`;
    } catch {
      return `公开来源 ${index + 1}`;
    }
  }

  function buildEvidence(model) {
    const sources = (model.source_urls || [])
      .filter((url) => typeof url === "string" && /^https?:\/\//.test(url))
      .map((url, index) => ({ label: sourceLabel(url, index), url }));
    return {
      price: {
        display_cny: model.budget_guard_price_cny,
        official_public_price_cny: model.official_public_price_cny ?? null,
        qualified_platform_reference_price_cny: model.qualified_platform_reference_price_cny ?? null,
        official_label: model.official_public_price_label || "官方公开价格",
        policy: "预算筛选使用官方公开价与合格同口径平台价中的较高值。",
      },
      field_statuses: model.fact_verification_status?.fields || {},
      fact_status: model.fact_verification_status?.overall || "unknown",
      rule_evaluated_at: model.rule_pool_eligibility?.evaluated_at || null,
      operational_reviewed_at: model.recommendation_review_status?.reviewed_at || null,
      recommendation_approved: reviewIsApproved(model),
      sources,
    };
  }

  function buildReasonCodes(model, needs, budgetCny) {
    const reasons = [];
    if (needs.vehicle_type && matchesType(model, needs.vehicle_type)) {
      reasons.push("vehicle_type_match");
    }
    if (budgetCny !== null) {
      reasons.push(model.budget_guard_price_cny <= budgetCny ? "within_budget" : "over_budget_preview");
    }
    if (/双通道|前后/.test(model.abs || "")) reasons.push("dual_channel_abs");
    if (/有|标配/.test(model.tcs || "")) reasons.push("traction_control_present");
    return reasons;
  }

  function semanticByModel(enrichment) {
    return new Map((enrichment?.models || []).map((model) => [model.model_id, model]));
  }

  function calculateSemanticSignal(semantic, needs) {
    if (!semantic) return { score: 0, reasons: [], used_fields: [] };

    let score = 0;
    const reasons = [];
    const usedFields = [];
    const usageTag = USAGE_TAGS[needs.usage];
    const usage = semantic.usage_tags?.value?.find((item) => item.tag === usageTag);
    if (usage && semantic.usage_tags.availability === "rule_sorting") {
      score += INTENSITY_POINTS[usage.intensity] || 0;
      reasons.push(`usage_${usage.intensity}`);
      usedFields.push("usage_tags");
    }

    if (needs.rider_experience === "beginner") {
      if (semantic.beginner_friendliness?.availability === "rule_sorting") {
        score += BEGINNER_POINTS[semantic.beginner_friendliness.value] || 0;
        reasons.push(`beginner_friendliness_${semantic.beginner_friendliness.value}`);
        usedFields.push("beginner_friendliness");
      }
      if (semantic.operation_pressure_level?.availability === "rule_sorting") {
        score += PRESSURE_POINTS[semantic.operation_pressure_level.value] || 0;
        reasons.push(`operation_pressure_${semantic.operation_pressure_level.value}`);
        usedFields.push("operation_pressure_level");
      }
    }

    if (
      needs.style_tag &&
      semantic.style_and_power_tags?.availability === "rule_sorting" &&
      semantic.style_and_power_tags.style_tag === needs.style_tag
    ) {
      score += 1;
      reasons.push("style_preference_match");
      usedFields.push("style_and_power_tags.style_tag");
    }

    if (
      needs.power_band &&
      semantic.style_and_power_tags?.availability === "rule_sorting" &&
      semantic.style_and_power_tags.power_band !== "unknown" &&
      semantic.style_and_power_tags.power_band === needs.power_band
    ) {
      score += 1;
      reasons.push("power_preference_match");
      usedFields.push("style_and_power_tags.power_band");
    }

    return { score, reasons, used_fields: usedFields };
  }

  function shortlistModels(knowledgeBase, needs = {}, options = {}) {
    const models = Array.isArray(knowledgeBase?.models) ? knowledgeBase.models : [];
    const budgetCny = normalizeBudgetCny(needs);
    const allowUnapprovedPreview = options.allowUnapprovedPreview === true;
    const hasSemanticEnrichment = Array.isArray(options.semanticEnrichment?.models);
    const semanticIndex = semanticByModel(options.semanticEnrichment);

    const candidates = models
      .filter((model) => model.rule_pool_eligibility?.status === "eligible")
      .filter((model) => model.sale_status === "current")
      .filter((model) => matchesType(model, needs.vehicle_type))
      .filter((model) => budgetCny === null || model.budget_guard_price_cny <= budgetCny)
      .filter((model) => allowUnapprovedPreview || reviewIsApproved(model))
      .map((model) => {
        const semanticSignal = calculateSemanticSignal(semanticIndex.get(model.model_id), needs);
        return {
          model_id: model.model_id,
          brand: model.brand,
          model_name: model.model_name,
          trim_name: model.trim_name,
          vehicle_type: model.vehicle_type,
          budget_guard_price_cny: model.budget_guard_price_cny,
          seat_height_mm: model.seat_height_mm,
          curb_weight_kg: model.curb_weight_kg,
          max_power_kw: model.max_power_kw,
          abs: model.abs,
          tcs: model.tcs,
          review_status: model.recommendation_review_status?.status || "unknown",
          reason_codes: [
            ...buildReasonCodes(model, needs, budgetCny),
            ...semanticSignal.reasons,
          ],
          internal_semantic_signal: semanticSignal.score,
          semantic_fields_used: semanticSignal.used_fields,
          source_urls: model.source_urls || [],
          evidence: buildEvidence(model),
        };
      })
      .sort(
        (a, b) =>
          b.internal_semantic_signal - a.internal_semantic_signal ||
          a.budget_guard_price_cny - b.budget_guard_price_cny,
      );

    const approvedCount = candidates.filter((candidate) => candidate.review_status === "approved").length;
    return {
      status: candidates.length === 0 ? "no_eligible_candidate" : allowUnapprovedPreview ? "development_preview" : "recommendable",
      recommendation_allowed: candidates.length > 0 && approvedCount === candidates.length,
      ranking_status: hasSemanticEnrichment ? "partial_semantic_v0.1" : "incomplete_missing_semantic_labels",
      semantic_policy: "v0.1_low_weight_internal_only",
      semantic_score_user_visible: false,
      budget_cny: budgetCny,
      candidate_count: candidates.length,
      candidates,
      missing_ranking_fields: hasSemanticEnrichment
        ? ["maintenance_convenience", "verified_subjective_experience"]
        : [
            "usage_tags",
            "operation_pressure_level",
            "beginner_friendliness",
            "maintenance_convenience",
            "style_and_power_tags",
          ],
    };
  }

  const api = { shortlistModels };
  root.MotoMateRules = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
