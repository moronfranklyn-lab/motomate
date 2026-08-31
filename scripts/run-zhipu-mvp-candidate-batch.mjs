import { spawnSync } from "node:child_process";
import fs from "node:fs";

const inputs = [
  "knowledge_base_inputs/public_sources/voge_cu250_current_manual_pending.md",
  "knowledge_base_inputs/public_sources/voge_cu250_current_automatic_pending.md",
  "knowledge_base_inputs/public_sources/voge_300ac_observed_pending.md",
  "knowledge_base_inputs/public_sources/voge_300ds_standard_observed_pending.md",
  "knowledge_base_inputs/public_sources/voge_300ds_luggage_observed_pending.md",
  "knowledge_base_inputs/public_sources/zontes_350d_delisted.md",
  "knowledge_base_inputs/public_sources/zontes_350e_delisted.md",
  "knowledge_base_inputs/public_sources/zontes_350gk_delisted.md",
  "knowledge_base_inputs/public_sources/wuyang_honda_cgx150_current_standard_pending.md",
  "knowledge_base_inputs/public_sources/wuyang_honda_cgx150_current_sidebag_pending.md",
  "knowledge_base_inputs/public_sources/wuyang_honda_cgx150_current_special_pending.md",
];
const runs = [];
let consecutiveFailures = 0;

for (const input of inputs) {
  let accepted = false;
  for (let retry = 0; retry <= 2 && !accepted; retry += 1) {
    const child = spawnSync(process.execPath, ["scripts/extract-public-vehicle-data.mjs", input], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        ZHIPU_MODEL: "glm-4.7",
        ZHIPU_OUTPUT_MODE: "single_model",
        ZHIPU_MAX_TOKENS: "1400",
        ZHIPU_RETRY_COUNT: String(retry),
      },
    });
    let summary = null;
    try { summary = JSON.parse(child.stdout.trim()); } catch {}
    let draft = null;
    try { draft = JSON.parse(fs.readFileSync(summary.output_path, "utf8")); } catch {}
    const model = draft?.extracted?.model;
    const structuralPass = child.status === 0 && summary?.http_status === 200 && draft?.parseable === true && model && typeof model === "object" && !Array.isArray(model) && !("models" in draft.extracted);
    runs.push({input,retry,exit_status:child.status,http_status:summary?.http_status??null,output_path:summary?.output_path??null,latency_ms:summary?.latency_ms??null,usage:summary?.usage??null,parseable:draft?.parseable??false,structural_pass:structuralPass});
    if (structuralPass) {
      accepted = true;
      consecutiveFailures = 0;
    } else {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 3) break;
    }
  }
  if (consecutiveFailures >= 3) break;
}

const totals = runs.reduce((sum, run) => {
  sum.prompt_tokens += run.usage?.prompt_tokens || 0;
  sum.completion_tokens += run.usage?.completion_tokens || 0;
  sum.total_tokens += run.usage?.total_tokens || 0;
  return sum;
}, {prompt_tokens:0,completion_tokens:0,total_tokens:0});
const report = {
  schema_version:"zhipu_candidate_batch_v0.1",
  batch_id:"mvp_candidates_2026-08-31",
  model:"glm-4.7",
  input_count:inputs.length,
  attempted_input_count:new Set(runs.map((run)=>run.input)).size,
  passed_input_count:new Set(runs.filter((run)=>run.structural_pass).map((run)=>run.input)).size,
  circuit_breaker_triggered:consecutiveFailures>=3,
  safeguards:{single_model:true,max_tokens:1400,max_retries:2,consecutive_failure_breaker:3},
  totals,
  runs,
};
fs.writeFileSync("knowledge_base_outputs/route_validation/mvp_candidate_glm47_batch_2026-08-31.json", `${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({input_count:report.input_count,attempted_input_count:report.attempted_input_count,passed_input_count:report.passed_input_count,circuit_breaker_triggered:report.circuit_breaker_triggered,totals:report.totals},null,2));
if (report.circuit_breaker_triggered || report.passed_input_count !== report.input_count) process.exit(1);
