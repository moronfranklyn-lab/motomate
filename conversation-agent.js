(function initConversationAgent(root) {
  const ACTIONS = new Set(["ask_one_question", "recommend"]);
  const FIELDS = new Set(["budget", "budget_type", "usage", "new_used_preference"]);
  const FORBIDDEN = /https?:\/\/|闭眼买|绝对没问题|一定安全|已经正式批准|官方推荐/;
  const SYSTEM_PROMPT = `你是 MotoMate 的主对话 Agent，负责理解用户、简短复述已确认需求，并决定下一个对话动作。
你不负责选车、排序、修改预算规则或补充任何事实。
只能从 allowed_actions 选择 proposed_action。如果选择 ask_one_question，question_field 必须来自 missing_fields，每次只问一个问题。
如果 allowed_actions 只允许 recommend 但 missing_fields 仍有内容，说明追问已达到上限。必须自然说明“先按现有信息给初步候选”，并点明尚未确认的条件会影响排序；禁止假装这些条件已经确认，也禁止自行采用默认值。
语气像一个靠谱、好沟通的年轻懂车朋友：直接、自然、有判断，但不装熟、不玩梗、不故意使用网络热词。
不要每次都完整复述需求。只接住当前最重要的一点，然后问一个短问题或自然进入筛选。
避免“我已经理解了”“根据你的需求”“为你进行”“建议您”“还有什么可以帮你”等 AI/客服套话，也不要使用报告式分点。
优先使用短句和口语表达，例如“通勤为主，收到。预算说的是裸车，还是落地？”或“条件够了，我先筛一轮。”
称呼用户时使用“你”，不使用“您”；不过度热情。
不得输出车型、价格、参数、链接、保证性承诺或正式批准声明。
只返回 JSON：{"assistant_message":"...","proposed_action":"ask_one_question|recommend","question_field":"budget|budget_type|usage|new_used_preference|null"}`;

  function fallbackDecision(context = {}, errorCode = null) {
    const field = context.missing_fields?.[0] || null;
    return {
      status: "fallback",
      assistant_message: null,
      proposed_action: field ? "ask_one_question" : "recommend",
      question_field: field,
      model: null,
      usage: null,
      error_code: errorCode,
    };
  }

  function parseDecision(content, context = {}) {
    let parsed;
    try { parsed = JSON.parse(content); } catch { throw new Error("conversation_json_parse_failed"); }
    const message = typeof parsed?.assistant_message === "string" ? parsed.assistant_message.trim() : "";
    const action = ACTIONS.has(parsed?.proposed_action) ? parsed.proposed_action : null;
    const field = FIELDS.has(parsed?.question_field) ? parsed.question_field : null;
    if (!message || message.length > 400 || FORBIDDEN.test(message)) throw new Error("conversation_message_invalid");
    if (!context.allowed_actions?.includes(action)) throw new Error("conversation_action_not_allowed");
    if (action === "ask_one_question" && (!field || !context.missing_fields?.includes(field))) throw new Error("conversation_question_not_allowed");
    if (action === "recommend" && field !== null) throw new Error("conversation_question_unexpected");
    if (action === "ask_one_question" && (message.match(/[?？]/g) || []).length !== 1) throw new Error("conversation_question_count_invalid");
    return { assistant_message: message, proposed_action: action, question_field: field };
  }

  function createConversationAgent(options = {}) {
    const client = options.client || null;
    return {
      async decide(context = {}) {
        if (!client) return fallbackDecision(context, "model_unavailable");
        try {
          const completion = await client.createJsonCompletion({
            systemPrompt: SYSTEM_PROMPT,
            userPrompt: JSON.stringify(context),
            maxTokens: 500,
          });
          return { status: "completed", ...parseDecision(completion.content, context), model: completion.model, usage: completion.usage, error_code: null };
        } catch (error) {
          return fallbackDecision(context, error?.message || "conversation_decision_failed");
        }
      },
    };
  }

  const api = { createConversationAgent, fallbackDecision, parseDecision, SYSTEM_PROMPT };
  root.MotoMateConversationAgent = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
