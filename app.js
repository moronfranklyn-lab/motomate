const state = {
  mode: null,
  sessionId: `alpha_${crypto.randomUUID().replaceAll("-", "")}`,
  needs: {},
  busy: false,
  recommendationVersion: null,
  needsConfirmed: false,
  pendingPrompt: null,
};

const form = document.querySelector("#advisorForm");
const input = document.querySelector("#advisorInput");
const conversation = document.querySelector("#conversation");
const grid = document.querySelector("#recommendationGrid");
const resultMeta = document.querySelector("#resultMeta");
const statusPill = document.querySelector("#statusPill");
const budgetValue = document.querySelector("#budgetValue");
const usageValue = document.querySelector("#usageValue");
const typeValue = document.querySelector("#typeValue");
const modeValue = document.querySelector("#modeValue");
const actionList = document.querySelector("#actionList");
const resetButton = document.querySelector("#resetButton");
const sendButton = document.querySelector(".send-button");
const feedbackBand = document.querySelector("#feedbackBand");
const feedbackForm = document.querySelector("#feedbackForm");
const failureReasons = document.querySelector("#failureReasons");
const feedbackStatus = document.querySelector("#feedbackStatus");
const versionMeta = document.querySelector("#versionMeta");
const reviewBand = document.querySelector("#reviewBand");
const reviewMetrics = document.querySelector("#reviewMetrics");
const ratingDistribution = document.querySelector("#ratingDistribution");
const helpTagCounts = document.querySelector("#helpTagCounts");
const failureReasonCounts = document.querySelector("#failureReasonCounts");
const recentFeedbackList = document.querySelector("#recentFeedbackList");
const refreshReview = document.querySelector("#refreshReview");
const advisorView = document.querySelector("#advisorView");
const welcomePanel = document.querySelector("#welcomePanel");
const nextActions = document.querySelector("#nextActions");
const chatScroll = document.querySelector("#chatScroll");

const modeValues = { new: "new", both: "either", used: "used" };
const modeLabels = { new: "新车优先", both: "新车/二手都看", used: "只看二手" };

document.querySelectorAll(".quick-prompts button").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.dataset.prompt;
    form.requestSubmit();
  });
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    const view = button.dataset.view;
    if (view === "review") {
      advisorView.hidden = true;
      loadFeedbackReview();
      reviewBand.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    reviewBand.hidden = true;
    advisorView.hidden = false;
    input.focus();
  });
});

refreshReview.addEventListener("click", loadFeedbackReview);

resetButton.addEventListener("click", resetSession);

feedbackForm.addEventListener("change", (event) => {
  if (event.target.name === "rating") {
    failureReasons.hidden = Number(event.target.value) > 3;
  }
});

feedbackForm.addEventListener("submit", submitFeedback);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || state.busy) return;
  welcomePanel.hidden = true;
  addMessage(text, "user");
  input.value = "";
  await submitPrompt(text);
});

async function submitPrompt(text) {
  const parsed = parseNeed(text);
  state.needs = { ...state.needs, ...parsed };
  if (parsed.new_used_preference) state.mode = preferenceMode(parsed.new_used_preference);
  updateSummary();
  if (!state.needsConfirmed && hasMinimumNeeds(state.needs)) {
    showNeedConfirmation(text);
    return;
  }
  await runPrompt(text, parsed);
}

async function runPrompt(text, parsed = parseNeed(text)) {
  setBusy(true);
  try {
    const response = await fetch("/api/alpha/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: state.sessionId,
        input: buildApiInput(text, parsed),
      }),
    });
    if (!response.ok) throw new Error(`api_${response.status}`);
    const payload = await response.json();
    state.recommendationVersion = payload.recommendation_version;
    renderResult(payload.result);
    statusPill.textContent = "内部 Alpha 已连接";
  } catch {
    addMessage("本地 Alpha 服务暂时不可用，请确认服务已启动后重试。", "assistant", true);
    statusPill.textContent = "服务未连接";
    setActions(["确认本地服务状态", "保留当前需求", "稍后重试"]);
  } finally {
    setBusy(false);
  }
}

