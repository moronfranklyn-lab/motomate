import fs from "node:fs";

const discoveryPath = "knowledge_base_outputs/expansion/route_validation/discovery_2026-09-01.json";
const discovery = JSON.parse(fs.readFileSync(discoveryPath,"utf8"));
const allResults = Object.values(discovery.batches).flat(2).flatMap((run) => run.results || []);
const capturedAt = discovery.captured_at;
function sourcesFor(terms) {
  return allResults.filter((item) => terms.some((term) => `${item.title} ${item.snippet}`.toLowerCase().includes(term.toLowerCase())))
    .map(({title,url,source_type,snippet,published_at}) => ({title,url,source_type,snippet,published_at,evidence_status:"discovery_only_unverified"}));
}
function record(group, model_id, brand, model_name, trim_name, terms, blockers) {
  return {
    group,model_id,brand,manufacturer:null,model_name,trim_name,current_version:null,china_sale_status:null,
    official_public_price_cny:null,official_price_label:null,
    displacement_cc:null,vehicle_registration_class:null,registration_eligibility:null,
    max_power_kw:null,rated_power_kw:null,top_speed_kmh:null,range_km:null,range_test_cycle:null,
    seat_height_mm:null,curb_weight_kg:null,fuel_tank_l:null,battery_spec:null,abs:null,tcs:null,vehicle_type:null,
    fact_verification_status:{overall:"not_started",fields:{}},
    expansion_pool_eligibility:{status:"blocked",blockers,rule_version:"kb_expansion_admission_v0.1",evaluated_at:capturedAt},
    recommendation_review_status:{status:"not_started",review_notes:["Discovery only; no recommendation approval"],reviewed_at:null},
    discovery_sources:sourcesFor(terms),
  };
}
const large = [
  record("large_displacement","cfmoto_675srr_current_standard","春风","675SR-R","标准版",["675sr-r"],["官方中国当前在售、价格、配置与排量阈值待核验"]),
  record("large_displacement","cfmoto_675nk_current_standard","春风","675NK","标准版",["675nk"],["官方中国当前在售、价格、配置与排量阈值待核验"]),
  record("large_displacement","qjmotor_xiao600_current_standard","QJMOTOR","骁600","标准版",["骁600"],["官网当前在售、具体配置、官方价格与排量待核验"]),
  record("large_displacement","voge_cu530_current_standard","无极","CU530","标准版",["cu530"],["官网详情ID、官方价格口径和排量待核验"]),
  record("large_displacement","voge_ds525x_current_wilderness","无极","DS525X","旷野版",["ds525x","ds500x"],["官网目录确认当前车型与494mL，但官网价格字段为占位符xxxxx，缺有效官方公开价格"]),
  record("large_displacement","benda_chinchilla500_current_standard","奔达","金吉拉500","标准版",["金吉拉500"],["奔达官网当前在售、官方价格及配置参数待核验"]),
  record("large_displacement","honda_cb500sf_current_standard","本田系","CB500SF","标准版",["cb500sf"],["中国销售主体、正式上市状态、官网价格与配置待核验"]),
  record("large_displacement","honda_cbr500r_current_standard","本田系","CBR500R","标准版",["cbr500r"],["中国销售主体、正式上市状态、官网价格与配置待核验"]),
  record("large_displacement","yamaha_mt07_current_standard","雅马哈系","MT-07","标准版",["mt-07"],["中国官网当前在售和官方价格未取得；不得用历史二手信息替代"]),
  record("large_displacement","cfmoto_800nk_current_standard","春风","800NK","标准版",[],[]),
  record("large_displacement","cfmoto_800mtx_current_standard","春风","800MT-X","标准版",[],[]),
  record("large_displacement","cfmoto_750srs_current_standard","春风","750SR-S","标准版",[],[]),
  record("large_displacement","cfmoto_700mt_current_loboo","春风","700MT","LOBOO三箱版",[],[]),
  record("large_displacement","cfmoto_1000mtx_current_standard","春风","1000MT-X","标准版",[],[]),
  record("large_displacement","cfmoto_800mtes_current_standard","春风","800MT-ES","标准版",[],[]),
  record("large_displacement","cfmoto_800mtexplore_current_standard","春风","800MT Explore","探险版",[],[]),
  record("large_displacement","cfmoto_500srvoom_current_standard","春风","500SR VOOM","标准版",[],[]),
  record("large_displacement","cfmoto_550clc_current_standard","春风","550CL-C","标准版",[],[]),
  record("large_displacement","cfmoto_500sr_current_standard","春风","500SR","标准版",[],[]),
];
const electric = [
  record("electric_motorcycle","ninebot_e300p_mk2_current_standard","九号","E300P MK2","标准版",["e300p mk2"],["官网当前在售、官方价格、机动车目录/登记属性待核验"]),
  record("electric_motorcycle","niu_rqi_current_standard","小牛","RQi","标准版",["rqi"],["搜索价格明显可能错配；官网价格和机动车登记属性待核验"]),
  record("electric_motorcycle","niu_nqi_gt_current_power","小牛","NQi GT","动力版",["nqi gt"],["当前版本、官网价格及机动车登记属性待核验"]),
  record("electric_motorcycle","zeeho_ae6_current_pro","极核","AE6","Pro版",["ae6 pro"],["官网当前配置价格、机动车属性和性能参数待核验"]),
  record("electric_motorcycle","zeeho_ae6_current_max","极核","AE6","Max版",["ae6 max"],["官网当前配置价格、机动车属性和性能参数待核验"]),
  record("electric_motorcycle","zeeho_ae4_2026_standard","极核","AE4","标准版",["2026款极核ae4"],["官网具体配置、官方价格和机动车登记属性待核验"]),
  record("electric_motorcycle","senlan_es5_current_standard","森蓝","ES5","标准版",["森蓝es5"],["森蓝官网当前在售、官方价格和机动车登记属性待核验"]),
  record("electric_motorcycle","senlan_ex1_current_standard","森蓝","EX1","标准版",["森蓝ex1"],["不同配置价格区间、机动车类别和登记属性待核验"]),
];
const cu530 = large.find((record) => record.model_id === "voge_cu530_current_standard");
Object.assign(cu530, {
  manufacturer:"隆鑫通用动力股份有限公司",current_version:true,china_sale_status:"current",
  official_public_price_cny:21980,official_price_label:"官网公开API price字段",displacement_cc:500,max_power_kw:41,
  seat_height_mm:710,curb_weight_kg:195,fuel_tank_l:15,vehicle_type:"巡航",abs:null,tcs:null,
  fact_verification_status:{overall:"sufficient_for_expansion_rules",fields:{china_sale_status:"official_verified",official_public_price_cny:"official_verified",displacement_cc:"official_verified",max_power_kw:"official_verified",seat_height_mm:"official_verified",curb_weight_kg:"official_verified",fuel_tank_l:"official_verified",abs:"unverified",tcs:"unverified"}},
  expansion_pool_eligibility:{status:"eligible",blockers:[],rule_version:"kb_expansion_admission_v0.1",evaluated_at:capturedAt},
  recommendation_review_status:{status:"codex_reviewed",review_notes:["Official VOGE directory/detail API reviewed; ABS/TCS remain null; no recommendation approval"],reviewed_at:capturedAt},
  official_sources:[
    {url:"https://api.vogemotor.com/?m=Mobile&c=MajorProduct&a=production_class_list&lang=1",source_type:"official_api",captured_at:capturedAt},
    {url:"https://api.vogemotor.com/?m=Mobile&c=MajorProduct&a=get_product_info&id=45&store_id=21&lang=1&types=",source_type:"official_api",captured_at:capturedAt},
  ],
});
const cfmotoEvidence = {
  cfmoto_675srr_current_standard: {
    price:39580,displacement:675,power:70,seat:810,weight:195,tank:15,
    abs:"标配",tcs:"标配（两段可调可关闭）",type:"跑车",
    url:"https://www.cfmoto.com/motorcycles/675SR-R",
    input:"knowledge_base_inputs/expansion_public_sources/cfmoto_675srr_current_standard.json",
    draft:"knowledge_base_outputs/extraction_drafts/zhipu_2026-09-01T03-00-58-128Z.json",
  },
  cfmoto_675nk_current_standard: {
    price:35980,displacement:675,power:70,seat:810,weight:189,tank:15,
    abs:"标配",tcs:"2段可调可关闭",type:"街车",
    url:"https://www.cfmoto.com/motorcycles/675NK",
    input:"knowledge_base_inputs/expansion_public_sources/cfmoto_675nk_current_standard.json",
    draft:"knowledge_base_outputs/extraction_drafts/zhipu_2026-09-01T03-01-06-812Z.json",
  },
  cfmoto_800nk_current_standard:{price:42580,displacement:799,power:74,seat:795,weight:186,tank:15,abs:"博世直线/弯道ABS",tcs:"博世全功能TC",type:"街车",url:"https://www.cfmoto.com/motorcycles/800NK",input:"knowledge_base_inputs/expansion_public_sources/cfmoto_800nk_current_standard.json",draft:"knowledge_base_outputs/extraction_drafts/zhipu_2026-09-01T08-09-25-235Z.json"},
  cfmoto_800mtx_current_standard:{price:53680,displacement:799,power:70,seat:830,weight:214,tank:22.5,abs:"博世直线+弯道ABS",tcs:"博世电子TC",type:"拉力",url:"https://www.cfmoto.com/motorcycles/800MT-X",input:"knowledge_base_inputs/expansion_public_sources/cfmoto_800mtx_current_standard.json",draft:"knowledge_base_outputs/extraction_drafts/zhipu_2026-09-01T08-09-36-078Z.json"},
  cfmoto_750srs_current_standard:{price:44980,displacement:749,power:82,seat:805,weight:213,tank:17,abs:"直线+弯道ABS标配",tcs:"直线+弯道TC标配（两段可调）",type:"跑车",url:"https://www.cfmoto.com/motorcycles/750SR-S",input:"knowledge_base_inputs/expansion_public_sources/cfmoto_750srs_current_standard.json",draft:"knowledge_base_outputs/extraction_drafts/zhipu_2026-09-01T08-09-47-284Z.json"},
  cfmoto_700mt_current_loboo:{price:33680,displacement:693,power:50,seat:800,weight:240,tank:20,abs:"标配",tcs:"标配（后轮ABS与TC可关）",type:"拉力",url:"https://www.cfmoto.com/motorcycles/700MT",input:"knowledge_base_inputs/expansion_public_sources/cfmoto_700mt_current_standard.json",draft:"knowledge_base_outputs/extraction_drafts/zhipu_2026-09-01T08-09-53-798Z.json"},
  cfmoto_1000mtx_current_standard:{price:59680,displacement:946.2,power:83,seat:830,weight:219,tank:22.5,abs:"博世直线+弯道ABS",tcs:"博世三段可调全功能TC",type:"拉力",url:"https://www.cfmoto.com/motorcycles/1000mt-x",input:"knowledge_base_inputs/expansion_public_sources/cfmoto_1000mtx_current_standard.json",draft:"knowledge_base_outputs/extraction_drafts/zhipu_2026-09-01T08-10-03-170Z.json"},
  cfmoto_800mtes_current_standard:{price:53980,displacement:799,power:70,seat:825,weight:234,tank:19,abs:"博世直线+弯道ABS",tcs:"博世全功能TC",type:"拉力",url:"https://www.cfmoto.com/motorcycles/800mt-es",input:"knowledge_base_inputs/expansion_public_sources/cfmoto_800mtes_current_standard.json",draft:"knowledge_base_outputs/extraction_drafts/zhipu_2026-09-01T08-10-16-311Z.json"},
  cfmoto_800mtexplore_current_standard:{price:53980,displacement:799,power:70,seat:825,weight:231,tank:19,abs:"博世直线+弯道ABS",tcs:"博世全功能TC",type:"拉力",url:"https://www.cfmoto.com/motorcycles/800mt-explore",input:"knowledge_base_inputs/expansion_public_sources/cfmoto_800mtexplore_current_standard.json",draft:"knowledge_base_outputs/extraction_drafts/zhipu_2026-09-01T08-10-32-008Z.json"},
  cfmoto_500srvoom_current_standard:{price:28580,displacement:500,power:58,seat:795,weight:194,tank:15.5,abs:"大陆ABS标配",tcs:"两段TC标配",type:"跑车",url:"https://www.cfmoto.com/motorcycles/500SR-VOOM",input:"knowledge_base_inputs/expansion_public_sources/cfmoto_500srvoom_current_standard.json",draft:"knowledge_base_outputs/extraction_drafts/zhipu_2026-09-01T08-10-43-364Z.json"},
  cfmoto_550clc_current_standard:{price:25880,displacement:526,power:39,seat:710,weight:195,tank:14,abs:"标配",tcs:"标配",type:"巡航",url:"https://www.cfmoto.com/motorcycles/550cl-c",input:"knowledge_base_inputs/expansion_public_sources/cfmoto_550clc_current_standard.json",draft:"knowledge_base_outputs/extraction_drafts/zhipu_2026-09-01T08-10-55-508Z.json"},
  cfmoto_500sr_current_standard:{price:28980,displacement:500,power:58,seat:805,weight:187,tank:15.5,abs:"大陆ABS标配（后轮可关）",tcs:"两段TC标配（可关）",type:"跑车",url:"https://www.cfmoto.com/motorcycles/500sr",input:"knowledge_base_inputs/expansion_public_sources/cfmoto_500sr_current_standard.json",draft:"knowledge_base_outputs/extraction_drafts/zhipu_2026-09-01T08-11-10-145Z.json"},
};
for (const [modelId, evidence] of Object.entries(cfmotoEvidence)) {
  const item = large.find((candidate) => candidate.model_id === modelId);
  Object.assign(item, {
    manufacturer:"浙江春风动力股份有限公司",current_version:true,china_sale_status:"current",
    official_public_price_cny:evidence.price,official_price_label:"官网售价",
    displacement_cc:evidence.displacement,max_power_kw:evidence.power,seat_height_mm:evidence.seat,
    curb_weight_kg:evidence.weight,fuel_tank_l:evidence.tank,abs:evidence.abs,tcs:evidence.tcs,
    vehicle_type:evidence.type,
    fact_verification_status:{overall:"sufficient_for_expansion_rules",fields:{china_sale_status:"official_verified",official_public_price_cny:"official_verified",displacement_cc:"official_verified",max_power_kw:"official_verified",seat_height_mm:"official_verified",curb_weight_kg:"official_verified",fuel_tank_l:"official_verified",abs:"official_verified",tcs:"official_verified"}},
    expansion_pool_eligibility:{status:"eligible",blockers:[],rule_version:"kb_expansion_admission_v0.1",evaluated_at:"2026-09-01T08:15:00.000Z"},
    recommendation_review_status:{status:"codex_reviewed",review_notes:["Official CFMOTO single-model page reviewed; model extraction trim was rejected and registry trim retained deterministically; no recommendation approval"],reviewed_at:"2026-09-01T03:02:00.000Z"},
    official_sources:[{url:evidence.url,source_type:"official_page",captured_at:"2026-09-01T08:05:00.000Z",supports:["current_version","price","displacement","power","seat_height","curb_weight","fuel_tank","abs","tcs"]}],
    evidence_input_path:evidence.input,extraction_draft_path:evidence.draft,
  });
}
const records = [...large,...electric];
const eligibleCount=records.filter((record)=>record.expansion_pool_eligibility.status==="eligible").length;
const output = {schema_version:"kb_expansion_candidate_registry_v0.1",generated_at:new Date().toISOString(),scope_rule:"knowledge_base_outputs/expansion/扩展知识库范围与字段规则V0.1.md",source_discovery:discoveryPath,large_displacement_definition:">=400cc",counts:{total:records.length,large_displacement:large.length,electric_motorcycle:electric.length,eligible:eligibleCount,blocked:records.length-eligibleCount},recommendation_approved_count:0,records};
fs.mkdirSync("knowledge_base_outputs/expansion/candidate_registry",{recursive:true});
fs.writeFileSync("knowledge_base_outputs/expansion/candidate_registry/expansion_candidates_v0.1.json",`${JSON.stringify(output,null,2)}\n`);
fs.writeFileSync("knowledge_base_outputs/expansion/candidate_registry/manifest_v0.1.json",`${JSON.stringify({schema_version:"kb_expansion_manifest_v0.1",registry:"knowledge_base_outputs/expansion/candidate_registry/expansion_candidates_v0.1.json",scope_rule:output.scope_rule,discovery_report:discoveryPath,record_count:records.length,large_displacement_count:large.length,electric_motorcycle_count:electric.length,eligible_count:eligibleCount,blocked_count:records.length-eligibleCount,recommendation_approved_count:0,validator:"scripts/validate-expansion-candidate-registry.mjs"},null,2)}\n`);
fs.mkdirSync("knowledge_base_outputs/expansion/exceptions",{recursive:true});
fs.writeFileSync("knowledge_base_outputs/expansion/exceptions/expansion_blockers_v0.1.json",`${JSON.stringify({schema_version:"kb_expansion_exceptions_v0.1",generated_at:output.generated_at,blocked_count:records.length-eligibleCount,records:records.filter((record)=>record.expansion_pool_eligibility.status==="blocked").map((record)=>({model_id:record.model_id,group:record.group,blockers:record.expansion_pool_eligibility.blockers,discovery_source_count:record.discovery_sources.length}))},null,2)}\n`);
console.log(JSON.stringify(output.counts,null,2));
