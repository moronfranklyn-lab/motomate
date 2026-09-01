(function initNeedExtractor(root) {
  const BUDGET_TYPES = new Set(["bare_vehicle_budget", "total_purchase_budget"]);
  const USAGES = new Set(["commute", "weekend", "touring"]);
  const NEW_USED = new Set(["new", "used", "either"]);
  const VEHICLE_TYPES = new Set(["踏板", "街车", "巡航", "太子", "复古", "仿赛", "ADV", "拉力"]);

  const SYSTEM_PROMPT = `你是 MotoMate 的需求提取模块，不负责推荐车型，也不提供购买建议。
只从用户明确表达的内容提取字段，禁止根据常识补齐未知信息。
只返回 JSON 对象，不要 Markdown，不要解释。
允许字段：budget_cny、budget_type、usage、new_used_preference、vehicle_type。
枚举：budget_type=bare_vehicle_budget|total_purchase_budget；usage=commute|weekend|touring；new_used_preference=new|used|either。
无法确认的字段必须为 null。预算单位统一为人民币元。"落地/全部办完"属于 total_purchase_budget，"裸车"属于 bare_vehicle_budget。
输出格式：{"budget_cny":null,"budget_type":null,"usage":null,"new_used_preference":null,"vehicle_type":null}`;

  function validInteger(value, min, max) {
    return Number.isInteger(value) && value >= min && value <= max ? value : null;
  }

  function allowed(value, values) {
    return values.has(value) ? value : null;
  }

  function parseModelJson(content) {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("model_json_parse_failed");
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("schema_validation_failed");
    }
    return {
      budget_cny: validInteger(parsed.budget_cny, 1000, 1000000),
      budget_type: allowed(parsed.budget_type, BUDGET_TYPES),
      usage: allowed(parsed.usage, USAGES),
      new_used_preference: allowed(parsed.new_used_preference, NEW_USED),
      vehicle_type: allowed(parsed.vehicle_type, VEHICLE_TYPES),
    };
  }

  function mergeNeeds(existingNeeds = {}, extractedNeeds = {}) {
    const merged = { ...existingNeeds };
    for (const [field, value] of Object.entries(extractedNeeds)) {
      if ((merged[field] === undefined || merged[field] === null || merged[field] === "") && value !== null) {
        merged[field] = value;
      }
    }
    return merged;
  }

  function fallbackResult(input, fallbackExtractor, errorCode) {
    const fallbackNeeds = typeof fallbackExtractor === "function" ? fallbackExtractor(input) : { ...(input.needs || {}) };
    return {
      schema_version: "motomate_need_extraction_v0.1",
      status: "fallback",
      provider: "deterministic_rules",
      model: null,
      needs: fallbackNeeds,
      extracted_fields: [],
      usage: null,
      error_code: errorCode,
    };
  }

  function createNeedExtractor(options = {}) {
    const client = options.client || null;
    const fallbackExtractor = options.fallbackExtractor;
    return {
      async extract(input = {}) {
        const rawText = typeof input.raw_text === "string" ? input.raw_text.trim().slice(0, 4000) : "";
        if (!client || !rawText) return fallbackResult(input, fallbackExtractor, client ? "empty_user_text" : "model_unavailable");
        try {
          const completion = await client.createJsonCompletion({
            systemPrompt: SYSTEM_PROMPT,
            userPrompt: `用户原话：${JSON.stringify(rawText)}`,
          });
          const extracted = parseModelJson(completion.content);
          const existingNeeds = { ...(input.needs || {}) };
          const needs = mergeNeeds(existingNeeds, extracted);
          return {
            schema_version: "motomate_need_extraction_v0.1",
            status: "completed",
            provider: "deepseek",
            model: completion.model,
            needs,
            extracted_fields: Object.entries(extracted).filter(([field, value]) => value !== null && existingNeeds[field] == null).map(([field]) => field),
            usage: completion.usage,
            error_code: null,
          };
        } catch (error) {
          return fallbackResult(input, fallbackExtractor, error?.message || "need_extraction_failed");
        }
      },
    };
  }

  const api = { createNeedExtractor, mergeNeeds, parseModelJson, SYSTEM_PROMPT };
  root.MotoMateNeedExtractor = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
