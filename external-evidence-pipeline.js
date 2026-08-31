(function initExternalEvidencePipeline(root) {
  const policyApi = root.MotoMateEvidenceSourcePolicy || (typeof require !== "undefined" ? require("./evidence-source-policy.js") : null);
  const verifierApi = root.MotoMateExternalCandidateVerifier || (typeof require !== "undefined" ? require("./external-candidate-verifier.js") : null);

  function normalizeText(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
  }

  function firstNumber(text, patterns, range) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      const value = Number(match?.[1]);
      if (Number.isFinite(value) && value >= range[0] && value <= range[1]) return value;
    }
    return null;
  }

  const TRIM_NAME_PATTERN = "标准版|扶手版|箱杠版|城市版|旅行版|手动版|自动版|CVT版|AMT版|Pro版|Play版|Tech\\s*Max|纪念版";

  function extractTrimPriceOptions(text) {
    const options = [];
    const pattern = new RegExp(`[¥￥]\\s*(\\d{4,6})\\s*(${TRIM_NAME_PATTERN})`, "gi");
    for (const match of String(text || "").matchAll(pattern)) {
      const trimName = String(match[2]).replace(/\s+/g, " ");
      const priceCny = Number(match[1]);
      if (priceCny >= 5000 && priceCny <= 100000) options.push({ trim_name: trimName, price_cny: priceCny });
    }
    const deduped = new Map(options.map((option) => [`${normalizeText(option.trim_name)}|${option.price_cny}`, option]));
    return [...deduped.values()];
  }

  function extractPageFacts(page, candidate) {
    if (!page || page.prompt_injection_detected) return null;
    const text = `${page.title || ""} ${page.text || ""}`;
    const normalized = normalizeText(text);
    const modelIdentity = normalized.includes(normalizeText(candidate.model_name));
    const priceCny = firstNumber(text, [
      /(?:厂商指导价|官方指导价|建议零售价|售价|价格)[^\d]{0,20}[¥￥]?\s*(\d{4,6})/i,
      /[¥￥]\s*(\d{4,6})/,
    ], [5000, 100000]);
    const displacementCc = firstNumber(text, [/(\d{2,4}(?:\.\d+)?)\s*(?:mL|ml|cc|CC)/], [50, 1500]);
    const seatHeightMm = firstNumber(text, [/(?:座高|坐高)[^\d]{0,20}(\d{3})\s*(?:mm|毫米)?/i], [600, 1000]);
    const curbWeightKg = firstNumber(text, [/(?:整备质量|整备重量|车重)[^\d]{0,20}(\d{2,3})\s*(?:kg|公斤|千克)?/i], [70, 500]);
    const maxPowerKw = firstNumber(text, [/(?:最大功率|功率)[^\d]{0,20}(\d{1,3}(?:\.\d+)?)\s*(?:kW|kw|千瓦)/i], [2, 200]);
    const yearMatch = candidate.model_year ? new RegExp(String(candidate.model_year)).test(text) : true;
    const trimMatch = candidate.trim_name ? normalized.includes(normalizeText(candidate.trim_name)) : true;
    const keyParameterCount = [displacementCc, seatHeightMm, curbWeightKg, maxPowerKw].filter(Number.isFinite).length;
    return {
      model_identity: modelIdentity,
      model_year_match: yearMatch,
      trim_match: trimMatch,
      price_cny: priceCny,
      displacement_cc: displacementCc,
      seat_height_mm: seatHeightMm,
      curb_weight_kg: curbWeightKg,
      max_power_kw: maxPowerKw,
      abs: /\bABS\b/i.test(text) ? "页面明确提及ABS" : null,
      tcs: /\bTCS\b|牵引力控制/i.test(text) ? "页面明确提及TCS" : null,
      current_sale_signal: /上市|在售|售价|建议零售价|厂商指导价|车型详情/.test(text),
      key_parameter_count: keyParameterCount,
      trim_price_options: extractTrimPriceOptions(text),
    };
  }

  function evidenceFromPage(page, candidate, expectedType) {
    const facts = extractPageFacts(page, candidate);
    if (!facts || page.source_type !== expectedType) return null;
    if (expectedType === "official") {
      const verified = facts.model_identity && facts.current_sale_signal && facts.key_parameter_count >= 2;
      return {
        verification_status: verified ? "verified" : "insufficient",
        source_url: page.source_url,
        verified_at: page.captured_at,
        model_identity: facts.model_identity,
        current_sale_status: facts.current_sale_signal,
        key_parameters: facts.key_parameter_count >= 2,
        facts,
      };
    }
    const scopeMatch = facts.model_identity && facts.model_year_match && facts.trim_match && Number.isFinite(facts.price_cny);
    return {
      verification_status: scopeMatch ? "verified" : "insufficient",
      source_url: page.source_url,
      verified_at: page.captured_at,
      price_scope_match: scopeMatch,
      facts,
    };
  }

  function evidenceFromPages(pages, candidate, expectedType) {
    const validPages = (pages || []).filter((page) => page?.source_type === expectedType && !page.prompt_injection_detected);
    if (!validPages.length) return null;
    const factsList = validPages.map((page) => extractPageFacts(page, candidate)).filter(Boolean);
    const firstFinite = (field) => factsList.map((facts) => facts[field]).find(Number.isFinite) ?? null;
    const facts = {
      model_identity: factsList.some((item) => item.model_identity),
      model_year_match: candidate.model_year ? factsList.some((item) => item.model_year_match) : true,
      trim_match: candidate.trim_name ? factsList.some((item) => item.trim_match) : true,
      price_cny: firstFinite("price_cny"),
      displacement_cc: firstFinite("displacement_cc"),
      seat_height_mm: firstFinite("seat_height_mm"),
      curb_weight_kg: firstFinite("curb_weight_kg"),
      max_power_kw: firstFinite("max_power_kw"),
      abs: factsList.map((item) => item.abs).find(Boolean) || null,
      tcs: factsList.map((item) => item.tcs).find(Boolean) || null,
      current_sale_signal: factsList.some((item) => item.current_sale_signal),
      trim_price_options: [...new Map(factsList.flatMap((item) => item.trim_price_options || [])
        .map((option) => [`${normalizeText(option.trim_name)}|${option.price_cny}`, option])).values()],
    };
    facts.key_parameter_count = [facts.displacement_cc, facts.seat_height_mm, facts.curb_weight_kg, facts.max_power_kw]
      .filter(Number.isFinite).length;
    const primaryPage = validPages.find((page) => extractPageFacts(page, candidate)?.model_identity) || validPages[0];
    if (expectedType === "official") {
      const verified = facts.model_identity && facts.current_sale_signal && facts.key_parameter_count >= 2;
      return {
        verification_status: verified ? "verified" : "insufficient",
        source_url: primaryPage.source_url,
        source_urls: validPages.map((page) => page.source_url),
        verified_at: primaryPage.captured_at,
        model_identity: facts.model_identity,
        current_sale_status: facts.current_sale_signal,
        key_parameters: facts.key_parameter_count >= 2,
        facts,
      };
    }
    const scopeMatch = facts.model_identity && facts.model_year_match && facts.trim_match && Number.isFinite(facts.price_cny);
    return {
      verification_status: scopeMatch ? "verified" : "insufficient",
      source_url: primaryPage.source_url,
      source_urls: validPages.map((page) => page.source_url),
      verified_at: primaryPage.captured_at,
      price_scope_match: scopeMatch,
      facts,
    };
  }

  function evidenceQueries(candidate) {
    const identity = [candidate.brand, candidate.model_name, candidate.model_year, candidate.trim_name].filter(Boolean).join(" ");
    const officialDomains = policyApi.officialDomainsForBrand(candidate.brand);
    return {
      official: officialDomains.slice(0, 3).map((domain) => `${identity} 官方 在售 价格 参数 site:${domain}`.trim()),
      platform: `${identity} 指导价 参数 site:58moto.com OR site:autohome.com.cn`,
    };
  }

  function uniqueAllowed(results, candidate, type, limit = 3) {
    const seen = new Set();
    return (results || []).filter((result) => {
      if (policyApi.classifyEvidenceSource(result.url, candidate.brand) !== type || seen.has(result.url)) return false;
      seen.add(result.url);
      return true;
    }).slice(0, limit);
  }

  function mergeSearchRuns(runs) {
    const results = runs.flatMap((run) => run?.results || []);
    const statuses = runs.map((run) => run?.status).filter(Boolean);
    return {
      status: results.length > 0 ? "completed" : statuses.includes("failed") ? "failed" : statuses.includes("timeout") ? "timeout" : "no_relevant_results",
      results,
    };
  }

  function officialDetailLinks(page, candidate) {
    const identity = normalizeText(candidate.model_name);
    return (page?.outgoing_links || []).filter((link) => {
      if (policyApi.classifyEvidenceSource(link.url, candidate.brand) !== "official") return false;
      const value = `${link.url} ${link.text || ""}`;
      return normalizeText(value).includes(identity) || /参数|配置|价格|canshu|jiage|config|parameter|spec/i.test(value);
    }).slice(0, 3);
  }

  async function fetchPageBundle(url, candidate, type, fetchEvidencePage) {
    const primaryPage = await fetchEvidencePage(url, { brand: candidate.brand });
    if (type !== "official") return [primaryPage];
    const detailPages = [];
    for (const link of officialDetailLinks(primaryPage, candidate)) {
      if (link.url === primaryPage.source_url) continue;
      try {
        detailPages.push(await fetchEvidencePage(link.url, { brand: candidate.brand }));
      } catch {
        continue;
      }
    }
    return [primaryPage, ...detailPages];
  }

  async function fetchFirstVerified(results, candidate, type, fetchEvidencePage) {
    const attempts = [];
    let firstEvidence = null;
    for (const result of uniqueAllowed(results, candidate, type)) {
      try {
        const pages = await fetchPageBundle(result.url, candidate, type, fetchEvidencePage);
        const page = pages[0];
        const evidence = evidenceFromPages(pages, candidate, type);
        attempts.push({ url: result.url, status: evidence?.verification_status || "insufficient" });
        if (!firstEvidence) firstEvidence = { page, evidence };
        if (evidence?.verification_status === "verified") return { page, evidence, attempts, failure: null };
      } catch (error) {
        attempts.push({ url: result.url, status: "fetch_failed" });
      }
    }
    return {
      page: firstEvidence?.page || null,
      evidence: firstEvidence?.evidence || null,
      attempts,
      failure: attempts.length ? "no_verified_evidence_page" : `${type}_source_not_found`,
    };
  }

  async function discoverOfficialEvidence(candidate, fetchEvidencePage) {
    const attempts = [];
    const identity = normalizeText(candidate.model_name);
    for (const domain of policyApi.officialDomainsForBrand(candidate.brand).slice(0, 2)) {
      try {
        const rootPage = await fetchEvidencePage(`https://${domain}/`, { brand: candidate.brand });
        const catalogLinks = (rootPage.outgoing_links || []).filter((link) =>
          policyApi.classifyEvidenceSource(link.url, candidate.brand) === "official"
          && /产品|车型|product|motorcycle|vehicle|cpzs/i.test(`${link.text || ""} ${link.url}`)).slice(0, 3);
        for (const catalogLink of catalogLinks) {
          try {
            const catalogPage = await fetchEvidencePage(catalogLink.url, { brand: candidate.brand });
            const modelLinks = (catalogPage.outgoing_links || []).filter((link) =>
              policyApi.classifyEvidenceSource(link.url, candidate.brand) === "official"
              && normalizeText(`${link.text || ""} ${link.url}`).includes(identity)).slice(0, 2);
            for (const modelLink of modelLinks) {
              const pages = await fetchPageBundle(modelLink.url, candidate, "official", fetchEvidencePage);
              const evidence = evidenceFromPages(pages, candidate, "official");
              attempts.push({ url: modelLink.url, status: evidence?.verification_status || "insufficient" });
              if (evidence?.verification_status === "verified") return { page: pages[0], evidence, attempts, failure: null };
            }
          } catch {
            attempts.push({ url: catalogLink.url, status: "fetch_failed" });
          }
        }
      } catch {
        attempts.push({ url: `https://${domain}/`, status: "fetch_failed" });
      }
    }
    return { page: null, evidence: null, attempts, failure: attempts.length ? "no_verified_official_site_evidence" : "official_source_not_found" };
  }

  function selectOfficialTrimOption(officialEvidence) {
    const options = officialEvidence?.facts?.trim_price_options || [];
    if (!options.length) return null;
    return [...options].sort((a, b) => a.price_cny - b.price_cny || a.trim_name.localeCompare(b.trim_name, "zh-CN"))[0];
  }

  function createExternalEvidencePipeline(options = {}) {
    const searchClient = options.searchClient;
    const fetchEvidencePage = options.fetchEvidencePage;
    if (!searchClient || !fetchEvidencePage) throw new Error("external_evidence_dependencies_missing");
    return async function runExternalEvidence(candidate) {
      const queries = evidenceQueries(candidate);
      const [officialSearchRuns, initialPlatformSearch] = await Promise.all([
        Promise.all(queries.official.map((query) => searchClient.search(query, { count: 8, freshness: "noLimit" }))),
        searchClient.search(queries.platform, { count: 8, freshness: "oneYear" }),
      ]);
      const officialSearch = mergeSearchRuns(officialSearchRuns);
      let platformSearch = initialPlatformSearch;
      let [officialResult, platformResult] = await Promise.all([
        fetchFirstVerified(officialSearch.results, candidate, "official", fetchEvidencePage),
        fetchFirstVerified(platformSearch.results, candidate, "platform", fetchEvidencePage),
      ]);
      if (officialResult.evidence?.verification_status !== "verified") {
        const discoveredOfficial = await discoverOfficialEvidence(candidate, fetchEvidencePage);
        officialResult = discoveredOfficial.evidence?.verification_status === "verified"
          ? { ...discoveredOfficial, attempts: [...officialResult.attempts, ...discoveredOfficial.attempts] }
          : { ...officialResult, attempts: [...officialResult.attempts, ...discoveredOfficial.attempts], failure: discoveredOfficial.failure };
      }
      let scopedCandidate = candidate;
      let scopedOfficialEvidence = officialResult.evidence;
      if (!candidate.trim_name) {
        const officialTrimOption = selectOfficialTrimOption(officialResult.evidence);
        if (officialTrimOption) {
          scopedCandidate = {
            ...candidate,
            trim_name: officialTrimOption.trim_name,
            discovered_price_cny: candidate.discovered_price_cny || officialTrimOption.price_cny,
            trim_scope_method: "official_price_trim_pair",
          };
          scopedOfficialEvidence = {
            ...officialResult.evidence,
            facts: { ...officialResult.evidence.facts, price_cny: officialTrimOption.price_cny },
          };
          platformSearch = await searchClient.search(evidenceQueries(scopedCandidate).platform, { count: 8, freshness: "oneYear" });
          platformResult = await fetchFirstVerified(platformSearch.results, scopedCandidate, "platform", fetchEvidencePage);
        }
      }
      const officialPage = officialResult.page;
      const platformPage = platformResult.page;
      const officialEvidence = scopedOfficialEvidence;
      const platformEvidence = platformResult.evidence;
      const officialPrice = officialEvidence?.facts?.price_cny;
      const platformPrice = platformEvidence?.facts?.price_cny;
      const sameScopeConflict = Number.isFinite(officialPrice) && Number.isFinite(platformPrice)
        && Math.abs(officialPrice - platformPrice) / Math.max(officialPrice, platformPrice) > 0.05
        && platformEvidence.price_scope_match;
      const enrichedCandidate = {
        ...scopedCandidate,
        official_public_price_cny: officialPrice || null,
        platform_reference_price_cny: platformPrice || null,
        budget_guard_price_cny: Number.isFinite(officialPrice) && Number.isFinite(platformPrice)
          ? Math.max(officialPrice, platformPrice)
          : officialPrice || platformPrice || candidate.discovered_price_cny || null,
        seat_height_mm: officialEvidence?.facts?.seat_height_mm || null,
        curb_weight_kg: officialEvidence?.facts?.curb_weight_kg || null,
        max_power_kw: officialEvidence?.facts?.max_power_kw || null,
        abs: officialEvidence?.facts?.abs || null,
        tcs: officialEvidence?.facts?.tcs || null,
        candidate_origin: "external_evidence_pipeline",
      };
      const verification = verifierApi.verifyExternalCandidate({
        candidate: enrichedCandidate,
        official_evidence: officialEvidence,
        platform_price_evidence: platformEvidence,
        price_conflict_type: sameScopeConflict ? "true_same_scope_conflict" : null,
      });
      return {
        schema_version: "motomate_external_evidence_pipeline_v0.1",
        status: verification.status,
        candidate_draft: candidate,
        candidate: verification.candidate,
        official_search_status: officialSearch.status,
        platform_search_status: platformSearch.status,
        official_source_url: officialPage?.source_url || null,
        platform_source_url: platformPage?.source_url || null,
        evidence_attempts: {
          official: officialResult.attempts,
          platform: platformResult.attempts,
        },
        verification,
        fetch_failures: {
          official: officialResult.failure,
          platform: platformResult.failure,
        },
      };
    };
  }

  const api = { createExternalEvidencePipeline, evidenceFromPage, evidenceFromPages, evidenceQueries, extractPageFacts, extractTrimPriceOptions, mergeSearchRuns, selectOfficialTrimOption };
  root.MotoMateExternalEvidencePipeline = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