function buildApiInput(text, parsed) {
  const usedIntent = state.mode === "used" && /二手车源|里程|挂牌价|事故|泡水|调表/.test(text);
  return {
    raw_text: text,
    intent: usedIntent ? "used_text_risk" : undefined,
    needs: { ...parsed, ...(state.mode ? { new_used_preference: modeValues[state.mode] } : {}) },
    ...parseUsedFields(text),
  };
}

function parseNeed(text) {
  const needs = {};
  const tenThousand = text.match(/(\d+(?:\.\d+)?)\s*[万wW]/);
  const yuan = text.match(/(\d{4,6})\s*元/);
  if (tenThousand) needs.budget_cny = Math.round(Number(tenThousand[1]) * 10000);
  else if (yuan && /预算/.test(text)) needs.budget_cny = Number(yuan[1]);
  if (/裸车/.test(text)) needs.budget_type = "bare_vehicle_budget";
  if (/落地|总预算|包含保险|包含上牌/.test(text)) needs.budget_type = "total_purchase_budget";
  if (/新车和二手|新旧都|都可以|都能接受|都看/.test(text)) needs.new_used_preference = "either";
  else if (/二手/.test(text)) needs.new_used_preference = "used";
  else if (/新车/.test(text)) needs.new_used_preference = "new";
  if (/通勤|上下班|代步|市区/.test(text)) needs.usage = "commute";
  else if (/摩旅|长途|旅行/.test(text)) needs.usage = "touring";
  else if (/周末|短途|休闲/.test(text)) needs.usage = "weekend";
  if (/踏板/.test(text)) needs.vehicle_type = "踏板";
  else if (/街车/.test(text)) needs.vehicle_type = "街车";
  else if (/巡航|太子/.test(text)) needs.vehicle_type = "巡航";
  return needs;
}

function parseUsedFields(text) {
  const result = {};
  const year = text.match(/(20\d{2})\s*年/);
  const mileage = text.match(/(?:里程)?\s*(\d+)\s*公里/);
  const price = text.match(/(?:挂牌价|报价)\s*(\d+(?:\.\d+)?)\s*(万|元)/);
  const model = text.match(/二手车源[：:]?\s*([^，,]+)/);
  if (year) result.year = Number(year[1]);
  if (mileage) result.mileage_km = Number(mileage[1]);
  if (price) result.listing_price_cny = price[2] === "万" ? Number(price[1]) * 10000 : Number(price[1]);
  if (model) result.model = model[1].trim();
  if (/个人一手/.test(text)) result.seller_description = "个人一手";
  return result;
}

function renderResult(run) {
  if (run.next_action === "ask_one_question") {
    addMessage(run.sufficiency.next_question, "assistant", true);
    setActions(questionOptions(run.sufficiency.next_question_field), true);
    resultMeta.textContent = "等待补充信息";
    return;
  }
  if (run.next_action === "partial_advice_only") {
    addMessage("关键追问已达到上限。目前只能提供方向建议，补齐右侧缺失信息后再生成具体候选。", "assistant", true);
    setActions(run.sufficiency.missing_fields.map((field) => `补充${fieldLabel(field)}`));
    return;
  }
  if (run.next_action === "show_used_text_guidance") {
    renderUsedResult(run.result);
    return;
  }
  if (run.next_action === "show_price_state") {
    addMessage(priceMessage(run.result), "assistant", true);
    resultMeta.textContent = "价格状态已返回";
    return;
  }
  if (run.next_action === "show_development_preview") {
    renderRecommendationRun(run.result);
    return;
  }
  addMessage("当前请求不在内部 Alpha 的购车决策范围内。", "assistant", true);
}

function hasMinimumNeeds(needs) {
  return Number.isFinite(needs.budget_cny) && Boolean(needs.budget_type) && Boolean(needs.usage) && Boolean(needs.new_used_preference);
}

function preferenceMode(value) {
  return ({ new: "new", either: "both", used: "used" })[value] || null;
}

