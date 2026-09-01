(function initExplanationGenerator(root) {
  const validatorApi = root.MotoMateResultValidator || (typeof require !== "undefined" ? require("./result-validator.js") : null);
  const RANKS = ["首选", "次选", "备选"];
  const SYSTEM_PROMPT = `你是 MotoMate 的推荐解释模块，不负责挑选、删除、替换或重新排序车型。
只能使用输入 JSON 中提供的候选字段和 reason_codes，不得使用训练记忆补充价格、参数、口碑、质量、在售状态或其他车型。
不得输出链接、保证性承诺、匹配分或“已经正式批准”等表述。
除候选中 allowed_numbers 明确给出的数字外，不得在任何文本字段中自行引入数字或数量；不要说“对比N款”、“N人”、“N次”或类似数量。
每款都要包含简短总结、优点、妥协点、适合人群、不适合人群和下一步动作。
表达像靠谱的年轻懂车朋友，不像参数报告或销售话术。先说这台车为什么值得看，再把取舍讲明白；使用短句和日常中文。
避免“根据你的需求”“综合来看”“总体而言”“值得一提的是”“建议你可以”“为你推荐”等 AI 套话，不玩梗、不堆网络热词。
recommendations 数量必须与输入 candidates 完全相同，model_id 和顺序必须原样保留。
每个候选的 summary、pros、cons、fit、not_fit、next_steps 都必须填写，禁止省略、禁止 null。summary 不超过80个汉字；其余字段必须是包含1至2条短句的数组，每条不超过50个汉字。
只返回 JSON 对象，格式为：{"recommendations":[{"model_id":"原值","summary":"...","pros":["..."],"cons":["..."],"fit":["..."],"not_fit":["..."],"next_steps":["..."]}]}`;

  function cleanText(value, maxLength = 200) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
  }

  function allowedCandidate(candidate = {}) {
    const facts = {
      model_id: candidate.model_id,
      title: cleanText(`${candidate.brand || ""} ${candidate.model_name || ""} ${candidate.trim_name || ""}`),
      vehicle_type: candidate.vehicle_type || null,
      budget_guard_price_cny: candidate.budget_guard_price_cny ?? null,
      seat_height_mm: candidate.seat_height_mm ?? null,
      curb_weight_kg: candidate.curb_weight_kg ?? null,
      max_power_kw: candidate.max_power_kw ?? null,
      abs: candidate.abs ?? null,
      tcs: candidate.tcs ?? null,
      reason_codes: Array.isArray(candidate.reason_codes) ? candidate.reason_codes : [],
    };
    return {
      ...facts,
      allowed_numbers: [
        ...Object.values(facts).filter((value) => typeof value === "number").map(String),
        ...(facts.title.match(/\d+(?:\.\d+)?/g) || []),
      ],
    };
  }

  function buildExplanationContext(needs = {}, candidates = []) {
    const userNeeds = {
      budget_cny: needs.budget_cny ?? null,
      budget_type: needs.budget_type ?? null,
      usage: needs.usage ?? null,
      new_used_preference: needs.new_used_preference ?? null,
      vehicle_type: needs.vehicle_type ?? null,
    };
    const needNumbers = Object.values(userNeeds)
      .filter((value) => typeof value === "number" && Number.isFinite(value))
      .map(String);
    return {
      schema_version: "motomate_explanation_context_v0.1",
      run_mode: "development_preview",
      user_needs: userNeeds,
      candidates: candidates.slice(0, 3).map((candidate) => {
        const allowed = allowedCandidate(candidate);
        return { ...allowed, allowed_numbers: [...new Set([...allowed.allowed_numbers, ...needNumbers])] };
      }),
    };
  }

  function parseDraft(content) {
    try {
      const parsed = JSON.parse(content);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
      return parsed;
    } catch {
      throw new Error("model_json_parse_failed");
    }
  }

  function decorateRecommendations(draft, context) {
    return draft.recommendations.map((item, index) => ({
      rank: RANKS[index],
      model_id: context.candidates[index].model_id,
      title: context.candidates[index].title,
      summary: cleanText(item.summary, 240),
      pros: item.pros.map((value) => cleanText(value, 120)),
      cons: item.cons.map((value) => cleanText(value, 120)),
      fit: item.fit.map((value) => cleanText(value, 120)),
      not_fit: item.not_fit.map((value) => cleanText(value, 120)),
      next_steps: item.next_steps.map((value) => cleanText(value, 120)),
      caveats: [
        "当前批次尚未完成正式推荐批准，仅用于内部 Alpha 预览。",
        "请结合线下试坐、当地报价和最新在售配置继续核验。",
      ],
    }));
  }

  function createExplanationGenerator(options = {}) {
    const client = options.client || null;
    return {
      async generate({ needs = {}, candidates = [] } = {}) {
        if (!client || candidates.length === 0) return { status: "fallback", recommendations: null, validation: null, usage: null, model: null, error_code: client ? "no_candidates" : "model_unavailable" };
        const context = buildExplanationContext(needs, candidates);
        try {
          const completion = await client.createJsonCompletion({
            systemPrompt: SYSTEM_PROMPT,
            userPrompt: JSON.stringify(context),
            maxTokens: 1800,
          });
          const draft = parseDraft(completion.content);
          const validation = validatorApi.validateExplanationOutput(draft, context);
          if (validation.output_blocked) return { status: "fallback", recommendations: null, validation, usage: completion.usage, model: completion.model, error_code: "result_guardrail_failed" };
          return {
            status: "completed",
            recommendations: decorateRecommendations(draft, context),
            validation,
            usage: completion.usage,
            model: completion.model,
            error_code: null,
          };
        } catch (error) {
          return { status: "fallback", recommendations: null, validation: null, usage: null, model: null, error_code: error?.message || "explanation_generation_failed" };
        }
      },
    };
  }

  const api = { buildExplanationContext, createExplanationGenerator, SYSTEM_PROMPT };
  root.MotoMateExplanationGenerator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
