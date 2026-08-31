(function initBochaSearchClient(root) {
  const DEFAULT_BASE_URL = "https://api.bochaai.com/v1";
  const MAX_RESULTS = 10;

  function safeHttpUrl(value) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      if (['localhost', '127.0.0.1', '::1'].includes(url.hostname)) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  function cleanText(value, maxLength) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
  }

  function classifySource(urlValue) {
    const hostname = new URL(urlValue).hostname.replace(/^www\./, "");
    if (hostname === "58moto.com" || hostname.endsWith(".58moto.com")) return "platform_motuofan";
    if (hostname === "autohome.com.cn" || hostname.endsWith(".autohome.com.cn")) return "platform_autohome";
    if (hostname === "yoojia.com" || hostname.endsWith(".yoojia.com")) return "content_platform_unverified";
    return "unclassified_web_source";
  }

  function isMotorcycleRelevant(item) {
    const text = `${item.title} ${item.site_name} ${item.snippet}`.toLowerCase();
    const motorcycleSignal = /摩托|踏板|机车|motorcycle|scooter|uhr|pcx|nmax|豪爵|本田|雅马哈|春风|无极|奔达|升仕/.test(text);
    const productSignal = /车型|车款|售价|价格|指导价|参数|配置|在售|上市|官网|评测/.test(text);
    return motorcycleSignal && productSignal;
  }

  function normalizeSearchResults(payload) {
    const data = payload?.data || payload || {};
    const pages = Array.isArray(data.webPages?.value) ? data.webPages.value : [];
    return pages.slice(0, MAX_RESULTS).flatMap((item) => {
      const url = safeHttpUrl(item.url);
      if (!url) return [];
      return [{
        title: cleanText(item.name, 180),
        url,
        site_name: cleanText(item.siteName, 100),
        source_type: classifySource(url),
        snippet: cleanText(item.snippet, 500),
        published_at: cleanText(item.datePublished, 80) || null,
      }];
    });
  }

  function buildMotorcycleDiscoveryQuery(searchRequest = {}) {
    const budget = Number.isFinite(searchRequest.budget_cny)
      ? `${Math.round(searchRequest.budget_cny / 1000) / 10}万元以内`
      : "";
    const usage = ({ commute: "城市通勤", weekend: "周末休闲", touring: "长途摩旅" })[searchRequest.usage] || "";
    return [
      "2025 2026 中国 在售 摩托车 车型",
      searchRequest.brand || "",
      searchRequest.vehicle_type || "",
      budget,
      usage,
      "官方指导价 配置参数 新款上市",
    ].filter(Boolean).join(" ");
  }

  function buildTargetedDiscoveryQueries(searchRequest = {}) {
    const brandsByType = {
      "踏板": ["豪爵", "雅马哈"],
      "巡航": ["春风", "无极"],
      "街车": ["春风", "QJMOTOR"],
      "复古": ["无极", "本田"],
      "仿赛": ["QJMOTOR", "春风"],
      "ADV": ["无极", "本田"],
      "拉力": ["无极", "本田"],
    };
    return (brandsByType[searchRequest.vehicle_type] || ["豪爵", "春风"])
      .slice(0, 2)
      .map((brand) => buildMotorcycleDiscoveryQuery({ ...searchRequest, brand }));
  }

  function createBochaSearchClient(options = {}) {
    const apiKey = options.apiKey;
    const fetchImpl = options.fetchImpl || fetch;
    const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 8000;
    if (!apiKey) throw new Error("bocha_api_key_missing");

    return {
      async search(query, searchOptions = {}) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImpl(`${baseUrl}/web-search`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              query: cleanText(query, 300),
              freshness: searchOptions.freshness || "oneYear",
              summary: false,
              count: Math.min(Math.max(searchOptions.count || 8, 1), MAX_RESULTS),
            }),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`bocha_http_${response.status}`);
          const payload = await response.json();
          if (payload?.code && payload.code !== 200) throw new Error(`bocha_api_${payload.code}`);
          const normalizedResults = normalizeSearchResults(payload);
          const relevantResults = normalizedResults.filter(isMotorcycleRelevant);
          return {
            schema_version: "motomate_external_discovery_v0.1",
            provider: "bocha_web_search",
            status: relevantResults.length > 0 ? "completed" : "no_relevant_results",
            query: cleanText(query, 300),
            results: relevantResults,
            raw_result_count: normalizedResults.length,
            evidence_verified: false,
            candidate_use_allowed: false,
          };
        } catch (error) {
          return {
            schema_version: "motomate_external_discovery_v0.1",
            provider: "bocha_web_search",
            status: error?.name === "AbortError" ? "timeout" : "failed",
            query: cleanText(query, 300),
            results: [],
            evidence_verified: false,
            candidate_use_allowed: false,
            error_code: cleanText(error?.message, 80) || "unknown_error",
          };
        } finally {
          clearTimeout(timer);
        }
      },
    };
  }

  const api = { buildMotorcycleDiscoveryQuery, buildTargetedDiscoveryQueries, classifySource, createBochaSearchClient, isMotorcycleRelevant, normalizeSearchResults };
  root.MotoMateBochaSearch = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