function showNeedConfirmation(text) {
  document.querySelector("#needConfirmation")?.remove();
  state.pendingPrompt = text;
  const section = document.createElement("section");
  section.id = "needConfirmation";
  section.className = "need-confirmation";
  section.innerHTML = `
    <p class="confirmation-label">需求确认</p>
    <h3>我理解得对吗？</h3>
    <div class="need-summary">
      <div><span>预算</span><strong>${escapeHtml(formatCny(state.needs.budget_cny))}${state.needs.budget_type === "total_purchase_budget" ? "（落地）" : "（裸车）"}</strong></div>
      <div><span>主要用途</span><strong>${escapeHtml(usageLabel(state.needs.usage))}</strong></div>
      <div><span>新旧偏好</span><strong>${escapeHtml(modeLabels[state.mode] || "待确认")}</strong></div>
    </div>
    <div class="confirmation-actions"><button class="confirm-secondary" type="button">修改</button><button class="confirm-primary" type="button">确认，开始筛选</button></div>`;
  conversation.appendChild(section);
  section.querySelector(".confirm-secondary").addEventListener("click", () => {
    section.remove();
    input.value = "我想修改：";
    input.focus();
  });
  section.querySelector(".confirm-primary").addEventListener("click", async () => {
    section.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    state.needsConfirmed = true;
    addMessage("好的，按这组需求开始筛选。", "assistant");
    await runPrompt(state.pendingPrompt);
    section.remove();
  });
  section.scrollIntoView({ behavior: "smooth", block: "nearest" });
  resultMeta.textContent = "等待确认需求";
}

function questionOptions(field) {
  return ({
    budget: ["裸车预算 1.5 万", "裸车预算 2 万", "裸车预算 3 万"],
    budget_type: ["这是裸车预算", "这是落地总预算"],
    usage: ["主要城市通勤", "周末休闲骑行", "长途摩旅"],
    new_used_preference: ["优先看新车", "新车二手都看", "只看二手"],
  })[field] || [`补充${fieldLabel(field)}`];
}

function usageLabel(value) {
  return ({ commute: "城市通勤", weekend: "周末休闲", touring: "长途摩旅" })[value] || "待确认";
}

function renderRecommendationRun(result) {
  const allCandidates = result.candidate_pool?.candidates || [];
  const candidates = result.display_candidates || allCandidates.slice(0, 3);
  if (candidates.length > 0) {
    addMessage(`已从当前规则池得到 ${allCandidates.length} 个候选，并按入门、均衡和升级三个预算层次优先展示。以下仅为内部开发预览，不是正式推荐批准。`, "assistant");
    renderRecommendations(candidates);
    renderTemporaryCandidate(result.external_evidence_run);
    if (result.candidate_coverage?.external_search_required) {
      addMessage(externalDiscoveryMessage(result), "assistant", true);
      setActions(["调整一个条件重新筛选", "查看现有候选依据", "稍后补充联网候选"]);
    } else {
      setActions(["这三个价格层次怎么选？", "我去门店试坐要注意什么？", "我想换一个条件重新选"]);
    }
    resultMeta.textContent = `开发预览 · ${allCandidates.length} 个候选`;
    showFeedback();
    return;
  }
  const closest = result.closest_candidates || [];
  if (closest.length > 0) {
    renderClosest(closest);
    renderTemporaryCandidate(result.external_evidence_run);
    addMessage("当前条件没有完全匹配。下方仅展示最接近候选及未满足条件，系统没有自动放宽预算。", "assistant", true);
    if (result.candidate_coverage?.external_search_required) {
      addMessage(externalDiscoveryMessage(result), "assistant", true);
    }
    resultMeta.textContent = "无完全匹配";
    return;
  }
  renderEmpty("当前规则池没有可展示候选", "当前覆盖不足不等于市场上没有合适车型；需要通过联网搜索补充并核验候选。");
}

