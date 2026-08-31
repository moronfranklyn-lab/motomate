(function initEvidenceSourcePolicy(root) {
  const BRAND_ALIASES = Object.freeze({
    "豪爵": ["豪爵"],
    "雅马哈系": ["雅马哈", "YAMAHA"],
    "春风": ["春风", "春风动力", "CFMOTO"],
    "本田系合资": ["五羊本田", "新大洲本田", "本田", "HONDA"],
    "无极": ["无极", "VOGE"],
    "奔达": ["奔达", "BENDA"],
    "QJMOTOR": ["QJMOTOR", "钱江"],
    "升仕": ["升仕", "ZONTES"],
  });
  const OFFICIAL_DOMAINS = Object.freeze({
    "豪爵": ["haojue.com"],
    "雅马哈系": ["yamaha-motor.com.cn"],
    "春风": ["cfmoto.com", "cn.cfmoto.com"],
    "本田系合资": ["wuyang-honda.com", "honda-sundiro.com"],
    "无极": ["vogemotor.com", "api.vogemotor.com"],
    "奔达": ["bendamotor.cn"],
    "QJMOTOR": ["qjmotor.com"],
    "升仕": ["zontes.com"],
  });
  const PLATFORM_DOMAINS = Object.freeze(["58moto.com", "autohome.com.cn"]);

  function hostnameMatches(hostname, allowedDomain) {
    return hostname === allowedDomain || hostname.endsWith(`.${allowedDomain}`);
  }

  function normalizedHostname(urlValue) {
    try {
      return new URL(urlValue).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return null;
    }
  }

  function normalizeBrand(value) {
    const text = String(value || "").toLowerCase();
    for (const [brand, aliases] of Object.entries(BRAND_ALIASES)) {
      if (aliases.some((alias) => text.includes(alias.toLowerCase()))) return brand;
    }
    return null;
  }

  function classifyEvidenceSource(urlValue, brand) {
    const hostname = normalizedHostname(urlValue);
    if (!hostname) return "invalid";
    const normalizedBrand = normalizeBrand(brand) || brand;
    if ((OFFICIAL_DOMAINS[normalizedBrand] || []).some((domain) => hostnameMatches(hostname, domain))) return "official";
    if (PLATFORM_DOMAINS.some((domain) => hostnameMatches(hostname, domain))) return "platform";
    return "untrusted";
  }

  function officialDomainsForBrand(brand) {
    return [...(OFFICIAL_DOMAINS[normalizeBrand(brand) || brand] || [])];
  }

  const api = {
    BRAND_ALIASES,
    OFFICIAL_DOMAINS,
    PLATFORM_DOMAINS,
    classifyEvidenceSource,
    normalizeBrand,
    normalizedHostname,
    officialDomainsForBrand,
  };
  root.MotoMateEvidenceSourcePolicy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
