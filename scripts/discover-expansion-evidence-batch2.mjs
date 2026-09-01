import fs from "node:fs";
import { createRequire } from "node:module";

function loadDotEnv() {
  if (!fs.existsSync(".env")) return;
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();
const require = createRequire(import.meta.url);
const { createBochaSearchClient } = require("../bocha-search-client.js");
const client = createBochaSearchClient({ apiKey: process.env.BOCHA_API_KEY, timeoutMs: 12000 });

const queries = [
  { model_id: "cfmoto_675srr_current_standard", query: "春风 675SR-R 中国 官网 当前 售价 参数 site:cfmoto.com" },
  { model_id: "cfmoto_675nk_current_standard", query: "春风 675NK 中国 官网 当前 售价 参数 site:cfmoto.com" },
  { model_id: "qjmotor_xiao600_current_standard", query: "QJMOTOR 骁600 官网 当前 售价 参数" },
  { model_id: "ninebot_e300p_mk2_current_standard", query: "九号 E300P MK2 官网 售价 参数 电动摩托车" },
  { model_id: "ninebot_e300p_mk2_current_standard", query: "九号 E300P MK2 工信部 道路机动车辆生产企业及产品公告" },
  { model_id: "zeeho_ae6_current_pro", query: "极核 AE6 Pro 官网 售价 参数 电动摩托车" },
  { model_id: "zeeho_ae6_current_max", query: "极核 AE6 Max 官网 售价 参数 电动摩托车" },
  { model_id: "zeeho_ae6_current_pro", query: "极核 AE6 工信部 道路机动车辆生产企业及产品公告" },
];

const runs = [];
for (const item of queries) {
  const result = await client.search(item.query, { freshness: "oneYear", count: 10 });
  runs.push({ ...item, result });
}

const output = {
  schema_version: "expansion_evidence_discovery_v0.1",
  captured_at: new Date().toISOString(),
  provider: "bocha_web_search",
  evidence_verified: false,
  candidate_use_allowed: false,
  runs,
};
const outputPath = "knowledge_base_outputs/expansion/route_validation/evidence_discovery_batch2_2026-09-01.json";
fs.mkdirSync("knowledge_base_outputs/expansion/route_validation", { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  output_path: outputPath,
  query_count: runs.length,
  completed_count: runs.filter((run) => run.result.status === "completed").length,
  result_count: runs.reduce((sum, run) => sum + run.result.results.length, 0),
}, null, 2));
