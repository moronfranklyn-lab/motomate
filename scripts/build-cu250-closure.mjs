import fs from "node:fs";

const officialIndex = "https://api.vogemotor.com/?m=Mobile&c=MajorProduct&a=production_class_list&lang=1";
const platform = "https://car.autohome.com.cn/motorbike/params/10210810";
const evaluatedAt = "2026-08-31T13:10:00+08:00";
const configs = [
  {id:"voge_cu250_current_manual",trim:"手动挡",price:16480,weight:178,officialId:31,transmission:"国际6挡"},
  {id:"voge_cu250_current_automatic",trim:"自动挡",price:18980,weight:182,officialId:37,transmission:"AMT6速自动挡"},
];

const models = configs.map((c) => {
  const officialDetail = `https://api.vogemotor.com/?m=Mobile&c=MajorProduct&a=get_product_info&id=${c.officialId}&store_id=21&lang=1&types=`;
  return {
    model_id:c.id,brand:"无极",manufacturer:"隆鑫通用动力股份有限公司",model_name:"CU250Ⅱ代",model_year:"current_version",trim_name:c.trim,
    sale_status:"current",vehicle_type:"巡航",official_public_price_cny:c.price,official_public_price_label:"官网公开API price字段",
    qualified_platform_reference_price_cny:null,platform_reference_price_cny:c.price,
    platform_reference_note:"汽车之家同配置参考价；未按24小时合格平台价格历史流程入账，仅作交叉参考",
    budget_guard_price_cny:c.price,displacement_cc:250,seat_height_mm:710,curb_weight_kg:c.weight,max_power_kw:20,fuel_tank_l:15,
    abs:null,tcs:null,transmission:c.transmission,
    fact_verification_status:{overall:"sufficient_for_rules",fields:{
      sale_status:"official_verified",official_public_price_cny:"official_verified",trim_name:"official_verified",displacement_cc:"official_verified",
      seat_height_mm:"official_verified",curb_weight_kg:"official_verified",max_power_kw:"official_verified",fuel_tank_l:"official_verified",
      abs:"unverified_non_hard_null",tcs:"unverified_non_hard_null",vehicle_type:"official_verified",
    }},
    rule_pool_eligibility:{status:"eligible",blockers:[],rule_version:"kb_admission_v0.2",evaluated_at:evaluatedAt},
    recommendation_review_status:{status:"codex_reviewed",review_notes:["Official directory/detail API and Autohome trim binding reviewed; ABS/TCS remain null; recommendation approval not granted"],reviewed_at:evaluatedAt},
    source_urls:[officialIndex,officialDetail,platform],
  };
});

const semantics = configs.map((c) => ({
  model_id:c.id,model_year:"current_version",trim_name:c.trim,
  usage_tags:{value:[{tag:"urban_commute",intensity:"low"},{tag:"weekend_leisure",intensity:"high"}],basis_type:"product_hypothesis",derivation_rule:"usage_by_vehicle_type",derivation_version:"v0.2",inputs:{vehicle_type:"巡航"},availability:"rule_sorting"},
  operation_pressure_level:{value:"medium",basis_type:"product_hypothesis",derivation_rule:"measurable_operation_pressure",derivation_version:"v0.1",inputs:{max_power_kw:20,curb_weight_kg:c.weight,seat_height_mm:710},component_points:{power:1,weight:c.weight>=180?2:1,seat_height:0,total:c.weight>=180?3:2},unknown_components:["throttle_response","low_speed_handling","experience_requirement"],availability:"rule_sorting"},
  beginner_friendliness:{value:"medium",basis_type:"product_hypothesis",derivation_rule:"beginner_safety_candidate",derivation_version:"v0.1",inputs:{operation_pressure:"medium",abs:null,tcs:null},limitations:["ABS与TCS未达到核验门槛","仅低权重内部测试，不构成安全保证"],availability:"rule_sorting"},
  maintenance_convenience:{value:null,status:"unknown",missing_evidence:["service_network","parts_availability","maintenance_cost"],availability:"unavailable"},
  style_and_power_tags:{style_tag:"cruiser",power_band:"moderate",basis_type:"deterministic_derived",derivation_rule:"style_and_power",derivation_version:"v0.2",inputs:{vehicle_type:"巡航",max_power_kw:20},availability:"rule_sorting"},
}));

