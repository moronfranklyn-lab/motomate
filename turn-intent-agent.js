(function initTurnIntentAgent(root) {
  const INTENTS = new Set([
    "recommendation_request",
    "requirement_update",
    "candidate_follow_up",
    "motorcycle_question",
    "dealer_advice",
    "test_ride_advice",
    "price_question",
    "used_listing_check",
    "general_chat",
  ]);
  const CARD_ACTIONS = new Set(["none", "show_cards", "refresh_cards"]);
  const CARD_INTENTS = new Set(["recommendation_request", "requirement_update"]);
  const SYSTEM_PROMPT = `你是 MotoMate 主 Agent 的回合决策器。你只判断用户当前这句话要做什么，不回答问题、不推荐车型。
当前消息的明确意图永远优先于历史需求。历史里有预算或车型，不代表用户本轮还要推荐。
意图定义：
- recommendation_request：明确要求选车、推荐或比较候选。
- requirement_update：在选车流程中明确补充或修改预算、用途、新旧偏好或车型方向。
- candidate_follow_up：追问上一轮候选的原因、取舍、参数或怎么选，但没有要求重新筛选。
- motorcycle_question：摩托常识、使用、保养、安全或购买知识问题。
- dealer_advice：门店、销售、报价、合同、费用或交易防坑问题。
- test_ride_advice：试坐、试乘、试驾或原地挪车问题。
- price_question：询问某个车型当前价格。
- used_listing_check：要求核查具体二手车源描述。
- general_chat：其他聊天。
card_action 默认必须是 none。只有 recommendation_request 可用 show_cards，requirement_update 可用 refresh_cards；其他意图绝不允许卡片。
如果不确定是否要重新推荐，选择 candidate_follow_up 或 motorcycle_question，card_action=none。
只返回 JSON：{"intent":"...","card_action":"none|show_cards|refresh_cards","confidence":0到1,"reason":"不超过40字"}`;

  function explicitCardSignal(input = {}) {
    const text = typeof input.raw_text === "string" ? input.raw_text : "";
    const explicitNeeds = input.current_needs && typeof input.current_needs === "object"
      ? Object.values(input.current_needs).some((value) => value !== undefined && value !== null && value !== "")
      : false;
    return explicitNeeds || /推荐|帮我选|选车|买什么|哪款|哪辆|怎么选|比较|对比|纠结|重新.{0,6}(推荐|筛|选)|换一批|调整.{0,6}(预算|用途|车型|新车|二手)|改成|预算|裸车|落地|通勤|代步|周末|摩旅|新车|二手|踏板|街车|巡航|太子|复古|仿赛|跑车|ADV|拉力|\d+(?:\.\d+)?\s*[万wW]|\d{4,6}\s*元/i.test(text);
  }

  function orchestratorIntent(intent) {
    if (CARD_INTENTS.has(intent)) return "beginner_recommendation";
    if (intent === "price_question") return "price_query";
    if (intent === "used_listing_check") return "used_text_risk";
    if (intent === "general_chat") return "general_brief_redirect";
    return "motorcycle_general";
  }

  function enforceDecision(parsed, input = {}) {
    const intent = INTENTS.has(parsed?.intent) ? parsed.intent : null;
    const requestedAction = CARD_ACTIONS.has(parsed?.card_action) ? parsed.card_action : null;
    if (!intent || !requestedAction) throw new Error("turn_intent_schema_invalid");
    const actionAllowed = (intent === "recommendation_request" && requestedAction === "show_cards")
      || (intent === "requirement_update" && requestedAction === "refresh_cards");
    const cardAuthorized = actionAllowed && explicitCardSignal(input);
    return {
      intent,
      orchestrator_intent: orchestratorIntent(intent),
      card_action: cardAuthorized ? requestedAction : "none",
      card_authorized: cardAuthorized,
      confidence: Number.isFinite(parsed.confidence) ? Math.max(0, Math.min(1, parsed.confidence)) : null,
      reason: typeof parsed.reason === "string" ? parsed.reason.trim().slice(0, 40) : null,
      gate_reason: cardAuthorized ? "current_turn_explicitly_authorized" : "cards_not_authorized_by_current_turn",
    };
  }

  function fallbackDecision(input = {}, deterministicIntent = "general_brief_redirect", errorCode = null) {
    const recommendation = deterministicIntent === "beginner_recommendation";
    const inferredIntent = recommendation ? "recommendation_request"
      : deterministicIntent === "price_query" ? "price_question"
      : deterministicIntent === "used_text_risk" ? "used_listing_check"
      : deterministicIntent === "general_brief_redirect" ? "general_chat"
      : "motorcycle_question";
    const requestedAction = recommendation ? "show_cards" : "none";
    return {
      status: "fallback",
      ...enforceDecision({ intent: inferredIntent, card_action: requestedAction, confidence: 0, reason: "确定性回退" }, input),
      model: null,
      usage: null,
      error_code: errorCode,
    };
  }

  function createTurnIntentAgent(options = {}) {
    const client = options.client || null;
    return {
      async decide(context = {}) {
        if (!client) return fallbackDecision(context, context.deterministic_intent, "model_unavailable");
        try {
          const completion = await client.createJsonCompletion({
            systemPrompt: SYSTEM_PROMPT,
            userPrompt: JSON.stringify(context),
            maxTokens: 300,
          });
          let parsed;
          try { parsed = JSON.parse(completion.content); } catch { throw new Error("turn_intent_json_parse_failed"); }
          return { status: "completed", ...enforceDecision(parsed, context), model: completion.model, usage: completion.usage, error_code: null };
        } catch (error) {
          return fallbackDecision(context, context.deterministic_intent, error?.message || "turn_intent_failed");
        }
      },
    };
  }

  const api = { createTurnIntentAgent, enforceDecision, explicitCardSignal, fallbackDecision, orchestratorIntent, SYSTEM_PROMPT };
  root.MotoMateTurnIntentAgent = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
