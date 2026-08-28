const state = {
  mode: "new",
  needs: {
    budget: null,
    usage: null,
    type: null,
  },
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

const modeLabel = {
  new: "新车优先",
  both: "新车/二手都看",
  used: "只看二手",
};

const catalog = [
  {
    id: "scooter150",
    name: "城市通勤踏板 150",
    rank: "首选",
    type: "踏板",
    price: "1.2-1.8 万",
    engine: "150cc",
    seat: "约760mm",
    weight: "约135kg",
    tags: ["省心", "储物友好", "低速轻松"],
    fit: ["commute", "easy", "budget"],
    reason: "适合每天通勤、停车挪车频繁的新手，学习成本低，日常便利性比同价位跨骑更强。",
    risk: "动力储备有限，长途和高速巡航不是它的强项。",
  },
  {
    id: "scooter250",
    name: "均衡踏板 250",
    rank: "首选",
    type: "踏板",
    price: "2.4-3.5 万",
    engine: "250cc",
    seat: "约770mm",
    weight: "约180kg",
    tags: ["通勤", "周末短途", "舒适"],
    fit: ["commute", "weekend", "scooter"],
    reason: "比 150 踏板动力更从容，通勤和周末短途都能兼顾，适合预算到 3 万左右的用户。",
    risk: "车重明显上来，窄路掉头和原地挪车要试坐确认。",
  },
  {
    id: "street250",
    name: "轻量街车 250",
    rank: "次选",
    type: "街车",
    price: "1.8-2.8 万",
    engine: "250cc",
    seat: "约795mm",
    weight: "约160kg",
    tags: ["好玩", "轻量", "练车"],
    fit: ["fun", "commute", "manual"],
    reason: "如果你想要驾驶参与感，轻量街车会比踏板更有乐趣，也更适合练习挡车。",
    risk: "没有踏板的储物便利，堵车和雨天通勤更累。",
  },
  {
    id: "adv300",
    name: "入门 ADV 300",
    rank: "备选",
    type: "ADV",
    price: "2.8-4.2 万",
    engine: "300cc",
    seat: "约820mm",
    weight: "约185kg",
    tags: ["摩旅", "通过性", "装载"],
    fit: ["travel", "adv", "weekend"],
    reason: "适合周末短途、郊区烂路和轻度摩旅，坐姿直立，装载扩展空间更好。",
    risk: "坐高和车重对新手不算友好，城市通勤便利性弱于踏板。",
  },
  {
    id: "cruiser300",
    name: "低座巡航 300",
    rank: "备选",
    type: "巡航",
    price: "2.5-4.0 万",
    engine: "300cc",
    seat: "约700mm",
    weight: "约175kg",
    tags: ["低坐高", "风格", "悠闲"],
    fit: ["style", "short", "weekend"],
    reason: "坐高友好，适合更看重外观和放松骑行的人，短途玩乐体验不错。",
    risk: "弯道灵活性和通过性一般，不适合把效率通勤放第一位。",
  },
  {
    id: "sport300",
    name: "入门仿赛 300",
    rank: "备选",
    type: "仿赛",
    price: "2.6-4.5 万",
    engine: "300cc",
    seat: "约780mm",
    weight: "约165kg",
    tags: ["外观运动", "姿态", "玩乐"],
    fit: ["sport", "style", "weekend"],
    reason: "适合非常明确喜欢运动外观和骑姿的人，情绪价值高。",
    risk: "通勤舒适性和低速友好度一般，新手不要只因为外观下单。",
  },
];

document.querySelectorAll(".segment").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".segment").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.mode = button.dataset.mode;
    updateSummary();
  });
});

