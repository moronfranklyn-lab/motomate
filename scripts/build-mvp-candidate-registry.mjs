import fs from "node:fs";

const alphaPath = fs.existsSync("knowledge_base_outputs/eligible_pool/mvp_eligible_pool_v0.1.json")
  ? "knowledge_base_outputs/eligible_pool/mvp_eligible_pool_v0.1.json"
  : "knowledge_base_outputs/eligible_pool/alpha_pool_v0.1.json";
const outDir = "knowledge_base_outputs/candidate_registry";
const exceptionDir = "knowledge_base_outputs/exceptions";
const alpha = JSON.parse(fs.readFileSync(alphaPath, "utf8"));

const prior = [
  ["voge_sr250gt_2026_play", "无极", "SR250GT", "Play版", "blocked", "官方价格口径、整备质量语义及安全配置证据未闭环", "knowledge_base_inputs/public_sources/voge_sr250gt_2026_play.md"],
  ["voge_sr250gt_2026_pro", "无极", "SR250GT", "Pro版", "blocked", "官方价格口径、整备质量语义及安全配置证据未闭环", "knowledge_base_inputs/public_sources/voge_sr250gt_2026_pro.md"],
  ["cfmoto_450clc_2024_bobber", "春风", "450CL-C", "单座版", "blocked", "官网同页存在真正待解释的价格冲突", "knowledge_base_inputs/public_sources/cfmoto_450clc_2024_bobber_pending.md"],
  ["benda_greystone250_2026_manual", "奔达", "灰石250", "手动版", "blocked", "缺官方公开价格且参数未达降级核验门槛", "knowledge_base_inputs/public_sources/benda_greystone250_2026_manual_pending.md"],
  ["benda_greystone250_2026_cvt", "奔达", "灰石250", "CVT版", "blocked", "缺官方公开价格且参数未达降级核验门槛", "knowledge_base_inputs/public_sources/benda_greystone250_2026_cvt_pending.md"],
  ["qjmotor_sai250mini_2026_mini", "QJMOTOR", "赛250MINI", "MINI版", "blocked", "缺官方公开价格且参数未达降级核验门槛", "knowledge_base_inputs/public_sources/qjmotor_sai250mini_2026_pending.md"],
  ["wuyang_honda_cb190r_standard_pending_year", "五羊本田", "CB190R", "标准版", "blocked", "配置映射、当前版本及多数参数证据不足", "knowledge_base_inputs/public_sources/wuyang_honda_cb190r_2023_standard_pending.md"],
  ["wuyang_honda_cb190r_2023_gp", "五羊本田", "CB190R", "GP版", "blocked", "配置映射、当前版本及多数参数证据不足", "knowledge_base_inputs/public_sources/wuyang_honda_cb190r_2023_gp_pending.md"],
  ["qjmotor_sai250_2024_firing", "QJMOTOR", "赛250", "燃擎版", "excluded", "未取得官方当前在售信号", null],
  ["sundiro_honda_cbf190r_2023_standard", "新大洲本田", "CBF190R", "标准版", "excluded", "原官方页面下架且当前目录未找到", null],
  ["sundiro_honda_cbf190r_2023_special", "新大洲本田", "CBF190R", "特别版", "excluded", "原官方页面下架且当前目录未找到", null],
  ["cfmoto_250sr_observed_versions", "春风", "250SR", null, "blocked", "中国市场官方当前在售和官方价格证据不足", "knowledge_base_inputs/public_sources/cfmoto_250sr_sources.md"],
];

const additions = [
  ["voge_cu250_current_manual", "无极", "CU250Ⅱ代", "手动挡", "blocked", "官网当前在售信号存在，但未取得可复现官方公开价格；参数仅单平台", "knowledge_base_inputs/public_sources/voge_cu250_current_manual_pending.md"],
  ["voge_cu250_current_automatic", "无极", "CU250Ⅱ代", "自动挡", "blocked", "官网当前在售信号存在，但未取得可复现官方公开价格；参数仅单平台", "knowledge_base_inputs/public_sources/voge_cu250_current_automatic_pending.md"],
  ["voge_300ac_2022_observed", "无极", "300AC", null, "excluded", "当前官网目录未找到；仅有2022款历史平台记录", "knowledge_base_inputs/public_sources/voge_300ac_observed_pending.md"],
  ["voge_300ds_2022_standard", "无极", "300DS", "标准版", "excluded", "当前官网目录未找到；仅有2022款历史平台记录", "knowledge_base_inputs/public_sources/voge_300ds_standard_observed_pending.md"],
  ["voge_300ds_2022_luggage", "无极", "300DS", "三箱版", "excluded", "当前官网目录未找到；仅有2022款历史平台记录", "knowledge_base_inputs/public_sources/voge_300ds_luggage_observed_pending.md"],
  ["zontes_350d_delisted", "升仕", "350D", null, "ineligible", "官网明确已下架且平台标停产", "knowledge_base_inputs/public_sources/zontes_350d_delisted.md"],
  ["zontes_350e_delisted", "升仕", "350E", null, "ineligible", "官网明确已下架且平台标停产", "knowledge_base_inputs/public_sources/zontes_350e_delisted.md"],
  ["zontes_350gk_delisted", "升仕", "350GK", null, "ineligible", "官网明确已下架且平台标停产", "knowledge_base_inputs/public_sources/zontes_350gk_delisted.md"],
  ["wuyang_honda_cgx150_current_standard", "五羊本田", "CGX150", "标准版", "blocked", "官方字段较完整，但尚未完成独立主流平台配置交叉核对", "knowledge_base_inputs/public_sources/wuyang_honda_cgx150_current_standard_pending.md"],
  ["wuyang_honda_cgx150_current_sidebag", "五羊本田", "CGX150", "边包版", "blocked", "官方字段较完整，但尚未完成独立主流平台配置交叉核对", "knowledge_base_inputs/public_sources/wuyang_honda_cgx150_current_sidebag_pending.md"],
  ["wuyang_honda_cgx150_current_special", "五羊本田", "CGX150", "特别版", "blocked", "官方字段较完整，但尚未完成独立主流平台配置交叉核对", "knowledge_base_inputs/public_sources/wuyang_honda_cgx150_current_special_pending.md"],
];