const verifiedPath = "knowledge_base_outputs/verified_fields/cu250_closure_additions_v0.1.json";
fs.writeFileSync(verifiedPath,`${JSON.stringify({schema_version:"kb_mvp_additions_v0.1",batch_id:"cu250_closure_2026-08-31",created_at:evaluatedAt,recommendation_approved_count:0,models},null,2)}\n`);
const alpha = JSON.parse(fs.readFileSync("knowledge_base_outputs/eligible_pool/alpha_pool_v0.1.json","utf8"));
const poolModels = [...alpha.models,...models];
fs.writeFileSync("knowledge_base_outputs/eligible_pool/mvp_eligible_pool_v0.1.json",`${JSON.stringify({schema_version:"kb_eligible_pool_v0.2",pool_version:"mvp_eligible_pool_v0.1",created_at:evaluatedAt,rule_version:"kb_admission_v0.2",source_scope:"alpha_pool_v0.1_plus_cu250_closure",usage_scope:"internal_development_preview_not_recommendation_approved",recommendation_approved_count:0,models:poolModels},null,2)}\n`);
fs.writeFileSync("knowledge_base_outputs/eligible_pool/mvp_eligible_manifest_v0.1.json",`${JSON.stringify({schema_version:"kb_eligible_pool_manifest_v0.2",active_pool_file:"knowledge_base_outputs/eligible_pool/mvp_eligible_pool_v0.1.json",pool_version:"mvp_eligible_pool_v0.1",base_pool_file:"knowledge_base_outputs/eligible_pool/alpha_pool_v0.1.json",additions_file:verifiedPath,model_count:poolModels.length,eligible_count:poolModels.length,blocked_count:0,recommendation_approved_count:0,rule_version:"kb_admission_v0.2",usage_scope:"internal_development_preview_not_recommendation_approved",closed_at:evaluatedAt},null,2)}\n`);
const alphaSemantic = JSON.parse(fs.readFileSync("knowledge_base_outputs/semantic_enrichment/alpha_semantic_v0.2.json","utf8"));
fs.writeFileSync("knowledge_base_outputs/semantic_enrichment/mvp_semantic_v0.1.json",`${JSON.stringify({...alphaSemantic,enrichment_version:"mvp_semantic_v0.1",created_at:evaluatedAt,source_pool:"knowledge_base_outputs/eligible_pool/mvp_eligible_pool_v0.1.json",source_pool_version:"mvp_eligible_pool_v0.1",models:[...alphaSemantic.models,...semantics]},null,2)}\n`);
fs.writeFileSync("knowledge_base_outputs/semantic_enrichment/mvp_semantic_manifest_v0.1.json",`${JSON.stringify({schema_version:"kb_semantic_manifest_v0.2",active_file:"knowledge_base_outputs/semantic_enrichment/mvp_semantic_v0.1.json",source_pool:"knowledge_base_outputs/eligible_pool/mvp_eligible_pool_v0.1.json",model_count:alphaSemantic.models.length+semantics.length,usage_tags_rule_sorting_count:17,operation_pressure_rule_sorting_count:15,beginner_friendliness_rule_sorting_count:15,style_rule_sorting_count:17,power_band_rule_sorting_count:16,maintenance_convenience_rule_sorting_count:0,recommendation_approved_count:0,model_api_calls:0,product_strategy:"option_a_low_weight_internal_testing"},null,2)}\n`);
console.log(JSON.stringify({mvp_eligible_count:poolModels.length,semantic_count:alphaSemantic.models.length+semantics.length,recommendation_approved_count:0},null,2));
