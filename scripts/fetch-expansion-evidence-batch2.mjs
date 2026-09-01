import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createWebEvidenceFetcher } = require("../web-evidence-fetcher.js");
const fetchPage = createWebEvidenceFetcher({ timeoutMs: 15000 });

const targets = [
  {
    model_id: "cfmoto_675srr_current_standard",
    brand: "春风",
    urls: [
      "https://www.cfmoto.com/motorcycles/675SR-R",
      "https://www.58moto.com/good/20859.html",
      "https://www.58moto.com/good/20859/configuration.html",
    ],
  },
  {
    model_id: "cfmoto_675nk_current_standard",
    brand: "春风",
    urls: [
      "https://www.cfmoto.com/motorcycles/675NK",
      "https://www.58moto.com/good/21533.html",
      "https://www.58moto.com/good/21533/configuration.html",
    ],
  },
];

for (const target of targets) {
  const sources = [];
  for (const url of target.urls) {
    try {
      sources.push({ status: "fetched", ...(await fetchPage(url, { brand: target.brand })) });
    } catch (error) {
      sources.push({ status: "failed", source_url: url, failure_reason: error.message });
    }
  }
  const output = {
    schema_version: "expansion_public_evidence_v0.1",
    model_id: target.model_id,
    captured_at: new Date().toISOString(),
    trust_boundary: "untrusted_public_web_text_requires_deterministic_validation",
    sources,
  };
  const outputPath = `knowledge_base_inputs/expansion_public_sources/${target.model_id}.json`;
  fs.mkdirSync("knowledge_base_inputs/expansion_public_sources", { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify({
    model_id: target.model_id,
    output_path: outputPath,
    fetched: sources.filter((source) => source.status === "fetched").length,
    failed: sources.filter((source) => source.status === "failed").length,
  }));
}
