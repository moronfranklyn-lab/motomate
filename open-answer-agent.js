(function initOpenAnswerAgent(root) {
  const MODES = new Set(["motorcycle_general", "general_brief_redirect"]);
  const FORBIDDEN = /https?:\/\/|闭眼买|绝对没问题|一定安全|已经正式批准|官方推荐|缩短制动距离|显著降低失控风险|身高条件入手|根据身高推荐|按身高推荐|踏板车.{0,24}(重心低|操作简单|适合新手|对新手.{0,6}友好)/;
  const SYSTEM_PROMPT = `你是 MotoMate 的开放问答模块，但产品核心仍是新手选车、车型对比和二手车源文字核查。
根据 answer_mode 回答：
- motorcycle_general：可以用简单中文解释稳定的摩托车常识，并在有帮助时自然连回用户的选车决策。
- general_brief_redirect：对非摩托话题只做简短、有礼貌的回应，然后自然提示你更擅长选车、对比或二手核查，不要生硬拒绝。
表达像年轻但靠谱的懂车朋友：先直接回答，不重复用户问题，不写“首先/其次/综上”。句子短一些，可以说“简单说”“这个得分情况”，但不要装熟、玩梗或堆网络热词。
避免“根据你的描述”“作为 AI”“我可以为你”“建议你可以”“希望以上内容对你有帮助”等模板句。除非确实需要，不要每次结尾都把用户硬拉回选车流程。
通常控制在3至5句，只保留对当前问题有用的信息，不写成小作文。
不得凭训练记忆提供实时价格、当地禁限摩/上牌法规结论、具体故障诊断、维修/改装操作步骤或安全保证。
说明 ABS 时只能表述为降低制动时车轮抱死风险、帮助保留一定转向控制，不得保证缩短制动距离；说明 TCS 时只能表述为在特定条件下帮助限制驱动轮过度打滑，不代表不会失控。
不得仅根据身高判断座高或车辆是否适合；必须提醒腿长、坐垫宽度、悬挂下沉、车重与重心也会影响感受，最终需要到店试坐和原地挪车。
不得把“小排量”“低座高”或某类车型直接等同于适合新手；新手适配还要结合车重、重心、动力响应、骑姿和用户实际控制感。
遇到不会骑、第一次骑或害怕摔车的问题，先建议正规培训、取得相应驾驶资格，并只在合法且有指导的封闭环境练习；不得把普通空地直接描述为可练车场所。
不得主动生成具体车型推荐、车型排名、价格或参数；具体选车必须返回核心流程使用规则工具。
称呼用户使用“你”，不使用“您”。motorcycle_general 最多 300 个汉字，general_brief_redirect 最多 120 个汉字。
只返回 JSON：{"answer":"...","redirect_suggestions":["开始新手选车","对比两款车","核查二手车源"]}`;

  function fallback(mode, errorCode = null, rawText = "") {
    const beginnerSafety = /没骑过|不会骑|零基础|第一次骑|怕摔|怎么学骑/.test(rawText);
    return {
      status: "fallback",
      answer: beginnerSafety
        ? "怕摔很正常，先别急着选车。找正规驾校或培训机构，取得相应驾驶资格，再在教练指导的合法封闭场地练起步、制动和低速控制。等基本操作稳了，再结合车重、重心、动力响应和实际试坐选车。"
        : mode === "motorcycle_general"
        ? "这次没答稳。你换个说法再问一次，或者把预算和用途丢给我，我先帮你缩小范围。"
        : "这个也能聊两句。不过说到摩托车选车、对比和二手车源，我会更在行。",
      redirect_suggestions: ["开始新手选车", "对比两款车", "核查二手车源"],
      model: null,
      usage: null,
      error_code: errorCode,
    };
  }

  function parseAnswer(content, mode) {
    let parsed;
    try { parsed = JSON.parse(content); } catch { throw new Error("open_answer_json_parse_failed"); }
    const answer = typeof parsed?.answer === "string" ? parsed.answer.trim() : "";
    const maxLength = mode === "motorcycle_general" ? 600 : 240;
    if (!answer || answer.length > maxLength || FORBIDDEN.test(answer)) throw new Error("open_answer_invalid");
    const suggestions = Array.isArray(parsed.redirect_suggestions)
      ? parsed.redirect_suggestions.filter((item) => typeof item === "string" && item.trim()).slice(0, 3).map((item) => item.trim().slice(0, 40))
      : [];
    return { answer, redirect_suggestions: suggestions };
  }

  function createOpenAnswerAgent(options = {}) {
    const client = options.client || null;
    return {
      async answer({ rawText = "", mode, memory_context = null } = {}) {
        if (!MODES.has(mode)) return fallback("general_brief_redirect", "answer_mode_invalid", rawText);
        if (!client || typeof rawText !== "string" || !rawText.trim()) return fallback(mode, client ? "empty_user_text" : "model_unavailable", rawText);
        try {
          const completion = await client.createJsonCompletion({
            systemPrompt: SYSTEM_PROMPT,
            userPrompt: JSON.stringify({
              answer_mode: mode,
              user_message: rawText.trim().slice(0, 2000),
              memory_context,
            }),
            maxTokens: mode === "motorcycle_general" ? 900 : 350,
          });
          return { status: "completed", ...parseAnswer(completion.content, mode), model: completion.model, usage: completion.usage, error_code: null };
        } catch (error) {
          return fallback(mode, error?.message || "open_answer_failed", rawText);
        }
      },
    };
  }

  const api = { createOpenAnswerAgent, fallback, parseAnswer, SYSTEM_PROMPT };
  root.MotoMateOpenAnswerAgent = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
