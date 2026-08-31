(function initExternalCandidateDiscovery(root) {
  const policyApi = root.MotoMateEvidenceSourcePolicy || (typeof require !== "undefined" ? require("./evidence-source-policy.js") : null);

  function normalizeIdentity(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
  }

  function extractModelName(text) {
    const matches = String(text || "").match(/\b(?:[A-Z]{1,6}-?\d{2,4}[A-Z0-9-]*|\d{2,4}[A-Z]{1,6}(?:-[A-Z])?)\b/gi) || [];
    return matches.find((value) => /\d/.test(value) && /[a-z]/i.test(value)) || null;
  }

  function extractCandidateDrafts(results = [], registry = { models: [] }) {
    const registryModels = Array.isArray(registry.models) ? registry.models : [];
    const drafts = [];
    for (const result of results) {
      const text = `${result.title || ""} ${result.snippet || ""}`;
      const brand = policyApi.normalizeBrand(text);
      const modelName = extractModelName(text);
      if (!brand || !modelName) continue;
      const year = Number((text.match(/\b(20\d{2})\b/) || [])[1]) || null;
      const priceMatches = [...text.matchAll(/(?:售价|指导价|厂商指导价|预售价)?\s*[¥￥]?\s*(\d{1,3}(?:,\d{3})+|\d{4,6})\s*元/g)]
        .map((match) => Number(match[1].replaceAll(",", "")))
        .filter((value) => value >= 5000 && value <= 100000);
      const trim = (text.match(/(标准版|扶手版|箱杠版|城市版|旅行版|手动版|自动版|CVT版|AMT版|Pro版|Play版|Tech\s*Max|纪念版)/i) || [])[1] || null;
      const vehicleType = (text.match(/(巡航|踏板|街车|复古|仿赛|ADV|拉力)/i) || [])[1] || null;
      const existing = registryModels.find((item) =>
        policyApi.normalizeBrand(item.brand) === brand && normalizeIdentity(item.model_name) === normalizeIdentity(modelName));
      drafts.push({
        candidate_id: `external_${normalizeIdentity(brand)}_${normalizeIdentity(modelName)}_${year || "current"}`,
        brand,
        model_name: modelName.toUpperCase(),
        trim_name: trim,
        model_year: year,
        vehicle_type: vehicleType,
        discovered_price_cny: priceMatches[0] || null,
        source_urls: [result.url],
        discovery_status: "unverified_draft",
        registry_match: existing ? {
          model_id: existing.model_id,
          eligibility: existing.rule_pool_eligibility,
        } : null,
      });
    }
    const deduped = new Map();
    for (const draft of drafts) {
      const key = `${draft.brand}|${normalizeIdentity(draft.model_name)}|${draft.model_year || "current"}`;
      const previous = deduped.get(key);
      if (!previous) deduped.set(key, draft);
      else previous.source_urls = [...new Set([...previous.source_urls, ...draft.source_urls])];
    }
    return [...deduped.values()];
  }

  const api = { extractCandidateDrafts, extractModelName, normalizeIdentity };
  root.MotoMateExternalCandidateDiscovery = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
