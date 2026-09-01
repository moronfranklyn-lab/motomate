(function initDeepSeekClient(root) {
  const DEFAULT_BASE_URL = "https://api.deepseek.com";
  const DEFAULT_MODEL = "deepseek-v4-flash";

  function cleanString(value, maxLength = 500) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  }

  function createDeepSeekClient(options = {}) {
    const apiKey = options.apiKey;
    const fetchImpl = options.fetchImpl || fetch;
    const baseUrl = cleanString(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    const model = cleanString(options.model || DEFAULT_MODEL, 100);
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 8000;
    if (!apiKey) throw new Error("deepseek_api_key_missing");

    return {
      model,
      async createJsonCompletion({ systemPrompt, userPrompt, maxTokens = 800 }) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImpl(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: cleanString(systemPrompt, 8000) },
                { role: "user", content: cleanString(userPrompt, 12000) },
              ],
              response_format: { type: "json_object" },
              thinking: { type: "disabled" },
              temperature: 0,
              max_tokens: maxTokens,
              stream: false,
            }),
            signal: controller.signal,
          });
          const bodyText = await response.text();
          let body;
          try {
            body = JSON.parse(bodyText);
          } catch {
            throw new Error("deepseek_invalid_response_json");
          }
          if (!response.ok) throw new Error(`deepseek_http_${response.status}`);
          const content = body?.choices?.[0]?.message?.content;
          if (typeof content !== "string" || !content.trim()) throw new Error("deepseek_empty_content");
          return {
            content,
            model: cleanString(body.model || model, 100),
            usage: body.usage || null,
          };
        } catch (error) {
          if (error?.name === "AbortError") throw new Error("deepseek_timeout");
          throw error;
        } finally {
          clearTimeout(timer);
        }
      },
    };
  }

  const api = { createDeepSeekClient };
  root.MotoMateDeepSeekClient = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
