import fs from "node:fs";
import { createRequire } from "node:module";

function loadDotEnv() {
  if (!fs.existsSync(".env")) return;
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;
    const index = value.indexOf("=");
    if (index < 1) continue;
    const key = value.slice(0, index).trim();
    let item = value.slice(index + 1).trim();
    if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) item = item.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = item;
  }
}

loadDotEnv();
const require = createRequire(import.meta.url);
const { createBochaSearchClient } = require("../bocha-search-client.js");
const client = createBochaSearchClient({ apiKey: process.env.BOCHA_API_KEY, timeoutMs: 12000 });
const targets = [
  ["qjmotor_xiao600", "QJMOTOR 骁600 中国 官网 售价 参数 site:qjmotor.com"],
  ["benda_chinchilla500", "奔达 金吉拉500 中国 官网 售价 参数 site:bendamotor.cn"],
  ["honda_cb500sf", "本田 CB500SF 中国 官方 售价 参数"],
  ["honda_cbr500r", "本田 CBR500R 中国 官方 售价 参数"],
  ["yamaha_mt07", "雅马哈 MT-07 中国 官网 售价 参数 site:yamaha-motor.com.cn"],
  ["cfmoto_450mt", "春风 450MT 官网 售价 参数 site:cfmoto.com"],
  ["cfmoto_800nk", "春风 800NK 官网 售价 参数 site:cfmoto.com"],
  ["cfmoto_800mtx", "春风 800MT-X 官网 售价 参数 site:cfmoto.com"],
  ["cfmoto_750srs", "春风 750SR-S 官网 售价 参数 site:cfmoto.com"],
  ["ninebot_e300p_mk2", "九号 E300P MK2 官方 官网 产品 售价 参数"],
  ["niu_rqi", "小牛 RQi 中国 官网 售价 参数 电动摩托车 site:niu.com"],
  ["niu_nqi_gt", "小牛 NQi GT 动力版 中国 官网 售价 参数 site:niu.com"],
  ["zeeho_ae6", "极核 AE6 Pro Max 官方 官网 售价 参数"],
  ["zeeho_ae4", "极核 AE4 2026 官方 官网 售价 参数"],
  ["senlan_es5", "森蓝 ES5 官方 官网 售价 参数 电动摩托车"],
  ["senlan_ex1", "森蓝 EX1 官方 官网 售价 参数 电动摩托车"],
  ["electric_registry", "E300P MK2 AE6 RQi 道路机动车辆生产企业及产品公告"],
];
const runs = [];
let consecutiveFailures = 0;
for (const [candidate_key, query] of targets) {
  const result = await client.search(query, { freshness: "oneYear", count: 10 });
  runs.push({ candidate_key, query, result });
  consecutiveFailures = result.status === "completed" ? 0 : consecutiveFailures + 1;
  if (consecutiveFailures >= 3) break;
}
const output = { schema_version: "expansion_discovery_batch3_v0.1", captured_at: new Date().toISOString(), provider: "bocha_web_search", evidence_verified: false, candidate_use_allowed: false, runs };
const outputPath = "knowledge_base_outputs/expansion/route_validation/discovery_batch3_2026-09-01.json";
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ output_path: outputPath, queries: runs.length, completed: runs.filter((run) => run.result.status === "completed").length, results: runs.reduce((sum, run) => sum + (run.result.results?.length || 0), 0) }, null, 2));
