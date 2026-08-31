(function initUsedTextRiskTool(root) {
  const FIELD_DEFINITIONS = Object.freeze([
    ["model", "车型"],
    ["year", "年份/首次登记时间"],
    ["mileage_km", "里程"],
    ["listing_price_cny", "挂牌价"],
    ["region", "车辆所在地"],
    ["transfer_count", "过户次数"],
    ["procedures", "手续状态"],
    ["condition", "明确车况说明"],
    ["seller_description", "卖家描述"],
  ]);

  const CRITICAL_FIELDS = new Set(["model", "year", "mileage_km", "listing_price_cny", "condition"]);
  const DIAGNOSIS_PATTERN = /事故|泡水|调表|真实车况|鉴定/;

  const QUESTION_BY_FIELD = Object.freeze({
    model: "请卖家确认完整车型、年款和具体配置。",
    year: "请卖家提供首次登记日期，并确认车辆年款。",
    mileage_km: "请卖家提供当前表显里程和保养记录。",
    listing_price_cny: "请卖家确认挂牌价包含哪些费用，是否还有附加条件。",
    region: "请卖家确认车辆所在地及能否配合本地过户。",
    transfer_count: "请卖家确认过户次数、当前登记人是否为本人。",
    procedures: "请卖家确认登记证、行驶证、购车凭证和违章状态。",
    condition: "请卖家说明维修、摔车、进水和主要部件更换情况，并提供可核验记录。",
    seller_description: "请卖家补充车辆使用、保养和出售原因。",
  });

  const INSPECTION_CHECKLIST = Object.freeze([
    "核对车架号、发动机号与证件是否一致",
    "检查车架、转向限位、焊点和覆盖件是否存在异常修复痕迹",
    "检查线束、插头、金属件和座桶等位置是否存在进水或锈蚀痕迹",
    "核对仪表里程与保养、维修及轮胎磨损记录是否相互一致",
    "冷车启动并检查发动机、制动、轮胎、减震和灯光",
    "在交易前安排独立第三方或专业维修机构线下检测",
  ]);

  function hasValue(value) {
    if (typeof value === "string") return value.trim().length > 0;
    return value !== null && value !== undefined;
  }

  function analyzeUsedListing(input = {}) {
    const extractedFields = {};
    const informationGaps = [];

    for (const [field, label] of FIELD_DEFINITIONS) {
      if (hasValue(input[field])) extractedFields[field] = input[field];
      else {
        informationGaps.push({
          field,
          label,
          importance: CRITICAL_FIELDS.has(field) ? "critical" : "supporting",
        });
      }
    }

    const diagnosisRequested =
      typeof input.raw_text === "string" && DIAGNOSIS_PATTERN.test(input.raw_text);
    const missingFields = informationGaps.map((gap) => gap.field);

    return {
      schema_version: "motomate_used_text_risk_v0.1",
      status: diagnosisRequested ? "guidance_only" : "analysis_ready",
      extracted_fields: extractedFields,
      information_gaps: informationGaps,
      missing_fields: missingFields,
      risk_flags: informationGaps
        .filter((gap) => gap.importance === "critical")
        .map((gap) => ({ code: `missing_${gap.field}`, severity: "needs_confirmation" })),
      seller_questions: informationGaps.map((gap) => QUESTION_BY_FIELD[gap.field]),
      inspection_checklist: [...INSPECTION_CHECKLIST],
      diagnosis_refused: diagnosisRequested,
      offline_inspection_guidance: true,
      fabricated_condition_forbidden: true,
      not_a_vehicle_inspection_disclaimer:
        "本结果仅整理车源信息和核查重点，不能鉴定事故、泡水、调表或真实车况，也不能替代线下专业检测。",
    };
  }

  const api = { analyzeUsedListing };
  root.MotoMateUsedTextRiskTool = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