function externalDiscoveryMessage(result) {
  const discovery = result?.external_discovery;
  const evidence = result?.external_evidence_run;
  if (evidence?.status === "verified_temporary_candidate") {
    return `现有可信候选覆盖不足。我已联网找到并核验 ${evidence.candidate.brand} ${evidence.candidate.model_name}，官网与平台证据均通过；它仅作为临时候选，不代表正式推荐批准。`;
  }
  if (evidence?.status === "external_verification_required") {
    const draft = evidence.candidate_draft;
    const missing = (evidence.verification?.missing_requirements || []).map(externalRequirementLabel).join("、");
    return `我在线发现了 ${draft?.brand || "一个"} ${draft?.model_name || "车型线索"}，但${missing || "证据不足"}，所以没有加入推荐。`;
  }
  if (evidence?.status === "timeout") {
    return "现有可信候选覆盖不足，联网证据核验超过时间上限。当前保留已有结果，不会用未核验车型补位。";
  }
  if (discovery?.status === "completed") {
    return `现有可信候选覆盖不足。我已联网发现 ${discovery.results.length} 条相关来源线索，但它们还没有完成车型身份、在售状态、配置和价格核验，因此暂不加入候选。`;
  }
  if (discovery?.status === "no_relevant_results") {
    return "现有可信候选覆盖不足，本次联网搜索没有找到足够相关的来源。系统不会用无关网页或模型记忆临时补车。";
  }
  if (discovery?.status === "timeout" || discovery?.status === "failed") {
    return "现有可信候选覆盖不足，本次联网搜索未成功。当前保留已有结果，不会用未经核验的车型补位。";
  }
  return "现有可信候选覆盖不足，需要联网搜索并核验更多车型；当前服务未启用联网扩展，因此不会用模型记忆临时补车。";
}

function externalRequirementLabel(value) {
  return ({
    verified_official_source: "缺少可核验的品牌官网来源",
    official_model_identity: "官网车型身份未匹配",
    official_current_sale_status: "官网当前在售状态未确认",
    official_key_parameters: "官网关键参数不足",
    verified_platform_price_source: "缺少可核验的平台价格来源",
    platform_price_scope_match: "平台年款或配置口径未匹配",
    unresolved_same_scope_price_conflict: "同配置价格存在冲突",
    within_user_budget: "核验后的价格超过你的预算",
  })[value] || value;
}

function renderRecommendations(items) {
  grid.innerHTML = items.map((bike) => `
    <article class="bike-card">
      <div class="card-top"><span class="rank">${escapeHtml(budgetTierLabel(bike.budget_tier))}</span><span class="price">${formatCny(bike.budget_guard_price_cny)}</span></div>
      <div><h3>${escapeHtml(`${bike.brand} ${bike.model_name} ${bike.trim_name}`)}</h3><p class="card-copy">${escapeHtml(candidateSummary(bike))}</p></div>
      <div class="plain-language">
        <div><strong>日常挪车</strong><span>${escapeHtml(weightMeaning(bike.curb_weight_kg))}</span></div>
        <div><strong>坐上去的感受</strong><span>${escapeHtml(seatMeaning(bike.seat_height_mm))}</span></div>
        <div><strong>安全辅助</strong><span>${escapeHtml(safetyMeaning(bike))}</span></div>
      </div>
      <p class="fit-note">${escapeHtml(seatFitNote(bike.seat_height_mm))}</p>
      <div class="warning">内部开发预览，尚未获得正式推荐批准。</div>
      ${renderEvidence(bike)}
    </article>
  `).join("");
}

