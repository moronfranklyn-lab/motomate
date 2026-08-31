import fs from "node:fs";

const base = JSON.parse(fs.readFileSync("knowledge_base_outputs/semantic_enrichment/first_batch_semantic_v0.1.json", "utf8"));
const additions = JSON.parse(fs.readFileSync("knowledge_base_outputs/semantic_enrichment/alpha_semantic_additions_v0.1.json", "utf8"));
const cgx = JSON.parse(fs.readFileSync("knowledge_base_outputs/semantic_enrichment/cgx150_semantic_additions_v0.1.json", "utf8"));
const models = [...base.models, ...additions.models, ...cgx.models];
if (new Set(models.map((model) => model.model_id)).size !== models.length) throw new Error("duplicate semantic model_id");
const output = {
  schema_version:"kb_semantic_enrichment_v0.2",
  enrichment_version:"alpha_semantic_v0.2",
  created_at:"2026-08-31T11:55:00+08:00",
  source_pool:"knowledge_base_outputs/eligible_pool/alpha_pool_v0.1.json",
  source_pool_version:"alpha_pool_v0.1",
  usage_scope:"low_weight_internal_development_preview",
  recommendation_approved_count:0,
  model_output_used:false,
  models,
};
fs.writeFileSync("knowledge_base_outputs/semantic_enrichment/alpha_semantic_v0.2.json", `${JSON.stringify(output, null, 2)}\n`);
