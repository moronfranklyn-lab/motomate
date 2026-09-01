import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { createOpenAnswerAgent, SYSTEM_PROMPT } = require("../open-answer-agent.js");
assert.match(SYSTEM_PROMPT, /年轻但靠谱/);
assert.match(SYSTEM_PROMPT, /作为 AI/);

function clientFor(payload) { return { async createJsonCompletion() { return { content: JSON.stringify(payload), model: "deepseek-v4-flash", usage: { total_tokens: 80 } }; } }; }

const related = await createOpenAnswerAgent({ client: clientFor({ answer: "ABS 的作用是帮助制动时降低车轮抱死风险。对新手选车时，可以把它作为安全配置的一项核对点。", redirect_suggestions: ["开始新手选车"] }) }).answer({ rawText: "ABS 有什么用？", mode: "motorcycle_general" });
assert.equal(related.status, "completed");

const general = await createOpenAnswerAgent({ client: clientFor({ answer: "今天想轻松聊聊也可以。要是你正在看摩托车，我更擅长帮你收窄候选范围。", redirect_suggestions: ["开始新手选车"] }) }).answer({ rawText: "你好", mode: "general_brief_redirect" });
assert.equal(general.status, "completed");

const unsafe = await createOpenAnswerAgent({ client: clientFor({ answer: "这辆车闭眼买，绝对没问题。", redirect_suggestions: [] }) }).answer({ rawText: "怎么选", mode: "motorcycle_general" });
assert.equal(unsafe.status, "fallback");

const unsafeAbs = await createOpenAnswerAgent({ client: clientFor({ answer: "ABS 可以缩短制动距离。", redirect_suggestions: [] }) }).answer({ rawText: "ABS 有什么用", mode: "motorcycle_general" });
assert.equal(unsafeAbs.status, "fallback");

const heightShortcut = await createOpenAnswerAgent({ client: clientFor({ answer: "我们可以从身高条件入手推荐车型。", redirect_suggestions: [] }) }).answer({ rawText: "我没骑过车", mode: "motorcycle_general" });
assert.equal(heightShortcut.status, "fallback");

const scooterShortcut = await createOpenAnswerAgent({ client: clientFor({ answer: "踏板车重心低、操作简单，对新手很友好。", redirect_suggestions: [] }) }).answer({ rawText: "我没骑过车，有点怕摔", mode: "motorcycle_general" });
assert.equal(scooterShortcut.status, "fallback");
assert.match(scooterShortcut.answer, /正规驾校|培训机构/);

assert.match(SYSTEM_PROMPT, /正规培训/);
assert.match(SYSTEM_PROMPT, /不得把“小排量”/);

const invalidMode = await createOpenAnswerAgent({ client: clientFor({}) }).answer({ rawText: "test", mode: "anything" });
assert.equal(invalidMode.status, "fallback");

console.log("open-answer-agent: 8 scenarios passed");
