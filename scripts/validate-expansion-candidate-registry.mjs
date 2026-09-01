import fs from "node:fs";
const path="knowledge_base_outputs/expansion/candidate_registry/expansion_candidates_v0.1.json";
const registry=JSON.parse(fs.readFileSync(path,"utf8"));
const errors=[];const ids=registry.records.map((record)=>record.model_id);
if(new Set(ids).size!==ids.length)errors.push("model_id must be unique");
for(const group of ["large_displacement","electric_motorcycle"]){const count=registry.records.filter((r)=>r.group===group).length;if(count<8)errors.push(`${group} count must be at least 8`);}
if(registry.recommendation_approved_count!==0)errors.push("recommendation approvals must remain zero");
for(const r of registry.records){
  if(!r.model_id||!r.brand||!r.model_name||!("trim_name" in r))errors.push(`${r.model_id}: identity incomplete`);
  if(!["blocked","eligible"].includes(r.expansion_pool_eligibility?.status))errors.push(`${r.model_id}: invalid expansion status`);
  if(r.expansion_pool_eligibility.status==="blocked"&&!r.expansion_pool_eligibility.blockers?.length)errors.push(`${r.model_id}: blocked record missing blocker`);
  if(r.expansion_pool_eligibility.status==="eligible"){
    if(!(r.displacement_cc>=400)||r.china_sale_status!=="current"||!Number.isFinite(r.official_public_price_cny))errors.push(`${r.model_id}: eligible hard fields invalid`);
    if(r.fact_verification_status?.fields?.china_sale_status!=="official_verified"||r.fact_verification_status?.fields?.official_public_price_cny!=="official_verified"||r.fact_verification_status?.fields?.displacement_cc!=="official_verified")errors.push(`${r.model_id}: eligible official evidence invalid`);
    if(!r.official_sources?.length||r.recommendation_review_status.status!=="codex_reviewed")errors.push(`${r.model_id}: eligible provenance/review invalid`);
  } else if(r.fact_verification_status?.overall!=="not_started")errors.push(`${r.model_id}: blocked discovery fact status invalid`);
  if(r.recommendation_review_status?.status==="approved")errors.push(`${r.model_id}: unauthorized approval`);
  for(const source of r.discovery_sources||[]){if(source.evidence_status!=="discovery_only_unverified")errors.push(`${r.model_id}: source evidence status invalid`);new URL(source.url);}
}
console.log(JSON.stringify({passed:errors.length===0,record_count:registry.records.length,counts:registry.counts,errors},null,2));
if(errors.length)process.exit(1);