function renderTemporaryCandidate(evidenceRun) {
  if (evidenceRun?.status !== "verified_temporary_candidate" || !evidenceRun.candidate) return;
  const bike = evidenceRun.candidate;
  const evidence = evidenceRun.verification?.evidence_summary || {};
  const title = [bike.brand, bike.model_name, bike.trim_name].filter(Boolean).join(" ");
  grid.insertAdjacentHTML("beforeend", `
    <article class="bike-card temporary-candidate">
      <div class="card-top"><span class="rank">联网临时候选</span><span class="price">${formatCny(bike.budget_guard_price_cny)}</span></div>
      <h3>${escapeHtml(title)}</h3>
      <p class="card-copy">已通过车型身份、当前在售、关键参数和同配置平台价格门禁，但尚未进入正式知识库。</p>
      <div class="plain-language">
        <div><strong>日常挪车</strong><span>${escapeHtml(weightMeaning(bike.curb_weight_kg))}</span></div>
        <div><strong>坐上去的感受</strong><span>${escapeHtml(seatMeaning(bike.seat_height_mm))}</span></div>
        <div><strong>安全辅助</strong><span>${escapeHtml(safetyMeaning(bike))}</span></div>
      </div>
      <div class="warning">联网临时候选，不是正式推荐；付款前仍需向官网与门店复核。</div>
      <details class="evidence-panel"><summary>查看联网核验依据</summary><div class="evidence-content">
        <section><h4>品牌官网</h4><p>${evidence.official_source_url ? `<a href="${escapeHtml(evidence.official_source_url)}" target="_blank" rel="noopener noreferrer">打开官网证据</a>` : "未记录"}</p></section>
        <section><h4>平台价格</h4><p>${evidence.platform_price_source_url ? `<a href="${escapeHtml(evidence.platform_price_source_url)}" target="_blank" rel="noopener noreferrer">打开平台证据</a>` : "未记录"}</p></section>
      </div></details>
    </article>`);
}

function budgetTierLabel(tier) {
  return ({ entry: "省心入门", balanced: "均衡选择", upgrade: "预算内升级" })[tier] || "候选";
}

function candidateSummary(bike) {
  const reasons = (bike.reason_codes || []).map(reasonLabel).filter(Boolean);
  return reasons.length ? `${reasons.slice(0, 3).join("，")}。` : "符合你当前的预算和车型条件。";
}

function weightMeaning(value) {
  if (!Number.isFinite(value)) return "车重还需要到店确认";
  if (value <= 140) return "数据上相对轻，但仍要试试原地掉头和倒车";
  if (value <= 180) return "不算很轻，新手应重点试原地挪车";
  return "车重较高，低速和倒车时可能更费力";
}

function seatMeaning(value) {
  if (!Number.isFinite(value)) return "座高数据不足，不做身高适配推断";
  if (value <= 760) return "纸面座高偏低，通常更容易建立着地信心";
  if (value <= 790) return "纸面座高居中，腿长和坐垫宽度会明显影响着地";
  return "纸面座高偏高，新手需优先完成现场试坐";
}

function safetyMeaning(bike) {
  const parts = [];
  if (bike.abs) parts.push(`ABS：${bike.abs}`);
  if (bike.tcs) parts.push(`TCS：${bike.tcs}`);
  return parts.length ? parts.join("；") : "ABS/TCS 证据不足，不做默认承诺";
}

function seatFitNote(value) {
  const height = Number.isFinite(value) ? `这辆车纸面座高为 ${value} mm。` : "这辆车缺少可用座高数据。";
  return `${height}不能只用身高判断是否适合；请到店试坐，确认至少单脚能稳定着地，并试一次原地挪车。`;
}

function renderEvidence(bike) {
  const evidence = bike.evidence || {};
  const price = evidence.price || {};
  const reasons = (bike.reason_codes || []).map(reasonLabel).filter(Boolean);
  const fields = [
    ["价格", evidence.field_statuses?.official_public_price_cny],
    ["座高", evidence.field_statuses?.seat_height_mm],
    ["车重", evidence.field_statuses?.curb_weight_kg],
    ["功率", evidence.field_statuses?.max_power_kw],
    ["ABS", evidence.field_statuses?.abs],
    ["TCS", evidence.field_statuses?.tcs],
  ];
  const sources = (evidence.sources || []).map((source) => `
    <li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a></li>
  `).join("");
  return `
    <details class="evidence-panel">
      <summary>查看价格与配置依据</summary>
      <div class="evidence-content">
        <section><h4>为什么入选</h4><p>${escapeHtml(reasons.length ? reasons.join("、") : "符合当前硬规则")}</p></section>
        <section><h4>价格口径</h4><p>${escapeHtml(price.official_label || "官方公开价格")}：${formatCny(price.official_public_price_cny)}。预算保护价：${formatCny(price.display_cny)}。</p><p class="evidence-note">${escapeHtml(price.policy || "")}</p></section>
        <section><h4>字段核验状态</h4><div class="verification-grid">${fields.map(([label, status]) => `<span><strong>${escapeHtml(label)}</strong>${escapeHtml(verificationLabel(status))}</span>`).join("")}</div></section>
        <section><h4>来源</h4>${sources ? `<ul class="source-list">${sources}</ul>` : `<p>暂无可展示来源</p>`}</section>
        <p class="evidence-meta">规则评估：${escapeHtml(formatDate(evidence.rule_evaluated_at))}；Codex 运营复核：${escapeHtml(formatDate(evidence.operational_reviewed_at))}。尚未获得正式推荐批准。</p>
      </div>
    </details>
  `;
}

