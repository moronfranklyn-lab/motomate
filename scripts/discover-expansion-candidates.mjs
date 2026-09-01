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
const groups = {
  large_displacement: [
    "2026 中国 在售 春风 450MT 675NK 675SR-R 官网 售价 参数",
    "2026 中国 在售 QJMOTOR 赛600 SRT550 官网 售价 参数",
    "2026 中国 在售 无极 DS525X CU525 官网 售价 参数",
    "2026 中国 在售 奔达 LFC700 金吉拉500 官网 售价 参数",
    "2026 中国 在售 本田 NX400 CBR500R 官网 售价 参数",
    "2026 中国 在售 雅马哈 MT-07 XMAX300 官网 售价 参数",
  ],
  electric_motorcycle: [
    "2026 中国 在售 九号 电动摩托车 E300P E200P 官网 售价 上牌 参数",
    "2026 中国 在售 小牛 电动摩托车 RQi 电摩 官网 售价 上牌 参数",
    "2026 中国 在售 极核 电动摩托车 AE8 AE4 C!TY SPORT 官网 售价 参数",
    "2026 中国 在售 森蓝 电动摩托车 ES5 官网 售价 上牌 参数",
  ],
};

const batches = {};
for (const [group, queries] of Object.entries(groups)) {
  batches[group] = [];
  for (const query of queries) batches[group].push(await client.search(query, { freshness: "oneYear", count: 10 }));
}
const output = {
  schema_version: "expansion_candidate_discovery_v0.1",
  captured_at: new Date().toISOString(),
  provider: "bocha_web_search",
  evidence_verified: false,
  candidate_use_allowed: false,
  batches,
};
fs.mkdirSync("knowledge_base_outputs/expansion/route_validation", { recursive: true });
const path = "knowledge_base_outputs/expansion/route_validation/discovery_2026-09-01.json";
fs.writeFileSync(path, `${JSON.stringify(output, null, 2)}\n`);
const summary = Object.fromEntries(Object.entries(batches).map(([group, runs]) => [group, {
  query_count: runs.length,
  completed_count: runs.filter((run) => run.status === "completed").length,
  result_count: runs.reduce((sum, run) => sum + run.results.length, 0),
} ]));
console.log(JSON.stringify({ output_path: path, summary }, null, 2));