document.querySelectorAll(".quick-prompts button").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.dataset.prompt;
    input.focus();
  });
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    const view = button.dataset.view;
    if (view === "garage") {
      input.value = "预算3万，想看看适合新手的主流车型方向";
    }
    if (view === "compare") {
      input.value = "我在看踏板150、踏板250、轻量街车250，怎么选";
    }
    if (view === "used") {
      state.mode = "used";
      document.querySelectorAll(".segment").forEach((item) => {
        item.classList.toggle("active", item.dataset.mode === "used");
      });
      input.value = "二手踏板250，2023年，里程8000公里，报价2.6万，值得继续聊吗";
    }
    updateSummary();
    input.focus();
  });
});

resetButton.addEventListener("click", resetDemo);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) {
    pulseStatus("先输入一句需求");
    return;
  }

  addMessage(text, "user");
  input.value = "";
  handlePrompt(text);
});

function handlePrompt(text) {
  const parsed = parseNeed(text);
  state.needs = { ...state.needs, ...parsed };
  syncModeButtons();
  updateSummary();

  if (!state.needs.budget && state.mode !== "used") {
    addMessage("先确认一下，你这次准备拿多少预算买车？", "assistant", true);
    setActions(["补充预算范围", "说明主要用途", "再生成推荐"]);
    return;
  }

  if (!state.needs.usage && !state.needs.type) {
    addMessage("我还差一个关键判断：这辆车主要是通勤，还是周末玩乐/摩旅？", "assistant", true);
    setActions(["补充主要用途", "确认车型方向", "再生成推荐"]);
    return;
  }

  const recommendations = chooseBikes();
  renderRecommendations(recommendations);

  const conclusion = buildConclusion(recommendations);
  addMessage(conclusion, "assistant");
  setActions(["保存本次推荐", "拿首选车型去试坐", "继续问“这几款怎么选”"]);
  resultMeta.textContent = `已生成 ${recommendations.length} 个候选`;
  statusPill.textContent = "本地原型";
}

function parseNeed(text) {
  const normalized = text.toLowerCase();
  const needs = {};
  const budgetMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(万|w|千|k)/i);

  if (budgetMatch) {
    const value = Number(budgetMatch[1]);
    const unit = budgetMatch[2];
    needs.budget = unit === "万" || unit === "w" ? value : value / 10;
  }

  if (/通勤|上下班|代步|买菜|市区/.test(text)) needs.usage = "commute";
  if (/周末|短途|玩|休闲/.test(text)) needs.usage = needs.usage || "weekend";
  if (/摩旅|长途|旅行|烂路|非铺装/.test(text)) needs.usage = "travel";
  if (/外观|帅|姿态|颜值/.test(text)) needs.usage = needs.usage || "style";

  if (/踏板|绵羊/.test(text)) needs.type = "踏板";
  if (/街车|挡车|跨骑/.test(text)) needs.type = "街车";
  if (/adv|拉力|休旅/i.test(text)) needs.type = "ADV";
  if (/巡航|太子/.test(text)) needs.type = "巡航";
  if (/仿赛|跑车|趴赛/.test(text)) needs.type = "仿赛";

  if (/二手/.test(text)) state.mode = state.mode === "new" ? "both" : state.mode;

  return needs;
}

function chooseBikes() {
  const budget = state.needs.budget || 3;
  const usage = state.needs.usage;
  const type = state.needs.type;

  let scored = catalog.map((bike) => {
    let score = 0;
    const priceTop = Number(bike.price.match(/-(\d+(?:\.\d+)?)/)?.[1] || 99);

    if (type && bike.type === type) score += 5;
    if (!type && usage === "commute" && bike.type === "踏板") score += 4;
    if (!type && usage === "travel" && bike.type === "ADV") score += 4;
    if (!type && usage === "style" && ["巡航", "仿赛"].includes(bike.type)) score += 3;
    if (bike.fit.includes(usage)) score += 3;
    if (priceTop <= budget * 1.15) score += 3;
    if (priceTop > budget * 1.35) score -= 4;
    if (budget <= 2 && bike.price.startsWith("1.")) score += 2;

    return { ...bike, score };
  });

  scored = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((bike, index) => ({
      ...bike,
      rank: index === 0 ? "首选" : index === 1 ? "次选" : "备选",
    }));

  return scored;
}