function reasonLabel(code) {
  return ({
    vehicle_type_match: "符合车型方向",
    within_budget: "未超出裸车预算",
    dual_channel_abs: "配置双通道 ABS",
    traction_control_present: "配置牵引力控制",
    usage_high: "当前用途适配信号较高",
    usage_medium: "当前用途适配信号中等",
  })[code] || null;
}

function verificationLabel(status) {
  return ({
    official_verified: "官方已核验",
    provisional_verified: "多源临时核验",
    official_verified_detail_non_hard: "官方细项已核验",
    unverified_non_hard_null: "暂缺可用证据",
  })[status] || "状态未知";
}

function formatDate(value) {
  if (!value) return "未记录";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未记录" : date.toLocaleDateString("zh-CN");
}

function renderClosest(items) {
  grid.innerHTML = items.map((bike) => `
    <article class="bike-card">
      <div class="card-top"><span class="rank muted-rank">最接近</span><span class="price">${formatCny(bike.budget_guard_price_cny)}</span></div>
      <h3>${escapeHtml(`${bike.brand} ${bike.model_name} ${bike.trim_name}`)}</h3>
      <p class="card-copy">${bike.unmet_conditions.map((item) => item.field === "budget_cny" ? `超出预算 ${formatCny(item.delta_cny)}` : `车型方向为 ${item.actual}`).join("；")}</p>
      <div class="warning">不是正式推荐，需由你明确调整条件后重新筛选。</div>
    </article>
  `).join("");
}

function renderUsedResult(result) {
  const gaps = result.information_gaps.map((item) => item.label);
  addMessage(`已整理车源信息。当前还需确认：${gaps.length ? gaps.join("、") : "无明显字段缺口"}。本结果不能鉴定事故、泡水或调表。`, "assistant", true);
  grid.innerHTML = `<article class="guidance-panel"><h3>必问卖家</h3><ul>${result.seller_questions.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article><article class="guidance-panel"><h3>线下核查</h3><ul>${result.inspection_checklist.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>`;
  resultMeta.textContent = "二手文字核查清单";
  setActions(["向卖家补齐缺失信息", "预约独立第三方检测", "不要仅凭描述完成交易"]);
}

function priceMessage(result) {
  if (result.status === "stale_while_revalidate") return `缓存价格已过期，旧值仍可查看；最后核验时间为 ${result.last_verified_at || "未知"}。禁止使用模型记忆补价。`;
  if (result.status === "verification_required") return "当前没有可用价格缓存，需要完成来源核验后才能给出具体价格。";
  if (result.status === "price_conflict") return "发现同口径价格冲突，该车型不能作为首选，只能进入待核价候选。";
  return `当前缓存价格：${formatCny(result.display_price_cny)}。`;
}

