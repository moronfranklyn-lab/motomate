import fs from "node:fs";

const official = "https://www.wuyang-honda.com/home/cpzs/ryj/qsj/detail-1651.shtml";
const officialIndex = "https://www.wuyang-honda.com/home/cpzs/ryj/index.shtml";
const platform = "https://car.autohome.com.cn/motorbike/series/10211222";
const evaluatedAt = "2026-08-31T12:15:00+08:00";
const configs = [
  { id: "wuyang_honda_cgx150_current_standard", trim: "标准版", price: 10080, weight: 125, specId: 10274005 },
  { id: "wuyang_honda_cgx150_current_sidebag", trim: "边包版", price: 11480, weight: 128, specId: 10274007 },
  { id: "wuyang_honda_cgx150_current_special", trim: "特别版", price: 11680, weight: 126, specId: 10274006 },
];

const models = configs.map((config) => ({
  model_id: config.id,
  brand: "本田系合资",
  manufacturer: "五羊-本田摩托（广州）有限公司",
  model_name: "CGX150",
  model_year: "current_version",
  legacy_year_observation: "2025",
  trim_name: config.trim,
  sale_status: "current",
  vehicle_type: "复古",
  official_public_price_cny: config.price,
  official_public_price_label: "官网建议零售价",
  qualified_platform_reference_price_cny: null,
  platform_reference_price_cny: config.price,
  platform_reference_note: `汽车之家2025款同配置参考价，spec_id=${config.specId}；因官网current_version未声明具体年份，不参与budget_guard计算`,
  budget_guard_price_cny: config.price,
  displacement_cc: 149,
  seat_height_mm: 740,
  curb_weight_kg: config.weight,
  max_power_kw: 8.8,
  fuel_tank_l: 10,
  abs: "前轮ABS",
  tcs: null,
  fact_verification_status: {
    overall: "sufficient_for_rules",
    fields: {
      sale_status: "official_verified", official_public_price_cny: "official_verified", trim_name: "official_verified",
      displacement_cc: "official_verified", seat_height_mm: "official_verified", curb_weight_kg: "official_verified",
      max_power_kw: "official_verified", fuel_tank_l: "official_verified", abs: "official_verified",
      tcs: "unverified_non_hard_null", vehicle_type: "official_supported_style",
    },
  },
  rule_pool_eligibility: { status: "eligible", blockers: [], rule_version: "kb_admission_v0.2", evaluated_at: evaluatedAt },
  recommendation_review_status: {
    status: "codex_reviewed",
    review_notes: ["Official trim/price/spec evidence cross-checked against the matching 2025 Autohome trim; TCS remains null; recommendation approval not granted"],
    reviewed_at: evaluatedAt,
  },
  source_urls: [officialIndex, official, platform],
}));

function semantic(config) {
  return {
    model_id: config.id, model_year: "current_version", trim_name: config.trim,
    usage_tags: {
      value: [{tag:"urban_commute",intensity:"medium"},{tag:"weekend_leisure",intensity:"high"}],
      basis_type:"product_hypothesis", derivation_rule:"usage_by_vehicle_type", derivation_version:"v0.2",
      inputs:{vehicle_type:"复古"}, availability:"rule_sorting",
    },
    operation_pressure_level: {
      value:"low", basis_type:"product_hypothesis", derivation_rule:"measurable_operation_pressure", derivation_version:"v0.1",
      inputs:{max_power_kw:8.8,curb_weight_kg:config.weight,seat_height_mm:740},
      component_points:{power:0,weight:0,seat_height:0,total:0},
      unknown_components:["throttle_response","low_speed_handling","experience_requirement"], availability:"rule_sorting",
    },
    beginner_friendliness: {
      value:"high", basis_type:"product_hypothesis", derivation_rule:"beginner_safety_candidate", derivation_version:"v0.1",
      inputs:{operation_pressure:"low",abs:"前轮ABS",tcs:null},
      limitations:["仅前轮ABS","TCS未核验","仅低权重内部测试，不构成安全保证"], availability:"rule_sorting",
    },
    maintenance_convenience: {
      value:null,status:"unknown",missing_evidence:["service_network","parts_availability","maintenance_cost"],availability:"unavailable",
    },
    style_and_power_tags: {
      style_tag:"retro",power_band:"entry",basis_type:"deterministic_derived",derivation_rule:"style_and_power",derivation_version:"v0.2",
      inputs:{vehicle_type:"复古",max_power_kw:8.8},availability:"rule_sorting",
    },
  };
}

fs.writeFileSync("knowledge_base_outputs/verified_fields/cgx150_closure_additions_v0.1.json", `${JSON.stringify({
  schema_version:"kb_alpha_additions_v0.1",batch_id:"cgx150_closure_2026-08-31",created_at:evaluatedAt,recommendation_approved_count:0,models,
}, null, 2)}\n`);
fs.writeFileSync("knowledge_base_outputs/semantic_enrichment/cgx150_semantic_additions_v0.1.json", `${JSON.stringify({
  schema_version:"kb_semantic_additions_v0.1",created_at:evaluatedAt,recommendation_approved_count:0,models:configs.map(semantic),
}, null, 2)}\n`);
console.log(JSON.stringify({verified_models:models.length,semantic_models:configs.length,recommendation_approved_count:0},null,2));