function buildConclusion(recommendations) {
  const first = recommendations[0];
  const budgetText = state.needs.budget ? `${state.needs.budget} 万左右` : "当前预算";
  const typeText = state.needs.type || first.type;
  return `按你现在的需求，重点看 ${typeText} 更合理。${budgetText}里我会优先选「${first.name}」，因为它和你的主要用途匹配度最高。下面这些是演示候选，真实上线版会在推荐前核实实时价格、在售状态和配置变化。`;
}

function renderRecommendations(items) {
  grid.innerHTML = items
    .map(
      (bike) => `
        <article class="bike-card">
          <div class="card-top">
            <span class="rank">${bike.rank}</span>
            <span class="price">${bike.price}</span>
          </div>
          <div>
            <h3>${bike.name}</h3>
            <p class="card-copy">${bike.reason}</p>
          </div>
          <div class="bike-visual" aria-hidden="true">▰</div>
          <div class="spec-row">
            <span><strong>${bike.engine}</strong>排量</span>
            <span><strong>${bike.seat}</strong>坐高</span>
            <span><strong>${bike.weight}</strong>车重</span>
          </div>
          <div class="tag-list">
            ${bike.tags.map((tag) => `<span>${tag}</span>`).join("")}
          </div>
          <div class="warning">${bike.risk}</div>
        </article>
      `,
    )
    .join("");
}

function addMessage(text, role, highlight = false) {
  const article = document.createElement("article");
  article.className = `message ${role}-message`;
  article.innerHTML = `
    <div class="message-avatar">${role === "assistant" ? "M" : "你"}</div>
    <div class="bubble ${highlight ? "toast" : ""}">
      <p>${escapeHtml(text)}</p>
    </div>
  `;
  conversation.appendChild(article);
  article.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function updateSummary() {
  budgetValue.textContent = state.needs.budget ? `${state.needs.budget} 万左右` : "待确认";
  usageValue.textContent = usageLabel(state.needs.usage);
  typeValue.textContent = state.needs.type || inferTypeLabel();
  modeValue.textContent = modeLabel[state.mode];
}

function usageLabel(usage) {
  if (usage === "commute") return "通勤/代步";
  if (usage === "weekend") return "周末玩乐";
  if (usage === "travel") return "摩旅/长途";
  if (usage === "style") return "外观/风格";
  return "待确认";
}

function inferTypeLabel() {
  if (state.needs.usage === "commute") return "踏板优先";
  if (state.needs.usage === "travel") return "ADV 候选";
  if (state.needs.usage === "style") return "巡航/仿赛候选";
  return "待判断";
}

function setActions(items) {
  actionList.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
}

function pulseStatus(text) {
  statusPill.textContent = text;
  statusPill.classList.add("toast");
  window.setTimeout(() => statusPill.classList.remove("toast"), 900);
}

function resetDemo() {
  state.mode = "new";
  state.needs = { budget: null, usage: null, type: null };
  syncModeButtons();
  conversation.innerHTML = `
    <article class="message assistant-message">
      <div class="message-avatar">M</div>
      <div class="bubble">
        <strong>先从预算和用途开始。</strong>
        <p>我会尽量少问问题，信息够了就直接给你 1-3 个候选，并说明为什么适合、哪里要小心。</p>
      </div>
    </article>
  `;
  grid.innerHTML = `
    <article class="empty-state">
      <strong>还没有生成推荐</strong>
      <p>输入预算和用途后，这里会出现首选、次选和备选。</p>
    </article>
  `;
  resultMeta.textContent = "等待需求输入";
  statusPill.textContent = "演示数据";
  setActions(["输入一段真实购车需求", "补充预算或主要用途", "拿推荐车型去试坐/询价"]);
  updateSummary();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function syncModeButtons() {
  document.querySelectorAll(".segment").forEach((item) => {
    item.classList.toggle("active", item.dataset.mode === state.mode);
  });
}

updateSummary();