function addMessage(text, role, highlight = false) {
  const article = document.createElement("article");
  article.className = `message ${role}-message`;
  article.innerHTML = `<div class="message-avatar">${role === "assistant" ? "M" : "你"}</div><div class="bubble ${highlight ? "toast" : ""}"><p>${escapeHtml(text)}</p></div>`;
  conversation.appendChild(article);
  article.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function updateSummary() {
  budgetValue.textContent = state.needs.budget_cny ? formatCny(state.needs.budget_cny) : "待确认";
  usageValue.textContent = ({ commute: "通勤/代步", weekend: "周末休闲", touring: "摩旅/长途" })[state.needs.usage] || "待确认";
  typeValue.textContent = state.needs.vehicle_type || "待判断";
  modeValue.textContent = modeLabels[state.mode];
}

function setBusy(busy) {
  state.busy = busy;
  sendButton.disabled = busy;
  if (busy) statusPill.textContent = "正在分析";
}

function resetSession() {
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === "advisor"));
  reviewBand.hidden = true;
  advisorView.hidden = false;
  state.sessionId = `alpha_${crypto.randomUUID().replaceAll("-", "")}`;
  state.needs = {};
  state.recommendationVersion = null;
  state.mode = null;
  state.needsConfirmed = false;
  state.pendingPrompt = null;
  updateSummary();
  conversation.innerHTML = `<article class="message assistant-message"><div class="message-avatar">M</div><div class="bubble"><p>告诉我预算和主要用途就可以开始。遇到座高、车重这些参数，我会翻译成你实际骑车时的感受。</p></div></article>`;
  grid.innerHTML = "";
  welcomePanel.hidden = false;
  nextActions.hidden = true;
  resultMeta.textContent = "等待你的需求";
  feedbackBand.hidden = true;
  feedbackForm.reset();
  setActions([]);
}

function showFeedback() {
  if (!state.recommendationVersion) return;
  feedbackForm.reset();
  feedbackForm.querySelectorAll("input, textarea, button").forEach((element) => { element.disabled = false; });
  failureReasons.hidden = true;
  feedbackStatus.textContent = "反馈不会影响测试资格";
  versionMeta.textContent = `推荐版本 V${state.recommendationVersion.version_number}`;
  feedbackBand.hidden = false;
}

