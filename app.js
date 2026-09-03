const state = {
  mode: null,
  sessionId: `alpha_${crypto.randomUUID().replaceAll("-", "")}`,
  deviceId: getOrCreateDeviceId(),
  needs: {},
  busy: false,
  recommendationVersion: null,
  lastPrompt: null,
  recommendations: [],
  activeCandidateIndex: 0,
};

const form = document.querySelector("#advisorForm");
const input = document.querySelector("#advisorInput");
const conversation = document.querySelector("#conversation");
let grid = document.querySelector("#recommendationGrid");
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
const feedbackDetails = document.querySelector("#feedbackDetails");
const helpTagsLegend = document.querySelector("#helpTagsLegend");
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
const composerWrap = document.querySelector(".composer-wrap");
const mobileReviewButton = document.querySelector("#mobileReviewButton");
const mobileMemoryButton = document.querySelector("#mobileMemoryButton");
const mobileResetButton = document.querySelector("#mobileResetButton");
const sidebarToast = document.querySelector("#sidebarToast");
const homeComposerSlot = document.querySelector("#homeComposerSlot");
const conversationContext = document.querySelector("#conversationContext");
const conversationContextState = document.querySelector("#conversationContextState");
const conversationContextText = document.querySelector("#conversationContextText");
const memoryBand = document.querySelector("#memoryBand");
const memoryEnabled = document.querySelector("#memoryEnabled");
const memoryStatus = document.querySelector("#memoryStatus");
const memoryList = document.querySelector("#memoryList");
const clearMemoryButton = document.querySelector("#clearMemory");

const modeValues = { new: "new", both: "either", used: "used" };
const modeLabels = { new: "新车优先", both: "新车/二手都看", used: "只看二手" };
const hintExamples = [
  "上下班来回 20 公里，新手第一辆车怎么选？",
  "UHR150 和 PCX160 我有点纠结，差别在哪？",
  "卖家说个人一手、跑了 8000 公里，这辆二手车靠谱吗？",
  "预算还没完全想好，平时主要在市区骑。",
];
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let hintTimer = null;
let hintExampleIndex = 0;
let hintCharacterIndex = 0;
let hintDeleting = false;
let processingTimer = null;
let homeTransitionId = 0;
let homeTransitionAnimations = [];

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

input.addEventListener("focus", () => stopHintAnimation(true));
input.addEventListener("input", () => {
  stopHintAnimation(true);
  resizeComposer();
});
input.addEventListener("paste", () => stopHintAnimation(true));
input.addEventListener("blur", () => {
  if (!input.value && document.body.classList.contains("is-home")) scheduleHintAnimation(900);
});
window.addEventListener("resize", syncComposerInset);
window.visualViewport?.addEventListener("resize", syncComposerInset);
reducedMotionQuery.addEventListener?.("change", () => {
  resetHintAnimation();
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.planned) {
      showSidebarToast(`${button.dataset.planned}功能规划中`);
      return;
    }
    switchView(button.dataset.view);
  });
});

mobileReviewButton.addEventListener("click", () => switchView(advisorView.hidden ? "advisor" : "review"));
mobileMemoryButton.addEventListener("click", () => switchView(memoryBand.hidden ? "memory" : "advisor"));
mobileResetButton.addEventListener("click", resetSession);
memoryEnabled.addEventListener("change", updateMemorySetting);
clearMemoryButton.addEventListener("click", clearAllMemory);

refreshReview.addEventListener("click", loadFeedbackReview);

resetButton.addEventListener("click", resetSession);

feedbackForm.addEventListener("change", (event) => {
  if (event.target.name === "rating") {
    const isLowRating = Number(event.target.value) <= 3;
    failureReasons.hidden = !isLowRating;
    helpTagsLegend.textContent = isLowRating ? "仍有帮助的部分（至少选一项）" : "具体帮到了什么？";
    if (!isLowRating) {
      failureReasons.querySelectorAll("input").forEach((inputElement) => { inputElement.checked = false; });
    }
  }
  updateFeedbackGuidance();
});

feedbackForm.addEventListener("submit", submitFeedback);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || state.busy) return;
  stopHintAnimation();
  input.placeholder = "继续追问、比较或修改条件…";
  const parsed = parseNeed(text);
  const transition = enterConversation({ ...state.needs, ...parsed });
  addMessage(text, "user");
  input.value = "";
  resizeComposer();
  await Promise.all([submitPrompt(text, parsed), transition]);
});

async function submitPrompt(text, parsed = parseNeed(text)) {
  state.needs = { ...state.needs, ...parsed };
  if (parsed.new_used_preference) state.mode = preferenceMode(parsed.new_used_preference);
  updateSummary();
  await runPrompt(text, parsed);
}

function enterConversation(needs) {
  if (!document.body.classList.contains("is-home")) return Promise.resolve();
  cancelHomeTransition();
  const transitionId = homeTransitionId;
  const firstComposerRect = composerWrap.getBoundingClientRect();
  const welcomeRect = welcomePanel.getBoundingClientRect();
  const reducedMotion = reducedMotionQuery.matches;

  renderConversationContext(needs);
  document.querySelector("#starterMessage")?.remove();
  Object.assign(welcomePanel.style, {
    position: "fixed",
    top: `${welcomeRect.top}px`,
    left: `${welcomeRect.left}px`,
    width: `${welcomeRect.width}px`,
    height: `${welcomeRect.height}px`,
    margin: "0",
    zIndex: "4",
    pointerEvents: "none",
  });
  document.body.classList.add("is-home-exiting");
  advisorView.appendChild(composerWrap);
  chatScroll.scrollTop = 0;

  const lastComposerRect = composerWrap.getBoundingClientRect();
  const deltaX = firstComposerRect.left - lastComposerRect.left;
  const deltaY = firstComposerRect.top - lastComposerRect.top;
  const duration = reducedMotion ? 120 : 600;
  const easing = "cubic-bezier(.16, 1, .3, 1)";
  const animations = [
    welcomePanel.animate(
      reducedMotion
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ opacity: 1, transform: "translate3d(0,0,0)" }, { opacity: 0, transform: "translate3d(0,-16px,0)" }],
      { duration: reducedMotion ? duration : 520, easing, fill: "forwards" },
    ),
  ];
  if (!reducedMotion) {
    animations.push(composerWrap.animate(
      [
        { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
        { transform: "translate3d(0, 0, 0)" },
      ],
      { duration, easing, fill: "both" },
    ));
  }
  homeTransitionAnimations = animations;

  return Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
    if (transitionId !== homeTransitionId) return;
    homeTransitionAnimations.forEach((animation) => animation.cancel());
    homeTransitionAnimations = [];
    welcomePanel.hidden = true;
    clearWelcomeTransitionStyles();
    document.body.classList.remove("is-home");
    document.body.classList.remove("is-home-exiting");
    syncComposerInset();
  });
}

