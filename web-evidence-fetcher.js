const dns = require("node:dns/promises");
const net = require("node:net");
const cheerio = require("cheerio");
const { classifyEvidenceSource } = require("./evidence-source-policy.js");

const MAX_BYTES = 1024 * 1024;
const MAX_TEXT = 40000;
const MAX_LINKS = 200;

function privateIp(address) {
  if (!net.isIP(address)) return true;
  if (address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  if (address.startsWith("127.") || address.startsWith("10.") || address.startsWith("192.168.")) return true;
  const match = address.match(/^172\.(\d+)\./);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

async function readLimited(response, maxBytes = MAX_BYTES) {
  if (!response.body?.getReader) return (await response.text()).slice(0, maxBytes);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) throw new Error("evidence_page_too_large");
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function htmlToEvidenceText(html, baseUrl) {
  const $ = cheerio.load(html);
  const outgoingLinks = [];
  const seenLinks = new Set();
  if (baseUrl) {
    $("a[href]").each((_, element) => {
      if (outgoingLinks.length >= MAX_LINKS) return false;
      try {
        const resolved = new URL($(element).attr("href"), baseUrl);
        if (!["http:", "https:"].includes(resolved.protocol) || seenLinks.has(resolved.toString())) return;
        seenLinks.add(resolved.toString());
        outgoingLinks.push({ url: resolved.toString(), text: $(element).text().replace(/\s+/g, " ").trim().slice(0, 120) });
      } catch {
        return;
      }
    });
  }
  $("script,style,noscript,svg,form,iframe").remove();
  const title = $("title").first().text().replace(/\s+/g, " ").trim().slice(0, 300);
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
  return { title, text, outgoing_links: outgoingLinks };
}

function containsPromptInjection(text) {
  return /ignore (all|any|the) previous|忽略(以上|之前|所有)指令|system prompt|开发者指令|读取.*密钥/i.test(text);
}

function createWebEvidenceFetcher(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const lookup = options.lookup || ((hostname) => dns.lookup(hostname, { all: true }));
  const timeoutMs = options.timeoutMs || 7000;

  return async function fetchEvidencePage(urlValue, context = {}) {
    let currentUrl = urlValue;
    for (let redirects = 0; redirects <= 2; redirects += 1) {
      const sourceType = classifyEvidenceSource(currentUrl, context.brand);
      if (sourceType === "invalid" || sourceType === "untrusted") throw new Error("evidence_source_not_allowed");
      const url = new URL(currentUrl);
      const addresses = await lookup(url.hostname);
      if (!addresses.length || addresses.some((item) => privateIp(item.address))) throw new Error("evidence_private_address_blocked");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          headers: { "user-agent": "MotoMateEvidenceBot/0.1 (+internal-alpha)" },
          redirect: "manual",
          signal: controller.signal,
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          if (!location) throw new Error("evidence_redirect_without_location");
          currentUrl = new URL(location, url).toString();
          continue;
        }
        if (!response.ok) throw new Error(`evidence_http_${response.status}`);
        const contentType = response.headers.get("content-type") || "";
        if (!/text\/html|text\/plain|application\/json/.test(contentType)) throw new Error("evidence_content_type_blocked");
        const body = await readLimited(response);
        const parsed = /text\/html/.test(contentType)
          ? htmlToEvidenceText(body, currentUrl)
          : { title: "", text: body.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT), outgoing_links: [] };
        return {
          source_url: currentUrl,
          source_type: classifyEvidenceSource(currentUrl, context.brand),
          captured_at: new Date().toISOString(),
          title: parsed.title,
          text: parsed.text,
          outgoing_links: parsed.outgoing_links,
          prompt_injection_detected: containsPromptInjection(parsed.text),
        };
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error("evidence_redirect_limit_exceeded");
  };
}

module.exports = { containsPromptInjection, createWebEvidenceFetcher, htmlToEvidenceText, privateIp };