async function submitFeedback(event) {
  event.preventDefault();
  if (!state.recommendationVersion) return;
  const data = new FormData(feedbackForm);
  const rating = Number(data.get("rating"));
  const helpTags = data.getAll("help_tag");
  const failureReasonsValue = data.getAll("failure_reason");
  if (!rating || helpTags.length === 0) {
    feedbackStatus.textContent = "请选择评分和至少一项具体帮助";
    return;
  }
  if (rating <= 3 && failureReasonsValue.length === 0) {
    feedbackStatus.textContent = "低分反馈请选择至少一个原因";
    return;
  }
  const submitButton = feedbackForm.querySelector("button[type=submit]");
  submitButton.disabled = true;
  feedbackStatus.textContent = "正在提交";
  try {
    const response = await fetch(`/api/recommendations/${state.recommendationVersion.recommendation_version_id}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: state.sessionId,
        rating,
        help_tags: helpTags,
        failure_reasons: failureReasonsValue,
        comment: data.get("comment"),
      }),
    });
    if (!response.ok) throw new Error(`feedback_${response.status}`);
    const payload = await response.json();
    feedbackForm.querySelectorAll("input, textarea, button").forEach((element) => { element.disabled = true; });
    feedbackStatus.textContent = payload.feedback.success_sample ? "已提交，计入有效帮助样本" : "已提交，感谢指出问题";
  } catch {
    submitButton.disabled = false;
    feedbackStatus.textContent = "提交失败，当前内容尚未保存";
  }
}

async function loadFeedbackReview() {
  reviewBand.hidden = false;
  refreshReview.disabled = true;
  reviewMetrics.innerHTML = `<div class="metric-card"><span>正在读取</span><strong>…</strong></div>`;
  try {
    const response = await fetch("/api/internal/feedback-summary");
    if (!response.ok) throw new Error(`review_${response.status}`);
    renderFeedbackReview(await response.json());
  } catch {
    reviewMetrics.innerHTML = `<div class="metric-card"><span>复盘数据</span><strong>读取失败</strong></div>`;
  } finally {
    refreshReview.disabled = false;
  }
}

function renderFeedbackReview(summary) {
  const metrics = [
    ["推荐版本", summary.recommendation_version_count],
    ["已收反馈", summary.feedback_count],
    ["反馈覆盖率", formatPercent(summary.feedback_coverage_rate)],
    ["平均评分", `${Number(summary.average_rating).toFixed(1)} / 5`],
    ["有效帮助率", formatPercent(summary.success_sample_rate)],
  ];
  reviewMetrics.innerHTML = metrics.map(([label, value]) => `<div class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
  ratingDistribution.innerHTML = [5, 4, 3, 2, 1].map((rating) => {
    const count = summary.rating_distribution?.[rating] || 0;
    const width = summary.feedback_count ? (count / summary.feedback_count) * 100 : 0;
    return `<div class="distribution-row"><span>${rating} 分</span><div><i style="width:${width}%"></i></div><strong>${count}</strong></div>`;
  }).join("");
  renderCounts(helpTagCounts, summary.help_tag_counts, helpTagLabel, "暂无帮助标签");
  renderCounts(failureReasonCounts, summary.failure_reason_counts, failureReasonLabel, "暂无低分原因");
  recentFeedbackList.innerHTML = summary.recent_feedback.length ? summary.recent_feedback.map((item) => `
    <article class="feedback-record">
      <div><strong>${item.rating} 分</strong><span>${escapeHtml(formatDateTime(item.submitted_at))} · V${item.recommendation_version_number}</span></div>
      <p>${escapeHtml(item.help_tags.map(helpTagLabel).join("、"))}${item.failure_reasons.length ? `；问题：${escapeHtml(item.failure_reasons.map(failureReasonLabel).join("、"))}` : ""}</p>
      ${item.comment ? `<blockquote>${escapeHtml(item.comment)}</blockquote>` : ""}
      <small>候选：${escapeHtml(item.candidate_model_ids.join("、"))}</small>
    </article>
  `).join("") : `<div class="review-empty">还没有反馈数据</div>`;
}

function renderCounts(container, counts, labeler, emptyText) {
  const entries = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);
  container.innerHTML = entries.length ? entries.map(([key, count]) => `<div><span>${escapeHtml(labeler(key))}</span><strong>${count}</strong></div>`).join("") : `<div class="review-empty">${emptyText}</div>`;
}

function helpTagLabel(value) {
  return ({ narrowed_candidates: "缩小候选范围", understood_budget_tradeoff: "理解预算取舍", excluded_unsuitable: "排除不适合车型", clear_next_step: "明确下一步", other: "其他" })[value] || value;
}

function failureReasonLabel(value) {
  return ({ over_budget: "推荐超预算", usage_mismatch: "不符合用途", dislike_model_or_style: "不喜欢车型或外观", possible_data_error: "参数或价格可能错误", too_many_questions: "追问太多", hard_to_understand: "解释看不懂", missing_target_model: "缺少目标车型", other: "其他" })[value] || value;
}

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : date.toLocaleString("zh-CN", { hour12: false });
}

function renderEmpty(title, copy) {
  grid.innerHTML = "";
  addMessage(`${title}。${copy}`, "assistant", true);
}

function setActions(items, submitOnClick = false) {
  nextActions.hidden = items.length === 0;
  actionList.innerHTML = items.map((item) => `<button class="action-chip" type="button" data-prompt="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("");
  actionList.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    input.value = button.dataset.prompt;
    if (submitOnClick) form.requestSubmit();
    else input.focus();
  }));
}

function fieldLabel(field) {
  return ({ budget: "预算", budget_type: "预算口径", usage: "主要用途", new_used_preference: "新车/二手偏好" })[field] || field;
}

function formatCny(value) {
  return Number.isFinite(value) ? `¥${Math.round(value).toLocaleString("zh-CN")}` : "待核验";
}

function formatSpec(value, unit) {
  return Number.isFinite(value) ? `${value}${unit}` : "未知";
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

async function checkHealth() {
  try {
    const response = await fetch("/health");
    if (!response.ok) throw new Error("health_failed");
    statusPill.textContent = "内部 Alpha 已连接";
  } catch {
    statusPill.textContent = "服务未连接";
  }
}

updateSummary();
checkHealth();
