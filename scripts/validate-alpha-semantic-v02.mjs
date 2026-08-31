import fs from "node:fs";

const [semanticPath, poolPath, manifestPath] = process.argv.slice(2);
if (!semanticPath || !poolPath || !manifestPath) process.exit(2);
const semantic = JSON.parse(fs.readFileSync(semanticPath, "utf8"));
const pool = JSON.parse(fs.readFileSync(poolPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const errors = [];
const poolById = new Map(pool.models.map((model) => [model.model_id, model]));
const styles = new Set(["scooter","street_naked","cruiser","retro"]);
const bands = new Set(["entry","moderate","strong","unknown"]);
const availabilities = new Set(["rule_sorting","ai_explanation_only","unavailable"]);

if (semantic.models.length !== pool.models.length || semantic.models.length < 12 || semantic.models.length > 35) errors.push("semantic/pool count mismatch or outside 12-35");
if (new Set(semantic.models.map((model) => model.model_id)).size !== semantic.models.length) errors.push("duplicate semantic model_id");
for (const item of semantic.models) {
  const source = poolById.get(item.model_id);
  if (!source) { errors.push(`${item.model_id}: absent from pool`); continue; }
  if (item.model_year !== source.model_year || item.trim_name !== source.trim_name) errors.push(`${item.model_id}: identity mismatch`);
  if (!item.usage_tags?.value?.length || item.usage_tags.availability !== "rule_sorting") errors.push(`${item.model_id}: usage tags unavailable`);
  if (!styles.has(item.style_and_power_tags?.style_tag) || !bands.has(item.style_and_power_tags?.power_band)) errors.push(`${item.model_id}: style/power enum invalid`);
  for (const field of [item.operation_pressure_level,item.beginner_friendliness,item.maintenance_convenience,item.style_and_power_tags]) if (!availabilities.has(field?.availability)) errors.push(`${item.model_id}: availability invalid`);
  if (item.maintenance_convenience.value !== null || item.maintenance_convenience.availability !== "unavailable") errors.push(`${item.model_id}: maintenance must remain neutral unknown`);
  if (source.seat_height_mm == null && item.operation_pressure_level.value !== null) errors.push(`${item.model_id}: pressure imputed with missing seat height`);
}
for (const source of pool.models) if (!semantic.models.some((item) => item.model_id === source.model_id)) errors.push(`${source.model_id}: semantic record missing`);
const counts = {
  usage:semantic.models.filter((m)=>m.usage_tags.availability==="rule_sorting").length,
  pressure:semantic.models.filter((m)=>m.operation_pressure_level.availability==="rule_sorting").length,
  beginner:semantic.models.filter((m)=>m.beginner_friendliness.availability==="rule_sorting").length,
  style:semantic.models.filter((m)=>m.style_and_power_tags.availability==="rule_sorting").length,
  power:semantic.models.filter((m)=>m.style_and_power_tags.availability==="rule_sorting"&&m.style_and_power_tags.power_band!=="unknown").length,
  maintenance:semantic.models.filter((m)=>m.maintenance_convenience.availability==="rule_sorting").length,
};
if (manifest.model_count!==semantic.models.length||manifest.usage_tags_rule_sorting_count!==counts.usage||manifest.operation_pressure_rule_sorting_count!==counts.pressure||manifest.beginner_friendliness_rule_sorting_count!==counts.beginner||manifest.style_rule_sorting_count!==counts.style||manifest.power_band_rule_sorting_count!==counts.power||manifest.maintenance_convenience_rule_sorting_count!==counts.maintenance) errors.push("manifest count mismatch");
if (semantic.recommendation_approved_count!==0||manifest.recommendation_approved_count!==0||semantic.model_output_used!==false) errors.push("approval/model boundary invalid");
console.log(JSON.stringify({schema_version:semantic.schema_version,records_checked:semantic.models.length,valid:errors.length===0,counts,recommendation_approved_count:0,errors},null,2));
if (errors.length) process.exit(1);
