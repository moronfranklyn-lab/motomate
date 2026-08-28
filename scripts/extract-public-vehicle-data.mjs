import fs from "node:fs";
import path from "node:path";

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();
const apiKey = process.env.ZHIPU_API_KEY;
const model = process.env.ZHIPU_MODEL || "glm-5.3";
const baseUrl = (process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4").replace(/\/$/, "");
const thinking = model === "glm-5.3"
  ? { type: "enabled", effort: process.env.ZHIPU_THINKING_EFFORT || "low" }
  : { type: "disabled" };
const maxTokens = Number(process.env.ZHIPU_MAX_TOKENS || (model === "glm-5.3" ? 6000 : 1600));
const outputMode = process.env.ZHIPU_OUTPUT_MODE || "models";
const inputPaths = process.argv.slice(2);
if (!apiKey || inputPaths.length === 0) process.exit(2);

const sourceDocuments = inputPaths.map((inputPath) => ({
  path: inputPath,
  text: fs.readFileSync(inputPath, "utf8"),
}));
const schema = {
  models: [{
    model_search_name: "string",
    model_year: "string|null",
    trim_name: "string|null",
    sale_status: "current|unknown",
    official_msrp_cny: "number|null",
    official_price_label: "string|null",
    displacement_cc: "number|null",
    seat_height_mm: "number|null",
    curb_weight_kg: "number|null",
    max_power_kw: "number|null",
    fuel_tank_l: "number|null",
    abs: "string|null",
    tcs: "string|null",
    vehicle_type: "string|null",
    field_sources: { "field_name": ["source_url"] },
    warnings: ["string"],
  }],
};
const responseSchema = outputMode === "single_model" ? { model: schema.models[0] } : schema;
const formatInstruction = outputMode === "single_model"
  ? "根键必须是 model，只返回一个配置对象，不得输出 models 数组或 answer。"
  : "根键必须是 models，不得包裹 answer。每个配置单独一条。";
const requestStartedAt = Date.now();
const response = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({
    model,
    thinking,
    response_format: { type: "json_object" },
    max_tokens: maxTokens,
    temperature: 0.1,
    messages: [
      { role: "system", content: `仅依证据抽取，无证据填 null。${formatInstruction}字段来源填原始 URL。严格按 schema 输出 JSON。` },
      { role: "user", content: JSON.stringify({ schema: responseSchema, source_documents: sourceDocuments }) },
    ],
  }),
});
const latencyMs = Date.now() - requestStartedAt;
const body = await response.json();
const content = body.choices?.[0]?.message?.content || "";
let parsed = null;
try { parsed = JSON.parse(content); } catch {}
const runId = `zhipu_${new Date().toISOString().replace(/[:.]/g, "-")}`;
const outputDir = path.resolve("knowledge_base_outputs/extraction_drafts");
fs.mkdirSync(outputDir, { recursive: true });
const outputPath = path.join(outputDir, `${runId}.json`);
fs.writeFileSync(outputPath, JSON.stringify({
  extraction_run_id: runId,
  extraction_provider: "zhipu",
  extraction_model: model,
  request_settings: { thinking, max_tokens: maxTokens, temperature: 0.1, output_mode: outputMode },
  status: "extraction_draft",
  input_paths: inputPaths,
  http_status: response.status,
  latency_ms: latencyMs,
  retry_count: Number(process.env.ZHIPU_RETRY_COUNT || 0),
  usage: body.usage || null,
  parseable: parsed !== null,
  extracted: parsed,
  raw_content: parsed === null ? content : undefined,
}, null, 2));
console.log(JSON.stringify({ output_path: outputPath, http_status: response.status, latency_ms: latencyMs, usage: body.usage || null, parseable: parsed !== null }));
