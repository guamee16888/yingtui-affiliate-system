const state = {
  daily: null,
  history: null,
  filter: "all",
  search: ""
};

const labels = {
  shortPost: "短推",
  casualPost: "日常口吻",
  contrarianAngle: "反常识角度",
  painPointHook: "痛点开头",
  threadOpening: "长推开头"
};

const metricLabels = {
  Date: "日期",
  Evaluated: "扫描工具",
  "Top picks": "今日候选",
  "Affiliate queue": "待查联盟",
  "Seen before": "历史出现"
};

const actionLabels = {
  post: "发这条推",
  "research affiliate": "查联盟计划",
  longform: "保留做长文"
};

const followUpLabels = {
  "tweet only": "只适合发单条",
  "thread candidate": "适合做长推",
  "review page candidate": "适合做测评页",
  "affiliate priority": "优先查联盟",
  skip: "跳过"
};

const affiliateLabels = {
  matched: "已配置联盟链接",
  research_needed: "需要查联盟",
  no_fit: "暂不适合联盟"
};

const scoreLabels = {
  painScore: "痛点",
  nicheScore: "小众",
  affiliateScore: "联盟",
  contentScore: "内容",
  noveltyScore: "新鲜",
  riskScore: "风险"
};

const actionClasses = {
  "tweet only": "good",
  "thread candidate": "good",
  "review page candidate": "good",
  "affiliate priority": "warn",
  "skip": "bad"
};

const affiliateClasses = {
  matched: "good",
  research_needed: "warn",
  no_fit: "bad"
};

const $ = (selector) => document.querySelector(selector);

