import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createWebEvidenceFetcher } = require("../web-evidence-fetcher.js");
const fetchPage = createWebEvidenceFetcher({ timeoutMs: 20000 });
const targets = [
  ["cfmoto_800nk_current_standard", "https://www.cfmoto.com/motorcycles/800NK"],
  ["cfmoto_800mtx_current_standard", "https://www.cfmoto.com/motorcycles/800MT-X"],
  ["cfmoto_750srs_current_standard", "https://www.cfmoto.com/motorcycles/750SR-S"],
  ["cfmoto_700mt_current_standard", "https://www.cfmoto.com/motorcycles/700MT"],
  ["cfmoto_1000mtx_current_standard", "https://www.cfmoto.com/motorcycles/1000mt-x"],
  ["cfmoto_800mtes_current_standard", "https://www.cfmoto.com/motorcycles/800mt-es"],
  ["cfmoto_800mtexplore_current_standard", "https://www.cfmoto.com/motorcycles/800mt-explore"],
  ["cfmoto_500srvoom_current_standard", "https://www.cfmoto.com/motorcycles/500SR-VOOM"],
  ["cfmoto_550clc_current_standard", "https://www.cfmoto.com/motorcycles/550cl-c"],
  ["cfmoto_500sr_current_standard", "https://www.cfmoto.com/motorcycles/500sr"],
  ["cfmoto_450srs_current_standard", "https://www.cfmoto.com/motorcycles/450SR-S"],
  ["cfmoto_450sr_akrapovic_current", "https://www.cfmoto.com/motorcycles/450SR-Akrapovic"],
];
let consecutiveFailures = 0;
const summary = [];
for (const [modelId, url] of targets) {
  try {
    const source = await fetchPage(url, { brand: "春风" });
    const output = { schema_version: "expansion_public_evidence_v0.1", model_id: modelId, captured_at: source.captured_at, trust_boundary: "untrusted_public_web_text_requires_deterministic_validation", sources: [{ status: "fetched", ...source }] };
    const outputPath = `knowledge_base_inputs/expansion_public_sources/${modelId}.json`;
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    summary.push({ model_id: modelId, status: "fetched", output_path: outputPath, text_length: source.text.length, prompt_injection_detected: source.prompt_injection_detected });
    consecutiveFailures = 0;
  } catch (error) {
    summary.push({ model_id: modelId, status: "failed", failure_reason: error.message });
    consecutiveFailures += 1;
    if (consecutiveFailures >= 3) break;
  }
}
const outputPath = "knowledge_base_outputs/expansion/route_validation/fetch_batch3_2026-09-01.json";
fs.writeFileSync(outputPath, `${JSON.stringify({ schema_version: "expansion_fetch_batch3_v0.1", generated_at: new Date().toISOString(), records: summary }, null, 2)}\n`);
console.log(JSON.stringify({ output_path: outputPath, fetched: summary.filter((item) => item.status === "fetched").length, failed: summary.filter((item) => item.status === "failed").length, records: summary }, null, 2));
