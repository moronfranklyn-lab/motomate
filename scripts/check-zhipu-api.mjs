import fs from "node:fs";
import path from "node:path";

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const apiKey = process.env.ZHIPU_API_KEY || process.env.ZAI_API_KEY;
const model = process.env.ZHIPU_MODEL || "glm-5.2";
const testMode = process.env.ZHIPU_TEST_MODE || "text";
const baseUrl = (process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4")
  .replace(/\/$/, "");

if (!apiKey) {
  console.error("Missing ZHIPU_API_KEY. Create a local .env from .env.example first.");
  process.exit(1);
}

const expectsJson = testMode === "json";
const requestBody = {
  model,
  messages: [
    {
      role: "system",
      content: expectsJson
        ? "你只用于测试 API 结构化输出，只返回 JSON 对象。"
        : "你只用于测试 API 连通性，请用一句话回复。",
    },
    {
      role: "user",
      content: expectsJson
        ? '请返回 {"status":"ok","model_test":"glm-5.3"}'
        : "请回复：智谱 API 连通性测试成功。",
    },
  ],
  thinking:
    model === "glm-5.3"
      ? { type: "enabled", effort: "low" }
      : { type: "disabled" },
  max_tokens: model === "glm-5.3" ? 512 : 128,
  temperature: 0.2,
};

if (expectsJson) requestBody.response_format = { type: "json_object" };

const response = await fetch(`${baseUrl}/chat/completions`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify(requestBody),
});

const bodyText = await response.text();
let body;
try {
  body = JSON.parse(bodyText);
} catch {
  body = { raw: bodyText };
}

if (!response.ok) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        status: response.status,
        model,
        error: body,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const content = body.choices?.[0]?.message?.content || "";
let structuredOutputParseable = null;
if (expectsJson) {
  try {
    JSON.parse(content);
    structuredOutputParseable = true;
  } catch {
    structuredOutputParseable = false;
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      status: response.status,
      model,
      content,
      text_nonempty: content.trim().length > 0,
      structured_output_parseable: structuredOutputParseable,
      usage: body.usage || null,
    },
    null,
    2,
  ),
);