const draftByInput = new Map();
for (const file of fs.readdirSync("knowledge_base_outputs/extraction_drafts")) {
  if (!file.startsWith("zhipu_2026-08-31") || !file.endsWith(".json")) continue;
  const path = `knowledge_base_outputs/extraction_drafts/${file}`;
  const draft = JSON.parse(fs.readFileSync(path, "utf8"));
  if (draft.input_paths?.length === 1) draftByInput.set(draft.input_paths[0], path);
}

const eligible = alpha.models.map((model) => ({
  model_id: model.model_id,
  brand: model.brand,
  model_name: model.model_name,
  trim_name: model.trim_name,
  current_version: model.model_year === "current_version",
  rule_pool_eligibility: "eligible",
  fact_verification_status: model.fact_verification_status.overall,
  recommendation_review_status: model.recommendation_review_status.status,
  blocker: null,
  verified_record_source: alphaPath,
  public_evidence_path: null,
  extraction_draft_path: null,
}));

function candidate([model_id, brand, model_name, trim_name, status, blocker, publicPath]) {
  return {
    model_id, brand, model_name, trim_name,
    current_version: status === "blocked" && !model_id.includes("2022") && !model_id.includes("2023") && !model_id.includes("2024"),
    rule_pool_eligibility: status,
    fact_verification_status: status === "ineligible" || status === "excluded" ? "insufficient_or_out_of_scope" : "in_progress",
    recommendation_review_status: "not_reviewed_for_recommendation",
    blocker,
    verified_record_source: null,
    public_evidence_path: publicPath,
    extraction_draft_path: publicPath ? draftByInput.get(publicPath) || null : null,
  };
}

const eligibleIds = new Set(eligible.map((item) => item.model_id));
const models = [...eligible, ...prior.map(candidate), ...additions.map(candidate)].filter((item, index, all) =>
  item.rule_pool_eligibility === "eligible" || !eligibleIds.has(item.model_id)
);
const counts = models.reduce((acc, item) => ((acc[item.rule_pool_eligibility] = (acc[item.rule_pool_eligibility] || 0) + 1), acc), {});
const registry = {
  schema_version: "mvp_candidate_registry_v0.1",
  generated_at: new Date().toISOString(),
  scope: "MVP 1万至3万元公开资料候选；单配置优先；不扩展品牌范围",
  candidate_count: models.length,
  counts,
  recommendation_approved_count: 0,
  status_boundary: "Only eligible records originate from the verified Alpha pool. Extraction drafts never upgrade status.",
  models,
};
const manifest = {
  schema_version: "mvp_candidate_registry_manifest_v0.1",
  registry_path: `${outDir}/mvp_candidates_v0.1.json`,
  source_alpha_pool: alphaPath,
  route_report: "knowledge_base_outputs/route_validation/mvp_candidate_glm47_batch_2026-08-31.json",
  public_evidence_directory: "knowledge_base_inputs/public_sources",
  candidate_count: models.length,
  counts,
  recommendation_approved_count: 0,
  deterministic_validator: "scripts/validate-mvp-candidate-registry.mjs",
};
const exceptions = {
  schema_version: "mvp_candidate_exceptions_v0.1",
  generated_at: registry.generated_at,
  exception_count: models.filter((item) => item.rule_pool_eligibility !== "eligible").length,
  exceptions: models.filter((item) => item.rule_pool_eligibility !== "eligible").map(({model_id, rule_pool_eligibility, blocker, public_evidence_path, extraction_draft_path}) => ({model_id, rule_pool_eligibility, blocker, public_evidence_path, extraction_draft_path})),
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/mvp_candidates_v0.1.json`, `${JSON.stringify(registry, null, 2)}\n`);
fs.writeFileSync(`${outDir}/manifest_v0.1.json`, `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(`${exceptionDir}/mvp_candidate_exceptions_v0.1.json`, `${JSON.stringify(exceptions, null, 2)}\n`);
console.log(JSON.stringify({candidate_count: models.length, counts}, null, 2));