function renderConversationContext(needs = {}) {
  const fragments = knownNeedFragments(needs);
  conversationContextText.textContent = fragments.length
    ? `已理解：${fragments.join(" · ")}`
    : "我先理解你刚刚说的，再确认最关键的一点";
  conversationContext.hidden = false;
}

function clearWelcomeTransitionStyles() {
  ["position", "top", "left", "width", "height", "margin", "z-index", "pointer-events", "opacity", "transform"]
    .forEach((property) => welcomePanel.style.removeProperty(property));
}

function cancelHomeTransition() {
  homeTransitionId += 1;
  homeTransitionAnimations.forEach((animation) => animation.cancel());
  homeTransitionAnimations = [];
  clearWelcomeTransitionStyles();
  document.body.classList.remove("is-home-exiting");
}

async function runPrompt(text, parsed = parseNeed(text)) {
  state.lastPrompt = text;
  document.querySelectorAll(".state-panel.transient").forEach((panel) => panel.remove());
  setBusy(true);
  try {
    const response = await fetch("/api/alpha/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session_id: state.sessionId,
        device_id: state.deviceId,
        input: buildApiInput(text, parsed),
      }),
    });
    if (!response.ok) throw new Error(`api_${response.status}`);
    const payload = await response.json();
    state.recommendationVersion = payload.recommendation_version || null;
    renderResult(payload.result);
    setConnectionStatus("已连接", "ready");
  } catch {
    renderStatePanel("这次没有生成结果", "与服务的连接没有完成，但你刚才的问题和已补充的条件都还在。可以直接重试，或先修改原问题。", "error", [
      { label: "重新尝试", action: () => runPrompt(state.lastPrompt), primary: true },
      { label: "修改原问题", action: () => {
        input.value = state.lastPrompt || "";
        resizeComposer();
        input.focus();
      } },
    ]);
    setConnectionStatus("未连接", "error");
  } finally {
    setBusy(false);
    if (!memoryBand.hidden) loadMemory();
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
  const budget = globalThis.MotoMateDecisionCore?.extractBudgetFromText(text);
  if (budget) needs.budget_cny = budget;
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
  else if (/仿赛|跑车|公路赛/.test(text)) needs.vehicle_type = "跑车";
  else if (/复古/.test(text)) needs.vehicle_type = "复古";
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
  if (run.cost_guard && !run.cost_guard.paid_model_calls_allowed) {
    renderStatePanel("当前使用基础模式", "付费模型调用已暂停，本轮继续使用规则筛选和固定模板解释。候选边界、开发预览与正式推荐未批准状态均保持不变。", "degraded");
  }
  if (run.next_action === "ask_one_question") {
    if (run.needs) syncNeedsFromRun(run.needs);
    addMessage(conversationAssistantMessage(run, "ask_one_question") || contextualQuestion(run), "assistant");
    setActions(questionOptions(conversationQuestionField(run)), true);
    resultMeta.textContent = "等待补充信息";
    return;
  }
  if (run.next_action === "partial_advice_only") {
    addMessage("我先不继续追问了。不过预算还不够明确，直接列车型容易误导；先给你方向，补充预算后再生成具体候选。", "assistant", true);
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
  if (run.next_action === "show_open_answer") {
    renderOpenAnswer(run.open_answer);
    return;
  }
  if (run.next_action === "show_development_preview") {
    if (run.needs) syncNeedsFromRun(run.needs);
    if (run.sufficiency?.recommendation_scope === "preliminary_candidates") {
      const missing = (run.sufficiency.missing_fields || []).map(fieldLabel).join("、");
      addMessage(`先不继续追问。我按现有信息给一版初步候选；${missing || "部分偏好"}还没确认，所以当前排序不是最终结论。`, "assistant", true);
      resultMeta.textContent = "初步候选 · 条件待补充";
    }
    addMessage(conversationAssistantMessage(run, "recommend") || recommendationTransition(run.needs), "assistant");
    renderRecommendationRun(run.result);
    return;
  }
  addMessage("当前请求不在内部 Alpha 的购车决策范围内。", "assistant", true);
}

function preferenceMode(value) {
  return ({ new: "new", either: "both", used: "used" })[value] || null;
}

function questionOptions(field) {
  return ({
    budget: ["裸车预算 1.5 万", "裸车预算 2 万", "裸车预算 3 万"],
    budget_type: ["这是裸车预算", "这是落地总预算"],
    usage: ["主要城市通勤", "周末休闲骑行", "长途摩旅"],
    new_used_preference: ["优先看新车", "新车二手都看", "只看二手"],
  })[field] || [`补充${fieldLabel(field)}`];
}

function completedConversation(run, expectedAction) {
  const conversation = run?.conversation;
  if (conversation?.status !== "completed" || conversation.proposed_action !== expectedAction) return null;
  const message = typeof conversation.assistant_message === "string" ? conversation.assistant_message.trim() : "";
  return message ? conversation : null;
}

function conversationAssistantMessage(run, expectedAction) {
  return completedConversation(run, expectedAction)?.assistant_message || null;
}

function conversationQuestionField(run) {
  const allowedFields = new Set(["budget", "budget_type", "usage", "new_used_preference"]);
  const agentField = completedConversation(run, "ask_one_question")?.question_field;
  if (allowedFields.has(agentField)) return agentField;
  return run.sufficiency?.next_question_field || null;
}

function renderOpenAnswer(openAnswer) {
  const answer = typeof openAnswer?.answer === "string" ? openAnswer.answer.trim() : "";
  const suggestions = Array.isArray(openAnswer?.redirect_suggestions)
    ? openAnswer.redirect_suggestions
      .filter((item) => typeof item === "string" && item.trim())
      .slice(0, 3)
      .map((item) => item.trim())
    : [];
  addMessage(
    answer || "这次没有稳定生成回答。你可以换个说法，或者回到新手选车、车型对比和二手车源核查。",
    "assistant",
  );
  setActions(suggestions.length ? suggestions : ["开始新手选车", "对比两款车", "核查二手车源"]);
  if (!state.recommendationVersion) feedbackBand.hidden = true;
  resultMeta.textContent = "Agent 已回答";
}

function syncNeedsFromRun(needs = {}) {
  const knownFields = ["budget_cny", "budget_type", "usage", "new_used_preference", "vehicle_type"];
  knownFields.forEach((field) => {
    if (needs[field] !== undefined && needs[field] !== null) state.needs[field] = needs[field];
  });
  if (state.needs.new_used_preference) state.mode = preferenceMode(state.needs.new_used_preference);
  updateSummary();
  if (!conversationContext.hidden) renderConversationContext(state.needs);
}

function knownNeedFragments(needs = {}) {
  const fragments = [];
  if (Number.isFinite(needs.budget_cny)) {
    const scope = needs.budget_type === "bare_vehicle_budget"
      ? "裸车预算"
      : needs.budget_type === "total_purchase_budget" ? "落地总预算" : "预算";
    fragments.push(`${scope}约 ${formatCny(needs.budget_cny)}`);
  }
  if (needs.usage) fragments.push(`主要用于${usageLabel(needs.usage)}`);
  if (needs.new_used_preference) fragments.push(`倾向${modeLabels[preferenceMode(needs.new_used_preference)] || "新车和二手都可以"}`);
  if (needs.vehicle_type) fragments.push(`车型方向是${vehicleTypeLabel(needs.vehicle_type)}`);
  return fragments;
}

function contextualQuestion(run) {
  const fragments = knownNeedFragments(run.needs);
  const context = fragments.length
    ? `我先记下了：${fragments.join("，")}。`
    : "我们先从最影响筛选结果的信息开始。";
  const question = run.sufficiency?.next_question || `还需要补充${fieldLabel(run.sufficiency?.next_question_field)}。`;
  return `${context}现在只确认一个关键点：${question}`;
}

function recommendationTransition(needs = {}) {
  const fragments = knownNeedFragments(needs);
  const summary = fragments.length ? `我理解的是：${fragments.join("，")}。` : "目前的信息已经足够开始筛选。";
  return `${summary}我先按这组需求筛选，你随时可以继续追问或修改。`;
}

function usageLabel(value) {
  return ({ commute: "城市通勤", weekend: "周末休闲", touring: "长途摩旅" })[value] || "待确认";
}

function vehicleTypeLabel(value) {
  return value === "跑车" ? "仿赛 / 跑车" : value;
}

function renderRecommendationRun(result) {
  feedbackBand.hidden = true;
  prepareResultSurface();
  setActions([]);
  const allCandidates = result.candidate_pool?.candidates || [];
  const candidates = result.display_candidates || allCandidates.slice(0, 3);
  if (candidates.length > 0) {
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
    renderStatePanel("当前条件下没有完全匹配", "规则池没有同时满足全部条件的车型。下方仅展示最接近的候选和未满足项，不是推荐；系统也没有自动放宽你的预算。", "warning", [
      { label: "调整一个条件", prompt: "我愿意调整：", primary: true },
      { label: "重新描述需求", action: () => { input.value = ""; resizeComposer(); input.focus(); } },
    ]);
    if (result.candidate_coverage?.external_search_required) {
      addMessage(externalDiscoveryMessage(result), "assistant", true);
    }
    resultMeta.textContent = "无完全匹配";
    return;
  }
  renderEmpty("当前条件下没有可展示候选", "这是现有规则池的覆盖结果，不代表市场上没有合适车型。你可以先调整一个条件，再重新筛选；未经核验的车型不会被临时补入。");
  if (result.candidate_coverage?.external_search_required) {
    addMessage(externalDiscoveryMessage(result), "assistant", true);
  }
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
  state.recommendations = items;
  state.activeCandidateIndex = 0;
  grid.innerHTML = `<section class="recommendation-stage" id="recommendationStage" aria-live="polite"></section>`;
  renderActiveRecommendation();
  requestAnimationFrame(() => {
    const stage = grid.querySelector("#recommendationStage");
    if (!stage) return;
    stage.style.minHeight = `${Math.ceil(stage.getBoundingClientRect().height)}px`;
    stage.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderActiveRecommendation(direction = 0) {
  const stage = grid.querySelector("#recommendationStage");
  const items = state.recommendations;
  if (!stage || items.length === 0) return;
  const index = Math.min(Math.max(state.activeCandidateIndex, 0), items.length - 1);
  const bike = items[index];
  const before = chatScroll.scrollTop;
  const tradeoffs = candidateTradeoffs(bike);
  const answer = directCandidateAnswer(bike, index);
  stage.innerHTML = `
    <section class="candidate-switcher" aria-label="候选车型，第 ${index + 1} 款，共 ${items.length} 款" aria-roledescription="轮播" tabindex="0">
      <div class="candidate-toolbar">
        <div class="candidate-count"><span>候选车型</span><strong>${index + 1} / ${items.length}</strong></div>
        <div class="carousel-controls" aria-label="切换候选车型">
          <button class="carousel-arrow previous" type="button" aria-label="查看上一款车型" ${index === 0 ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
          <div class="carousel-dots" aria-label="候选位置">${items.map((_, dotIndex) => `<button type="button" aria-label="查看第 ${dotIndex + 1} 款车型" aria-current="${dotIndex === index ? "true" : "false"}" class="${dotIndex === index ? "active" : ""}" data-index="${dotIndex}"></button>`).join("")}</div>
          <button class="carousel-arrow next" type="button" aria-label="查看下一款车型" ${index === items.length - 1 ? "disabled" : ""}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>
        </div>
      </div>
      ${renderCandidateCategoryVisual(bike)}
      <div class="candidate-title-row"><div><h3>${escapeHtml(`${bike.brand} ${bike.model_name}`)}</h3><p>${escapeHtml(bike.trim_name || "当前配置")}</p></div></div>
      <article class="direct-answer">
        <div class="answer-heading"><h4>为什么适合你</h4><span>${escapeHtml(cardRankLabel(index, bike.budget_tier))}</span></div>
        <p class="answer-lead">${escapeHtml(answer)}</p>
        <div class="answer-facts" aria-label="关键参数">
          ${factItem("预算保护价", formatCny(bike.budget_guard_price_cny), "筛选时使用的保守价格")}
          ${factItem("座高", formatSpec(bike.seat_height_mm, " mm"), seatMeaning(bike.seat_height_mm))}
          ${factItem("整备质量", formatSpec(bike.curb_weight_kg, " kg"), weightMeaning(bike.curb_weight_kg))}
          ${factItem("安全辅助", safetyShortLabel(bike), safetyMeaning(bike))}
        </div>
      </article>
      <div class="candidate-detail">
        <section><h4>你需要接受的取舍</h4><ul>${tradeoffs.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
        <section><h4>下一步怎么验证</h4><p>${escapeHtml(candidateNextStep(bike))}</p></section>
      </div>
      <p class="candidate-swipe-hint">在车型区域左右滑动，可切换候选</p>
      <div class="candidate-boundary"><strong>开发预览，尚未正式推荐批准</strong><span>价格以官网与门店同配置报价为准；适配以现场试坐和挪车为准。</span></div>
      ${renderEvidence(bike)}
    </section>`;
  stage.querySelector(".previous").addEventListener("click", () => changeCandidate(index - 1));
  stage.querySelector(".next").addEventListener("click", () => changeCandidate(index + 1));
  stage.querySelectorAll(".carousel-dots button").forEach((button) => button.addEventListener("click", () => changeCandidate(Number(button.dataset.index))));
  const switcher = stage.querySelector(".candidate-switcher");
  bindCandidateSwipe(switcher);
  if (direction !== 0 && !reducedMotionQuery.matches) {
    switcher.animate(
      [
        { opacity: 0.55, transform: `translate3d(${direction * 18}px, 0, 0)` },
        { opacity: 1, transform: "translate3d(0, 0, 0)" },
      ],
      { duration: 220, easing: "cubic-bezier(.16, 1, .3, 1)" },
    );
  }
  chatScroll.scrollTop = before;
}

function renderCandidateCategoryVisual(bike) {
  const type = String(bike.vehicle_type || state.needs.vehicle_type || "").trim();
  const visual = candidateCategoryVisual(type);
  const visibleType = type || "摩托车";
  if (!visual) {
    return `
      <figure class="candidate-visual candidate-visual-fallback">
        <div class="candidate-visual-type" aria-hidden="true">${escapeHtml(visibleType)}</div>
        <figcaption><strong>${escapeHtml(visibleType)}</strong><span>当前暂无准确的车型类别示意图</span></figcaption>
      </figure>`;
  }
  return `
    <figure class="candidate-visual">
      <img src="${visual.src}" alt="" width="1200" height="800" loading="lazy" decoding="async">
      <figcaption><strong>${escapeHtml(visual.label)}</strong><span>车型类别示意 · 非具体推荐车型</span></figcaption>
    </figure>`;
}

function candidateCategoryVisual(type) {
  if (type === "踏板") return { src: "./assets/intro/scooter.jpg", label: "踏板" };
  if (type === "街车") return { src: "./assets/intro/street.jpg", label: "街车" };
  if (/巡航|太子/.test(type)) return { src: "./assets/intro/cruiser.jpg", label: "巡航" };
  if (/拉力|ADV/i.test(type)) return { src: "./assets/intro/adv.jpg", label: "拉力 / ADV" };
  return null;
}

function changeCandidate(nextIndex) {
  if (nextIndex < 0 || nextIndex >= state.recommendations.length || nextIndex === state.activeCandidateIndex) return;
  const direction = nextIndex > state.activeCandidateIndex ? 1 : -1;
  state.activeCandidateIndex = nextIndex;
  renderActiveRecommendation(direction);
}

function bindCandidateSwipe(target) {
  let startX = null;
  target.addEventListener("pointerdown", (event) => { startX = event.clientX; });
  target.addEventListener("pointerup", (event) => {
    if (startX === null) return;
    const delta = event.clientX - startX;
    startX = null;
    if (Math.abs(delta) < 52) return;
    changeCandidate(state.activeCandidateIndex + (delta < 0 ? 1 : -1));
  });
  target.addEventListener("pointercancel", () => { startX = null; });
  target.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    changeCandidate(state.activeCandidateIndex + (event.key === "ArrowRight" ? 1 : -1));
  });
}

function factItem(label, value, note) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></div>`;
}

function directCandidateAnswer(bike, index) {
  const title = `${bike.brand} ${bike.model_name} ${bike.trim_name}`;
  const price = formatCny(bike.budget_guard_price_cny);
  const seat = Number.isFinite(bike.seat_height_mm) ? `${bike.seat_height_mm} mm 座高` : "座高证据不足";
  const weight = Number.isFinite(bike.curb_weight_kg) ? `${bike.curb_weight_kg} kg 整备质量` : "整备质量证据不足";
  const safety = safetyShortLabel(bike);
  const opening = index === 0 ? "先看这台" : "再对比这台";
  return `${opening}${title}。当前预算保护价为 ${price}；${seat}、${weight}，安全辅助记录为${safety}。这些参数说明它为什么进入当前候选，也说明你到店最该核对什么。`;
}

function safetyShortLabel(bike) {
  const abs = bike.abs ? `ABS ${bike.abs}` : "ABS 待核验";
  const tcs = bike.tcs ? `TCS ${bike.tcs}` : "TCS 待核验";
  return `${abs} / ${tcs}`;
}

function candidateNextStep(bike) {
  const checks = ["核对同年款、同配置的最终报价"];
  if (Number.isFinite(bike.seat_height_mm)) checks.push("试坐确认单脚稳定着地");
  if (Number.isFinite(bike.curb_weight_kg)) checks.push("完成一次原地倒车和掉头");
  return `${checks.join("，")}。纸面参数不替代现场判断。`;
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

function cardRankLabel(index, tier) {
  const prefix = ["优先了解", "对比选择", "升级选择"][index] || "候选";
  return `${prefix} · ${budgetTierLabel(tier)}`;
}

function candidateTradeoffs(bike) {
  const items = [];
  if (bike.budget_tier === "upgrade") items.push("价格接近预算上沿，需要判断增加预算是否值得");
  if (!bike.abs || !/双通道/.test(bike.abs)) items.push(`ABS 当前记录为${bike.abs || "证据不足"}，需核对当前配置`);
  if (!bike.tcs) items.push("TCS 证据不足，不作为购买判断");
  if (items.length === 0) items.push("纸面参数不能替代现场试坐和低速挪车");
  return items.slice(0, 2);
}

function candidateSummary(bike) {
  const reasons = (bike.reason_codes || []).map(reasonLabel).filter(Boolean);
  return reasons.length ? `${reasons.slice(0, 3).join("，")}。` : "符合你当前的预算和车型条件。";
}

function weightMeaning(value) {
  if (!Number.isFinite(value)) return "车重还需要到店确认";
  if (value <= 140) return "先试原地掉头和倒车；纸面较轻不等于一定好挪";
  if (value <= 180) return "重点试原地掉头和倒车，确认低速时能稳住";
  return "车重较高，先确认低速和倒车时能稳住";
}

function seatMeaning(value) {
  if (!Number.isFinite(value)) return "座高数据不足，不做身高适配推断";
  if (value <= 760) return "座高数字偏低，但坐垫宽度和腿长仍会影响着地";
  if (value <= 790) return "纸面座高居中，腿长和坐垫宽度会明显影响着地";
  return "座高数字偏高，优先试坐并确认单脚能稳定着地";
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
      <summary><span class="summary-closed">查看依据与核验状态</span><span class="summary-open">收起依据与核验状态</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg></summary>
      <div class="evidence-content">
        <p class="evidence-intro">这里展示系统实际使用的入选规则、价格口径和公开来源。字段已核验不等于车型适合你，也不等于正式推荐批准。</p>
        <section><h4>为什么进入候选</h4><p>${escapeHtml(reasons.length ? reasons.join("、") : "符合当前硬规则")}</p></section>
        <section><h4>筛选价格怎么计算</h4><p>${escapeHtml(price.official_label || "官方公开价格")}：${formatCny(price.official_public_price_cny)}。本次预算保护价：${formatCny(price.display_cny)}。</p><p class="evidence-note">${escapeHtml(price.policy || "")}</p></section>
        <section><h4>这些字段核验到什么程度</h4><div class="verification-grid">${fields.map(([label, status]) => `<span class="${verificationTone(status)}"><strong>${escapeHtml(label)}</strong><em>${escapeHtml(verificationLabel(status))}</em></span>`).join("")}</div></section>
        <section><h4>公开来源</h4>${sources ? `<ul class="source-list">${sources}</ul>` : `<p>暂无可展示来源</p>`}</section>
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
    usage_high: "适合你当前的主要用途",
    usage_medium: "可以覆盖你当前的主要用途",
  })[code] || null;
}

function verificationTone(status) {
  if (status === "official_verified" || status === "official_verified_detail_non_hard") return "verified";
  if (status === "provisional_verified") return "provisional";
  return "unknown";
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
  prepareResultSurface();
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

function prepareResultSurface() {
  if (grid?.isConnected && grid.innerHTML.trim()) {
    grid.removeAttribute("id");
    grid.classList.add("archived-result");
    grid.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
    });
    grid.querySelector("#recommendationStage")?.removeAttribute("id");
    grid = document.createElement("section");
    grid.className = "recommendation-grid";
    grid.id = "recommendationGrid";
  }
  conversation.appendChild(grid);
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
  input.disabled = busy;
  form.setAttribute("aria-busy", String(busy));
  if (!conversationContext.hidden) conversationContextState.textContent = busy ? "正在理解" : "已理解";
  document.querySelectorAll(".quick-prompts button, .action-chip, .state-actions button").forEach((button) => { button.disabled = busy; });
  document.querySelector("#processingMessage")?.remove();
  clearInterval(processingTimer);
  processingTimer = null;
  if (busy) {
    setConnectionStatus("正在分析", "busy");
    const article = document.createElement("article");
    article.id = "processingMessage";
    article.className = "message assistant-message processing-message";
    article.innerHTML = `<div class="message-avatar">M</div><div class="bubble"><div class="agent-working" role="status" aria-live="polite"><div class="working-head"><span class="working-indicator" aria-hidden="true"><i></i><i></i><i></i></span><p class="processing-line">正在理解你的需求</p></div><ol class="working-stages" aria-label="本轮处理步骤"><li aria-current="step"><span>理解需求</span><small>结合当前对话识别你要解决的问题</small></li><li><span>规则核对</span><small>检查候选与已有资料边界</small></li><li><span>整理依据</span><small>把参数和取舍组织成清楚的回答</small></li></ol></div></div>`;
    conversation.appendChild(article);
    article.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const stages = [
      "正在理解你的需求",
      "正在按规则核对候选",
      "正在整理参数与依据",
    ];
    let stageIndex = 0;
    processingTimer = setInterval(() => {
      if (!article.isConnected) {
        clearInterval(processingTimer);
        processingTimer = null;
        return;
      }
      stageIndex = Math.min(stageIndex + 1, stages.length - 1);
      const current = stages[stageIndex];
      const line = article.querySelector(".processing-line");
      if (!line) return;
      line.textContent = current;
      article.querySelectorAll(".working-stages li").forEach((item, itemIndex) => {
        if (itemIndex === stageIndex) item.setAttribute("aria-current", "step");
        else item.removeAttribute("aria-current");
      });
    }, 2400);
  }
}

function resetSession() {
  cancelHomeTransition();
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === "advisor"));
  reviewBand.hidden = true;
  memoryBand.hidden = true;
  advisorView.hidden = false;
  state.sessionId = `alpha_${crypto.randomUUID().replaceAll("-", "")}`;
  state.needs = {};
  state.recommendationVersion = null;
  state.mode = null;
  state.lastPrompt = null;
  state.recommendations = [];
  state.activeCandidateIndex = 0;
  document.body.classList.add("is-home");
  homeComposerSlot.appendChild(composerWrap);
  updateSummary();
  conversation.innerHTML = `<article class="message assistant-message" id="starterMessage"><div class="message-avatar">M</div><div class="bubble"><p>想到什么就直接说。预算、用途，或者正在纠结哪两台都行。</p></div></article>`;
  grid.innerHTML = "";
  welcomePanel.hidden = false;
  conversationContext.hidden = true;
  conversationContextText.textContent = "";
  nextActions.hidden = true;
  resultMeta.textContent = "等待你的需求";
  feedbackBand.hidden = true;
  delete feedbackBand.dataset.state;
  feedbackForm.reset();
  feedbackStatus.removeAttribute("data-tone");
  input.disabled = false;
  input.value = "";
  resetHintAnimation();
  resizeComposer();
  setActions([]);
  switchView("advisor");
}

function showFeedback() {
  if (!state.recommendationVersion) return;
  delete feedbackBand.dataset.state;
  feedbackForm.reset();
  feedbackForm.removeAttribute("aria-busy");
  feedbackForm.querySelectorAll("input, textarea, button").forEach((element) => { element.disabled = false; });
  feedbackDetails.hidden = true;
  failureReasons.hidden = true;
  helpTagsLegend.textContent = "具体帮到了什么？";
  feedbackStatus.textContent = "先选择 1–5 分";
  feedbackStatus.removeAttribute("data-tone");
  const submitButton = feedbackForm.querySelector("button[type=submit]");
  submitButton.textContent = "提交反馈";
  submitButton.disabled = true;
  versionMeta.textContent = `推荐版本 V${state.recommendationVersion.version_number}`;
  feedbackBand.hidden = false;
  conversation.appendChild(feedbackBand);
}

function updateFeedbackGuidance() {
  if (feedbackBand.dataset.state === "submitted") return;
  const data = new FormData(feedbackForm);
  const rating = Number(data.get("rating"));
  const helpTags = data.getAll("help_tag");
  const failureReasonsValue = data.getAll("failure_reason");
  const submitButton = feedbackForm.querySelector("button[type=submit]");
  const isComplete = Boolean(rating && helpTags.length > 0 && (rating > 3 || failureReasonsValue.length > 0));
  submitButton.disabled = !isComplete;
  feedbackDetails.hidden = !rating;
  feedbackStatus.removeAttribute("data-tone");
  if (!rating) {
    feedbackStatus.textContent = "先选择 1–5 分";
  } else if (helpTags.length === 0) {
    feedbackStatus.textContent = "再选择至少一项具体感受";
  } else if (rating <= 3 && failureReasonsValue.length === 0) {
    feedbackStatus.textContent = "再告诉我哪里没帮到你";
  } else {
    feedbackStatus.textContent = "已填好，可以提交";
    feedbackStatus.dataset.tone = "ready";
  }
}

async function submitFeedback(event) {
  event.preventDefault();
  if (!state.recommendationVersion) return;
  const data = new FormData(feedbackForm);
  const rating = Number(data.get("rating"));
  const helpTags = data.getAll("help_tag");
  const failureReasonsValue = data.getAll("failure_reason");
  if (!rating || helpTags.length === 0) {
    feedbackDetails.hidden = !rating;
    feedbackStatus.textContent = rating ? "请选择至少一项具体感受" : "请先选择帮助度";
    feedbackStatus.dataset.tone = "error";
    feedbackForm.querySelector(rating ? 'input[name="help_tag"]' : 'input[name="rating"]')?.focus();
    return;
  }
  if (rating <= 3 && failureReasonsValue.length === 0) {
    feedbackStatus.textContent = "请告诉我至少一个没帮到你的地方";
    feedbackStatus.dataset.tone = "error";
    feedbackForm.querySelector('input[name="failure_reason"]')?.focus();
    return;
  }
  const submitButton = feedbackForm.querySelector("button[type=submit]");
  feedbackForm.setAttribute("aria-busy", "true");
  feedbackForm.querySelectorAll("input, textarea, button").forEach((element) => { element.disabled = true; });
  submitButton.textContent = "正在提交…";
  feedbackStatus.textContent = "正在保存这次反馈";
  feedbackStatus.removeAttribute("data-tone");
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
    if (response.status === 409) {
      feedbackBand.dataset.state = "submitted";
      feedbackStatus.textContent = "这个推荐版本已经提交过反馈";
      feedbackStatus.dataset.tone = "success";
      return;
    }
    if (!response.ok) throw new Error(`feedback_${response.status}`);
    const payload = await response.json();
    feedbackBand.dataset.state = "submitted";
    feedbackStatus.textContent = payload.feedback.success_sample ? "已提交，这条反馈会用于校准推荐" : "已提交，感谢你指出问题";
    feedbackStatus.dataset.tone = "success";
  } catch {
    feedbackForm.querySelectorAll("input, textarea, button").forEach((element) => { element.disabled = false; });
    submitButton.textContent = "重新提交";
    feedbackStatus.textContent = "这次没有保存成功，已保留你填写的内容";
    feedbackStatus.dataset.tone = "error";
  } finally {
    feedbackForm.removeAttribute("aria-busy");
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

function switchView(view) {
  const isReview = view === "review";
  const isMemory = view === "memory";
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  advisorView.hidden = isReview || isMemory;
  reviewBand.hidden = !isReview;
  memoryBand.hidden = !isMemory;
  mobileReviewButton.classList.toggle("active", isReview);
  mobileMemoryButton.classList.toggle("active", isMemory);
  mobileReviewButton.setAttribute("aria-label", isReview ? "返回当前咨询" : "打开反馈复盘");
  mobileMemoryButton.setAttribute("aria-label", isMemory ? "返回当前咨询" : "查看我的记忆");
  if (isReview) {
    reviewBand.scrollTop = 0;
    loadFeedbackReview();
  } else if (isMemory) {
    memoryBand.scrollTop = 0;
    loadMemory();
  } else if (!state.busy) {
    input.focus({ preventScroll: true });
  }
}

function getOrCreateDeviceId() {
  const existing = localStorage.getItem("motomate_device_id");
  if (/^device_[a-zA-Z0-9_-]{16,80}$/.test(existing || "")) return existing;
  const created = `device_${crypto.randomUUID().replaceAll("-", "")}`;
  localStorage.setItem("motomate_device_id", created);
  return created;
}

const memoryLabels = {
  riding_experience: "骑行经验", primary_usage: "长期主要用途", new_used_preference: "新车 / 二手偏好",
  preferred_vehicle_type: "偏好车型", excluded_vehicle_type: "排除车型", budget_range_cny: "长期预算范围",
};

function formatMemoryValue(value) {
  if (value && typeof value === "object") return Number.isFinite(value.max) ? formatCny(value.max) : "未设置";
  return String(value ?? "");
}

async function loadMemory() {
  memoryStatus.textContent = "正在读取…";
  try {
    const response = await fetch(`/api/memory?device_id=${encodeURIComponent(state.deviceId)}`);
    if (!response.ok) throw new Error(`memory_${response.status}`);
    const payload = await response.json();
    memoryEnabled.checked = payload.settings.memory_enabled;
    renderMemoryList(payload.memories || []);
    memoryStatus.textContent = payload.settings.memory_enabled ? "记忆已启用" : "记忆已关闭，新对话不会被保存";
  } catch {
    memoryStatus.textContent = "读取失败，请确认服务已连接后重试。";
  }
}

function renderMemoryList(items) {
  memoryList.innerHTML = items.length ? items.map((item) => `<div class="memory-row" data-key="${escapeHtml(item.key)}"><div><strong>${escapeHtml(memoryLabels[item.key] || item.key)}</strong><span>${escapeHtml(formatMemoryValue(item.value))}</span></div><div class="memory-row-actions"><button type="button" data-action="edit">编辑</button><button type="button" data-action="delete">删除</button></div></div>`).join("") : `<div class="memory-empty"><strong>还没有长期偏好</strong><p>明确说“以后都优先看踏板”，或在不同咨询中重复同一偏好后，这里才会出现记录。</p></div>`;
  memoryList.querySelectorAll("[data-action=edit]").forEach((button) => button.addEventListener("click", () => beginMemoryEdit(button.closest(".memory-row"))));
  memoryList.querySelectorAll("[data-action=delete]").forEach((button) => button.addEventListener("click", () => memoryRequest(`/api/memory/${encodeURIComponent(button.closest(".memory-row").dataset.key)}`, "DELETE", {}, "记忆已删除")));
}

function beginMemoryEdit(row) {
  const key = row.dataset.key;
  const value = row.querySelector("span").textContent;
  row.innerHTML = `<label><strong>${escapeHtml(memoryLabels[key] || key)}</strong><input class="memory-edit-input" value="${escapeHtml(value)}" aria-label="编辑${escapeHtml(memoryLabels[key] || key)}"></label><div class="memory-row-actions"><button type="button" data-save>保存</button><button type="button" data-cancel>取消</button></div>`;
  row.querySelector("[data-cancel]").addEventListener("click", loadMemory);
  row.querySelector("[data-save]").addEventListener("click", () => {
    const raw = row.querySelector("input").value.trim();
    if (!raw) return;
    const valueToSave = key === "budget_range_cny" ? { max: Number(raw.replace(/\D/g, "")) } : raw;
    memoryRequest(`/api/memory/${encodeURIComponent(key)}`, "PUT", { value: valueToSave }, "记忆已更新");
  });
  row.querySelector("input").focus();
}

async function memoryRequest(url, method, body, successText) {
  memoryStatus.textContent = "正在保存…";
  try {
    const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ device_id: state.deviceId, ...body }) });
    if (!response.ok) throw new Error(`memory_${response.status}`);
    memoryStatus.textContent = successText;
  } catch {
    memoryStatus.textContent = "操作失败，原有记忆未更改。";
  }
  await loadMemory();
}

async function updateMemorySetting() {
  await memoryRequest("/api/memory/settings", "PATCH", { memory_enabled: memoryEnabled.checked }, memoryEnabled.checked ? "记忆已启用" : "记忆已关闭");
}

async function clearAllMemory() {
  if (!window.confirm("确定清空短期对话和全部长期偏好吗？此操作无法恢复。")) return;
  await memoryRequest("/api/memory", "DELETE", {}, "全部记忆已清空");
}

function showMemoryDisclosure() {
  if (localStorage.getItem("motomate_memory_disclosure_seen") === "true") return;
  const notice = document.createElement("div");
  notice.className = "memory-disclosure";
  notice.innerHTML = `<span>本浏览器会临时保存最近约 20 轮对话，24 小时后自动删除；稳定购车偏好可在“我的记忆”中管理。</span><button type="button">知道了</button>`;
  welcomePanel.querySelector("p").insertAdjacentElement("afterend", notice);
  notice.querySelector("button").addEventListener("click", () => { localStorage.setItem("motomate_memory_disclosure_seen", "true"); notice.remove(); });
}

let sidebarToastTimer;
function showSidebarToast(message) {
  clearTimeout(sidebarToastTimer);
  sidebarToast.textContent = message;
  sidebarToast.hidden = false;
  sidebarToastTimer = setTimeout(() => { sidebarToast.hidden = true; }, 2200);
}

function clearHintTimer() {
  if (hintTimer !== null) window.clearTimeout(hintTimer);
  hintTimer = null;
}

function stopHintAnimation(clearPlaceholder = false) {
  clearHintTimer();
  input.dataset.hintState = "stopped";
  if (clearPlaceholder && !input.value && document.body.classList.contains("is-home")) input.placeholder = "";
}

function scheduleHintAnimation(delay = 0) {
  clearHintTimer();
  if (input.value || document.activeElement === input || !document.body.classList.contains("is-home")) return;
  if (reducedMotionQuery.matches) {
    input.placeholder = hintExamples[0];
    input.dataset.hintState = "static";
    return;
  }
  input.dataset.hintState = "scheduled";
  hintTimer = window.setTimeout(runHintFrame, delay);
}

function runHintFrame() {
  if (input.value || document.activeElement === input || !document.body.classList.contains("is-home")) {
    stopHintAnimation();
    return;
  }
  const example = hintExamples[hintExampleIndex];
  input.dataset.hintState = hintDeleting ? "deleting" : "typing";
  if (!hintDeleting) {
    hintCharacterIndex = Math.min(hintCharacterIndex + 1, example.length);
    input.placeholder = example.slice(0, hintCharacterIndex);
    if (hintCharacterIndex === example.length) {
      hintDeleting = true;
      hintTimer = window.setTimeout(runHintFrame, 2400);
      return;
    }
    hintTimer = window.setTimeout(runHintFrame, 62);
    return;
  }
  hintCharacterIndex = Math.max(0, hintCharacterIndex - 1);
  input.placeholder = example.slice(0, hintCharacterIndex);
  if (hintCharacterIndex === 0) {
    hintDeleting = false;
    hintExampleIndex = (hintExampleIndex + 1) % hintExamples.length;
    hintTimer = window.setTimeout(runHintFrame, 520);
    return;
  }
  hintTimer = window.setTimeout(runHintFrame, 34);
}

function resetHintAnimation() {
  clearHintTimer();
  hintExampleIndex = 0;
  hintCharacterIndex = 0;
  hintDeleting = false;
  input.placeholder = reducedMotionQuery.matches ? hintExamples[0] : "";
  scheduleHintAnimation(reducedMotionQuery.matches ? 0 : 900);
}

function resizeComposer() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  requestAnimationFrame(syncComposerInset);
}

function syncComposerInset() {
  if (document.body.classList.contains("is-home")) {
    chatScroll.style.paddingBottom = "64px";
    chatScroll.style.scrollPaddingBottom = "64px";
    return;
  }
  const inset = Math.ceil(composerWrap.getBoundingClientRect().height + 20);
  chatScroll.style.paddingBottom = `${inset}px`;
  chatScroll.style.scrollPaddingBottom = `${inset}px`;
}

function setConnectionStatus(text, stateName) {
  statusPill.textContent = text;
  statusPill.dataset.state = stateName;
}

function renderStatePanel(title, copy, tone = "", actions = []) {
  const panel = document.createElement("section");
  panel.className = `state-panel transient ${tone}`.trim();
  panel.setAttribute("role", tone === "error" ? "alert" : "status");
  panel.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");
  panel.innerHTML = `<div class="state-heading"><span class="state-icon" aria-hidden="true">${stateIcon(tone)}</span><strong>${escapeHtml(title)}</strong></div><p>${escapeHtml(copy)}</p>${actions.length ? `<div class="state-actions"></div>` : ""}`;
  const actionContainer = panel.querySelector(".state-actions");
  actions.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    if (item.primary) button.classList.add("primary");
    button.textContent = item.label;
    button.addEventListener("click", () => {
      if (item.prompt !== undefined) {
        input.value = item.prompt;
        resizeComposer();
        input.focus();
      }
      item.action?.();
    });
    actionContainer?.appendChild(button);
  });
  conversation.appendChild(panel);
  requestAnimationFrame(() => {
    if (panel.isConnected) panel.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function stateIcon(tone) {
  if (tone === "error") return '<svg viewBox="0 0 24 24"><path d="M12 8v5m0 3.5v.01"/><circle cx="12" cy="12" r="9"/></svg>';
  if (tone === "warning") return '<svg viewBox="0 0 24 24"><path d="M12 9v4m0 4v.01M10.3 4.9 2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.9a2 2 0 0 0-3.4 0Z"/></svg>';
  if (tone === "degraded") return '<svg viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/><circle cx="12" cy="12" r="9"/></svg>';
  return '<svg viewBox="0 0 24 24"><path d="m7 12 3 3 7-7"/><circle cx="12" cy="12" r="9"/></svg>';
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
  feedbackBand.hidden = true;
  setActions([]);
  resultMeta.textContent = "规则池无匹配候选";
  renderStatePanel(title, copy, "warning", [
    { label: "调整一个条件", prompt: "我想调整一个条件：", primary: true },
    { label: "重新描述需求", action: () => { input.value = ""; resizeComposer(); input.focus(); } },
  ]);
}

function setActions(items, submitOnClick = false) {
  nextActions.hidden = items.length === 0;
  actionList.innerHTML = items.map((item) => `<button class="action-chip" type="button" data-prompt="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("");
  actionList.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    input.value = button.dataset.prompt;
    if (submitOnClick) form.requestSubmit();
    else input.focus();
  }));
  if (items.length > 0) conversation.appendChild(nextActions);
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
    setConnectionStatus("已连接", "ready");
  } catch {
    setConnectionStatus("未连接", "error");
  }
}

updateSummary();
showMemoryDisclosure();
resizeComposer();
window.setTimeout(() => document.body.classList.remove("home-arriving"), reducedMotionQuery.matches ? 0 : 1100);
resetHintAnimation();
checkHealth();