async function readJson(path) {
  const response = await fetch(`${path}?t=${Date.now()}`);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

async function loadDashboard() {
  try {
    const [daily, history] = await Promise.all([
      readJson("/data/latest.json"),
      readJson("/data/history.json").catch(() => ({ tools: [] }))
    ]);
    state.daily = daily;
    state.history = history;
    render();
  } catch (error) {
    renderError(error);
  }
}

function render() {
  renderSummary();
  renderActions();
  renderAffiliateQueue();
  renderHistory();
  renderTools();
  renderSkipped();
  updateMarkdownLink();
}

function renderSummary() {
  const summary = state.daily.summary;
  const items = [
    ["Date", state.daily.date],
    ["Evaluated", summary.totalTools],
    ["Top picks", summary.topPicks],
    ["Affiliate queue", summary.affiliateQueueCount],
    ["Seen before", summary.seenBeforeCount]
  ];

  $("#summaryGrid").innerHTML = items.map(([label, value]) => {
    return `<div class="metric"><span>${escapeHtml(metricLabels[label] ?? label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }).join("");
}

function renderActions() {
  const actions = state.daily.actionList ?? [];
  $("#actionList").innerHTML = actions.length
    ? actions.map((action) => `<li><strong>${escapeHtml(actionLabels[action.type] ?? action.type)}</strong><br>${escapeHtml(cleanActionText(action.reason))}</li>`).join("")
    : `<li class="empty-state">No action list yet.</li>`;
}

function renderAffiliateQueue() {
  const queue = state.daily.affiliateResearchQueue ?? [];
  $("#affiliateQueue").innerHTML = queue.length
    ? queue.slice(0, 6).map((item) => {
      return `<div class="queue-item">
        <strong>${escapeHtml(item.name)}</strong>
        <div>affiliateScore ${escapeHtml(item.affiliateScore)} · total ${escapeHtml(item.score)}</div>
        <a href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">Product Hunt</a>
      </div>`;
    }).join("")
    : `<p class="empty-state">No affiliate research items today.</p>`;
}

function renderHistory() {
  const records = [...(state.history?.tools ?? [])]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.score) - Number(a.score))
    .slice(0, 8);

  $("#historyList").innerHTML = records.length
    ? records.map((record) => {
      return `<div class="history-item">
        <strong>${escapeHtml(record.toolName)}</strong>
        <div>${escapeHtml(record.date)} · ${escapeHtml(record.score)} · ${escapeHtml(record.followUpAction)}</div>
      </div>`;
    }).join("")
    : `<p class="empty-state">No history yet. Run npm run daily first.</p>`;
}

function renderTools() {
  const list = $("#toolList");
  const tools = filteredTools();

  if (!tools.length) {
    list.innerHTML = `<p class="empty-state">No tools match this filter.</p>`;
    return;
  }

  list.innerHTML = "";
  for (const tool of tools) {
    list.appendChild(renderToolCard(tool));
  }
}

function filteredTools() {
  const query = state.search.trim().toLowerCase();
  return (state.daily.tools ?? []).filter((tool) => {
    const matchesFilter = state.filter === "all" || tool.followUpAction === state.filter;
    const haystack = `${tool.name} ${tool.tagline} ${tool.reason} ${tool.suggestedAngle} ${tool.followUpAction}`.toLowerCase();
    return matchesFilter && (!query || haystack.includes(query));
  });
}

function renderToolCard(tool) {
  const template = $("#toolCardTemplate");
  const card = template.content.firstElementChild.cloneNode(true);
  const defaultVariant = tool.copyVariants.shortPost ? "shortPost" : Object.keys(tool.copyVariants)[0];
  let activeVariant = defaultVariant;

  card.querySelector(".tool-meta").textContent = followUpLabels[tool.followUpAction] ?? tool.followUpAction;
  card.querySelector("h2").textContent = tool.name;
  card.querySelector(".tagline").textContent = tool.tagline || "No tagline";
  card.querySelector(".score").textContent = tool.score;
  card.querySelector(".reason").textContent = tool.reason;
  card.querySelector(".product-link").href = tool.url;

  card.querySelector(".status-row").innerHTML = [
    pill(followUpLabels[tool.followUpAction] ?? tool.followUpAction, actionClasses[tool.followUpAction]),
    pill(affiliateLabels[tool.affiliateStatus] ?? tool.affiliateStatus.replace("_", " "), affiliateClasses[tool.affiliateStatus]),
    tool.seenBefore ? pill("历史出现过", "warn") : pill("新工具", "good")
  ].join("");

  card.querySelector(".score-bars").innerHTML = Object.entries(tool.scoreBreakdown)
    .filter(([key]) => ["painScore", "nicheScore", "affiliateScore", "contentScore", "noveltyScore", "riskScore"].includes(key))
    .map(([key, value]) => scoreBar(key, value))
    .join("");

  const tabs = card.querySelector(".copy-tabs");
  const copyText = card.querySelector(".copy-text");

  function setVariant(label) {
    activeVariant = label;
    copyText.textContent = tool.copyVariants[label] ?? "";
    tabs.querySelectorAll(".copy-tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.variant === label);
    });
  }

  tabs.innerHTML = Object.keys(tool.copyVariants).map((label) => {
    return `<button class="copy-tab" type="button" data-variant="${escapeAttr(label)}">${escapeHtml(labels[label] ?? label)}</button>`;
  }).join("");
  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-variant]");
    if (button) setVariant(button.dataset.variant);
  });

  card.querySelector(".copy-button").addEventListener("click", async () => {
    await navigator.clipboard.writeText(tool.copyVariants[activeVariant] ?? "");
    card.querySelector(".copy-button").textContent = "已复制";
    window.setTimeout(() => {
      card.querySelector(".copy-button").textContent = "复制文案";
    }, 1200);
  });

  setVariant(activeVariant);
  return card;
}

function renderSkipped() {
  const skipped = state.daily.skippedTools ?? [];
  $("#skippedList").innerHTML = skipped.length
    ? skipped.slice(0, 10).map((tool) => {
      return `<div class="skip-item">
        <strong>${escapeHtml(tool.name)}</strong>
        <div>${escapeHtml(tool.score)} · ${escapeHtml(tool.followUpAction)} · ${escapeHtml(tool.reason)}</div>
      </div>`;
    }).join("")
    : `<p class="empty-state">No skipped tools in the latest pack.</p>`;
}

function scoreBar(label, value) {
  const width = Math.max(0, Math.min(100, Number(value) * 10));
  const isRisk = label === "riskScore";
  return `<div class="score-bar">
    <span>${escapeHtml(scoreLabels[label] ?? label.replace("Score", ""))}</span>
    <div class="track"><div class="fill ${isRisk ? "risk" : ""}" style="width: ${width}%"></div></div>
    <strong>${escapeHtml(value)}</strong>
  </div>`;
}

function cleanActionText(text) {
  return String(text ?? "")
    .replace(/^Post one X draft:\s*/i, "")
    .replace(/^Check whether\s*/i, "去查 ")
    .replace(/^Save\s*/i, "保存 ")
    .replace(/\s+if the X post gets feedback\.$/i, "，如果推文有互动再继续做。");
}

function pill(text, variant = "") {
  return `<span class="pill ${variant ?? ""}">${escapeHtml(text)}</span>`;
}

function updateMarkdownLink() {
  $("#markdownLink").href = `/output/${state.daily.date}-daily-x-pack.md`;
}

function renderError(error) {
  $("#summaryGrid").innerHTML = `<div class="metric"><span>Error</span><strong>Missing data</strong></div>`;
  $("#toolList").innerHTML = `<p class="empty-state">${escapeHtml(error.message)}. Run npm run daily, then refresh.</p>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

$("#refreshButton").addEventListener("click", () => {
  state.filter = "all";
  state.search = "";
  $("#searchInput").value = "";
  document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item.dataset.filter === "all"));
  loadDashboard();
});
$("#searchInput").addEventListener("input", (event) => {
  state.search = event.target.value;
  renderTools();
});
document.querySelectorAll(".filter").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll(".filter").forEach((item) => item.classList.toggle("active", item === button));
    renderTools();
  });
});

loadDashboard();
