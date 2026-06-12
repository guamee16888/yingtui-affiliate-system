const api = {
  async get(path) {
    const res = await fetch(path);
    const json = await parseApiResponse(res, path);
    if (!json.ok) throw new Error(json.error || "API error");
    return json.data;
  },
  async post(path, body = {}) {
    if (isReadOnlyMode()) throw new Error(readOnlyActionMessage());
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = await parseApiResponse(res, path);
    if (!json.ok) throw new Error(json.error || "API error");
    return json.data;
  }
};

async function parseApiResponse(res, path) {
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) throw new Error(`${path} unavailable (${res.status})`);
  if (!contentType.includes("application/json")) throw new Error(`${path} returned a static page`);
  return res.json();
}

const tabNames = ["today", "review", "candidates", "tools", "copy", "feedback", "decisions", "queues", "accounts", "affiliate", "reviews", "history", "weekly", "settings"];

const state = {
  tab: initialTab(),
  apiWarning: "",
  latest: null,
  history: { tools: [] },
  feedback: { entries: [] },
  accountPosts: { items: [] },
  queues: { items: [] },
  candidateInbox: { items: [] },
  affiliateResearch: { items: [] },
  reviewPages: { items: [] },
  decisions: { summary: {}, recommendations: [], winners: [], weakSignals: [], angleScores: [] },
  feedbackOps: null,
  xStatus: { configured: false, note: "" },
  settings: null,
  weekly: null,
  candidatePreview: null,
  feedbackPreview: null,
  publishTool: null,
  dailyRun: { running: false, message: "" },
  filters: { search: "", action: "all", affiliate: "all", state: "all", minScore: 0, sortBy: "score" }
};

const labels = {
  shortPost: "短推",
  casualPost: "日常口吻",
  contrarianAngle: "反常识角度",
  painPointHook: "痛点开头",
  threadOpening: "长推开头",
  "tweet only": "只发单条",
  "thread candidate": "适合长推",
  "review page candidate": "适合测评页",
  "affiliate priority": "优先查联盟",
  skip: "跳过",
  watch: "观察",
  affiliate_research: "联盟研究",
  thread: "长线程",
  review_page: "SEO 测评页",
  not_started: "未开始",
  searching: "查找中",
  applied: "已申请",
  approved: "已通过",
  rejected: "已拒绝",
  no_program: "无计划",
  added_to_config: "已加入配置"
};

const candidateDecisionLabels = {
  import: "可导入",
  review: "先人工看",
  skip: "跳过"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const writeActionSelector = [
  "[data-run-daily]",
  "[data-preview-candidates]",
  "[data-preview-feedback]",
  "[data-publish]",
  "[data-posted]",
  "[data-feedback]",
  "[data-edit-feedback]",
  "[data-queue]",
  "[data-queue-status]",
  "[data-candidate-status]",
  "[data-affiliate]",
  "[data-aff-status]",
  "[data-review]",
  "#weeklyButton",
  "#affiliateForm button[type='submit']",
  "#candidateForm button[type='submit']",
  "#candidatePasteForm button[type='submit']",
  "#feedbackCsvForm button[type='submit']",
  "#feedbackForm button[type='submit']",
  "#publishForm button[type='submit']"
].join(",");

async function loadAll() {
  try {
    const [latest, history, feedback, accountPosts, queues, candidateInbox, affiliateResearch, reviewPages, decisions, feedbackOps, xStatus, settings, weekly] = await Promise.all([
      api.get("/api/latest"),
      api.get("/api/history"),
      api.get("/api/feedback"),
      api.get("/api/account-posts"),
      api.get("/api/queues"),
      api.get("/api/candidate-inbox"),
      api.get("/api/affiliate-research"),
      api.get("/api/review-pages"),
      api.get("/api/decision-report"),
      api.get("/api/feedback-ops"),
      api.get("/api/x/status"),
      api.get("/api/settings"),
      api.get("/api/weekly-summary")
    ]);
    Object.assign(state, { latest, history, feedback, accountPosts, queues, candidateInbox, affiliateResearch, reviewPages, decisions, feedbackOps, xStatus, settings, weekly, apiWarning: "" });
    render();
  } catch (error) {
    try {
      await loadStaticFallback(error);
      toast("API 失败，已切到静态 JSON 只读模式");
    } catch (fallbackError) {
      toast(`读取失败：${fallbackError.message}`);
      $("#dataStatus").textContent = "读取失败。请先运行 npm run daily。";
    }
  }
}

async function loadStaticFallback(apiError) {
  const [latest, history, feedback, accountPosts, queues, candidateInbox, affiliateResearch, reviewPages, feedbackOps] = await Promise.all([
    fetchJson("/data/latest.json"),
    fetchJson("/data/history.json", { tools: [] }),
    fetchJson("/data/feedback.json", { entries: [] }),
    fetchJson("/data/account-posts.json", { items: [] }),
    fetchJson("/data/queues.json", { items: [] }),
    fetchJson("/data/candidate-inbox.json", { items: [] }),
    fetchJson("/data/affiliate-research.json", { items: [] }),
    fetchJson("/data/review-pages.json", { items: [] }),
    fetchJson("/data/feedback-ops.json", null)
  ]);
  const settings = {
    latestDate: latest?.date ?? null,
    historyCount: history.tools?.length ?? 0,
    forbiddenWords: [],
    maxTweetCharacters: 260,
    affiliateLinks: [],
    feedbackCount: feedback.entries?.length ?? 0,
    accountPostCount: accountPosts.items?.length ?? 0,
    queueCount: queues.items?.length ?? 0,
    candidateInboxCount: candidateInbox.items?.length ?? 0,
    reviewPageCount: reviewPages.items?.length ?? 0,
    affiliateResearchCount: affiliateResearch.items?.length ?? 0
  };
  const weekly = {
    latestDate: latest?.date ?? null,
    historyCount: history.tools?.length ?? 0,
    feedbackCount: feedback.entries?.length ?? 0,
    queueCount: queues.items?.length ?? 0,
    suggestions: []
  };
  Object.assign(state, {
    latest,
    history,
    feedback,
    accountPosts,
    queues,
    candidateInbox,
    affiliateResearch,
    reviewPages,
    decisions: { summary: {}, recommendations: [], winners: [], weakSignals: [], angleScores: [] },
    feedbackOps: feedbackOps ?? latest?.feedbackOps ?? null,
    xStatus: { configured: false, note: "API unavailable; X publishing disabled in static mode." },
    settings,
    weekly,
    apiWarning: staticModeMessage(apiError)
  });
  render();
}

function staticModeMessage(apiError) {
  if (location.hostname.endsWith("vercel.app")) {
    return "Vercel 静态只读模式：可以查看数据，不能刷新、写入反馈或发布到 X。本地操作请运行 npm start。";
  }
  return `API 暂不可用，当前为静态只读模式：${apiError.message}`;
}

function isReadOnlyMode() {
  return Boolean(state.apiWarning) || location.hostname.endsWith("vercel.app");
}

function readOnlyActionMessage() {
  return location.hostname.endsWith("vercel.app")
    ? "线上 Vercel 是只读版。要刷新、保存反馈、生成文件或发布到 X，请回本机运行 npm start。"
    : "当前 API 不可用，页面处于静态只读模式。请确认本地 npm start 正在运行。";
}

async function fetchJson(path, fallback = null) {
  const res = await fetch(path);
  if (!res.ok) {
    if (fallback !== null) return fallback;
    throw new Error(`${path} 不存在或不可读`);
  }
  return res.json();
}

function render() {
  $("#dataStatus").textContent = state.apiWarning || `数据日期 ${state.latest?.date ?? "无"} · 本地 JSON · 不自动发推`;
  $("#markdownLink").href = state.latest?.date ? `/output/${state.latest.date}-daily-x-pack.md` : "/output/";
  $("#jsonLink").href = "/data/latest.json";
  updateRunDailyControls();
  renderMetrics();
  renderReadiness();
  renderActiveView();
  updateRunDailyControls();
  updateReadOnlyControls();
}

function updateRunDailyControls() {
  $$("[data-run-daily]").forEach((button) => {
    button.disabled = isReadOnlyMode() || state.dailyRun.running;
    button.textContent = isReadOnlyMode() ? "本地才能刷新" : state.dailyRun.running ? "刷新中..." : "刷新 Live Feed";
    button.title = isReadOnlyMode() ? readOnlyActionMessage() : "";
  });
}

function updateReadOnlyControls() {
  const readOnly = isReadOnlyMode();
  $$(writeActionSelector).forEach((button) => {
    button.disabled = readOnly;
    button.title = readOnly ? readOnlyActionMessage() : "";
  });
}

function guardReadOnlyAction(event = null) {
  if (!isReadOnlyMode()) return false;
  event?.preventDefault?.();
  toast(readOnlyActionMessage());
  return true;
}

function renderMetrics() {
  const feedbackCount = state.feedback.entries.length;
  const queueCount = state.queues.items.length;
  const latest = state.latest ?? { summary: {} };
  $("#metrics").innerHTML = [
    ["日期", latest.date ?? "-"],
    ["扫描工具", latest.summary?.totalTools ?? 0],
    ["今日候选", latest.summary?.topPicks ?? 0],
    ["已发记录", feedbackCount],
    ["跟进队列", queueCount],
    ["收集候选", state.candidateInbox.items.filter((item) => item.status === "active").length],
    ["待查联盟", latest.summary?.affiliateQueueCount ?? 0]
  ].map(([label, value]) => `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");
}

function renderReadiness() {
  const latest = state.latest;
  if (!latest) {
    $("#readiness").innerHTML = "";
    return;
  }
  const stats = freshnessStats(latest.tools ?? []);
  const report = latest.freshnessReport;
  const sourceText = latest.source?.usedFallback ? "本地 fallback sample" : "Product Hunt live feed";
  const refreshText = formatDateTime(latest.generatedAt);
  const ageMinutes = dataAgeMinutes(latest.generatedAt);
  const isOldData = ageMinutes !== null && ageMinutes > 360;
  const apiReady = stats.apiReady;
  const confidenceKind = latest.source?.usedFallback ? "bad" : isOldData ? "warn" : apiReady ? "good" : "warn";
  const confidenceText = latest.source?.usedFallback
    ? "不要 API 发"
    : isOldData
      ? "先刷新再发"
      : apiReady
      ? "可谨慎发布"
      : "先别花 credits";
  $("#readiness").innerHTML = `<section class="panel readiness-panel ${confidenceKind}">
    <div class="readiness-head">
      <div>
        <p class="eyebrow">Publish confidence</p>
        <h2>发布前信心：${esc(confidenceText)}</h2>
        <p class="muted">刷新 ${esc(refreshText)} · ${esc(sourceText)} · ${latest.source?.usedFallback ? "样例数据" : "实时 feed"}</p>
      </div>
      <button class="button ghost" type="button" data-run-daily>${state.dailyRun.running ? "刷新中..." : "刷新 Live Feed"}</button>
    </div>
    <div class="readiness-stats">
      <div><strong>${esc(apiReady)}</strong><span>建议花 credits 发</span></div>
      <div><strong>${esc(stats.freshToday)}</strong><span>Fresh today</span></div>
      <div><strong>${esc(stats.fresh48)}</strong><span>Fresh 48h</span></div>
      <div><strong>${esc(stats.seen)}</strong><span>Seen before</span></div>
      <div><strong>${esc(stats.stale)}</strong><span>Older useful</span></div>
    </div>
    ${renderPublishGuard(latest, stats, ageMinutes)}
    ${renderRefreshPolicy(latest, stats, ageMinutes)}
    <p class="readiness-advice">${esc(readinessAdvice(latest, stats))}</p>
    ${renderFeedDiagnostic(report)}
    ${state.dailyRun.message ? `<p class="muted">${esc(state.dailyRun.message)}</p>` : ""}
  </section>`;
  updateRunDailyControls();
}

function renderPublishGuard(latest, stats, ageMinutes) {
  const stale = ageMinutes !== null && ageMinutes > 360;
  const ageKind = latest.source?.usedFallback ? "bad" : stale ? "warn" : "good";
  const sourceKind = latest.source?.usedFallback ? "bad" : "good";
  const ruleKind = stats.apiReady > 0 && !latest.source?.usedFallback && !stale ? "good" : "warn";
  const ageLabel = ageMinutes === null ? "数据年龄未知" : `数据年龄 ${formatDuration(ageMinutes)}`;
  const sourceLabel = latest.source?.usedFallback ? "Fallback sample" : "Live feed";
  const ruleLabel = stats.apiReady > 0 ? `只发 ${stats.apiReady} 条新鲜候选` : "今天先不 API 发";

  return `<div class="readiness-guardrails">
    <div class="${ageKind}">
      <span>刷新状态</span>
      <strong>${esc(ageLabel)}</strong>
      <small>${stale ? "超过 6 小时，发布前先刷新" : "6 小时内可参考"}</small>
    </div>
    <div class="${sourceKind}">
      <span>数据来源</span>
      <strong>${esc(sourceLabel)}</strong>
      <small>${latest.source?.usedFallback ? "只看格式，不要发布" : "来自 Product Hunt 当前 feed"}</small>
    </div>
    <div class="${ruleKind}">
      <span>发布规则</span>
      <strong>${esc(ruleLabel)}</strong>
      <small>Seen before / Older useful 只做观察或长文</small>
    </div>
  </div>`;
}

function renderRefreshPolicy(latest, stats, ageMinutes) {
  const stale = ageMinutes !== null && ageMinutes > 360;
  const freshnessText = latest.source?.usedFallback
    ? "Fallback 数据不发布"
    : stale
      ? "超过 6 小时，先刷新"
      : "6 小时内可参考";
  const publishText = stats.apiReady > 0 && !latest.source?.usedFallback && !stale
    ? `只花 credits 发 ${stats.apiReady} 条`
    : "今天先不花 API credits";
  return `<div class="refresh-policy">
    <div><span>刷新方式</span><strong>手动刷新</strong><small>点击刷新 Live Feed，或运行 npm run daily</small></div>
    <div><span>当前新鲜度</span><strong>${esc(freshnessText)}</strong><small>Product Hunt feed 不会自动轮询</small></div>
    <div><span>花钱发布</span><strong>${esc(publishText)}</strong><small>Fresh today / Fresh 48h 优先，Seen before 谨慎</small></div>
  </div>`;
}

function renderFeedDiagnostic(report) {
  if (!report) return "";
  const stats = report.stats ?? {};
  const breakdown = state.latest?.source?.breakdown ?? {};
  const watchlist = report.freshFeedWatchlist ?? [];
  return `<div class="feed-diagnostic">
    <div>
      <p class="eyebrow">Feed diagnostic</p>
      <strong>${esc(report.diagnosis)}</strong>
      <p class="muted">${esc(report.recommendation)}</p>
    </div>
    <div class="feed-stats">
      <span>Feed ${esc(stats.totalTools ?? 0)}</span>
      <span>PH ${esc(breakdown.productHuntTools ?? "-")}</span>
      <span>Inbox ${esc(breakdown.candidateInboxTools ?? 0)}</span>
      <span>Today ${esc(stats.freshToday ?? 0)}</span>
      <span>48h ${esc(stats.fresh48 ?? 0)}</span>
      <span>7d ${esc(stats.fresh7d ?? 0)}</span>
      <span>Fresh top picks ${esc(stats.topPickFreshPostCandidates ?? 0)}</span>
    </div>
    ${watchlist.length ? `<div class="feed-watchlist">
      <strong>Fresh feed watchlist</strong>
      ${watchlist.map((item) => `<div class="watch-item">
        <span>${esc(item.name)}</span>
        <span>${esc(formatAgeDays(item.ageDays))} · score ${esc(item.score)}${item.inTopPicks ? " · top pick" : ""}</span>
      </div>`).join("")}
    </div>` : ""}
  </div>`;
}

function renderActiveView() {
  $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === state.tab));
  $$(".view").forEach((view) => view.classList.remove("active"));
  $(`#view-${state.tab}`).classList.add("active");
  const renderers = { today: renderToday, review: renderFinalReviewQueue, candidates: renderCandidates, tools: renderTools, copy: renderCopyLibrary, feedback: renderFeedback, decisions: renderDecisions, queues: renderQueues, accounts: renderAccounts, affiliate: renderAffiliate, reviews: renderReviews, history: renderHistory, weekly: renderWeekly, settings: renderSettings };
  renderers[state.tab]();
}

function switchTab(tabName) {
  state.tab = tabName;
  syncTabUrl(tabName);
  renderActiveView();
}

function initialTab() {
  const queryTab = new URLSearchParams(window.location.search).get("tab");
  const hashTab = window.location.hash.replace(/^#/, "");
  const tabName = queryTab || hashTab;
  return tabNames.includes(tabName) ? tabName : "today";
}

function syncTabUrl(tabName) {
  if (!tabNames.includes(tabName)) return;
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tabName);
  url.hash = "";
  window.history.replaceState(null, "", url);
}

function filteredTools() {
  const entries = state.feedback.entries;
  const queuedIds = new Set(state.queues.items.map((item) => item.toolId));
  return [...(state.latest?.tools ?? [])]
    .filter((tool) => {
      const query = state.filters.search.toLowerCase();
      const matchesSearch = !query || `${tool.name} ${tool.tagline} ${tool.reason} ${tool.suggestedAngle}`.toLowerCase().includes(query);
      const matchesAction = state.filters.action === "all" || tool.followUpAction === state.filters.action;
      const matchesAffiliate = state.filters.affiliate === "all" || tool.affiliateStatus === state.filters.affiliate;
      const hasFeedback = entries.some((entry) => entry.toolId === tool.toolId && Number(entry.engagementScore ?? 0) > 0);
      const posted = entries.some((entry) => entry.toolId === tool.toolId);
      const stateMatch = state.filters.state === "all"
        || (state.filters.state === "posted" && posted)
        || (state.filters.state === "feedback" && hasFeedback)
        || (state.filters.state === "queued" && queuedIds.has(tool.toolId))
        || (state.filters.state === "fresh" && !tool.seenBefore)
        || (state.filters.state === "seen" && tool.seenBefore);
      return matchesSearch && matchesAction && matchesAffiliate && stateMatch && Number(tool.score) >= Number(state.filters.minScore || 0);
    })
    .sort((a, b) => sortValue(b, state.filters.sortBy) - sortValue(a, state.filters.sortBy));
}

function sortValue(tool, sortBy) {
  if (sortBy === "engagementScore") return feedbackFor(tool.toolId).engagementScore;
  if (sortBy === "bookmarks") return feedbackFor(tool.toolId).bookmarks;
  if (sortBy === "clicks") return feedbackFor(tool.toolId).clicks;
  if (sortBy === "riskScore") return tool.scoreBreakdown?.riskScore ?? 0;
  if (sortBy === "affiliateScore") return tool.scoreBreakdown?.affiliateScore ?? 0;
  return tool.score ?? 0;
}

function feedbackFor(toolId) {
  return state.feedback.entries.filter((entry) => entry.toolId === toolId).reduce((acc, entry) => {
    acc.entries += 1;
    acc.engagementScore += Number(entry.engagementScore ?? 0);
    for (const key of ["likes", "bookmarks", "replies", "reposts", "clicks", "profileVisits", "impressions"]) {
      acc[key] += Number(entry.metrics?.[key] ?? 0);
    }
    return acc;
  }, { entries: 0, engagementScore: 0, likes: 0, bookmarks: 0, replies: 0, reposts: 0, clicks: 0, profileVisits: 0, impressions: 0 });
}

function activeAccounts() {
  return state.latest?.accountStrategy?.accounts ?? [];
}

function accountById(accountId) {
  return activeAccounts().find((account) => account.id === accountId) ?? null;
}

function accountAuthById(accountId) {
  return (state.xStatus?.accounts ?? []).find((account) => account.accountId === accountId)?.authStatus ?? null;
}

function recommendedAccountId(tool) {
  return tool?.accountRecommendation?.primary?.accountId || activeAccounts()[0]?.id || "";
}

function accountSelectOptions(selectedId = "") {
  const accounts = activeAccounts();
  if (!accounts.length) return `<option value="">未配置账号</option>`;
  return accounts.map((account) => {
    const selected = account.id === selectedId ? " selected" : "";
    const auth = accountAuthById(account.id);
    const status = auth?.configured ? "已绑定" : "未绑定";
    return `<option value="${attr(account.id)}"${selected}>${esc(account.displayName)} · ${esc(account.category)} · ${status}</option>`;
  }).join("");
}

function accountLabel(accountId) {
  const account = accountById(accountId);
  return account?.displayName || accountId || "未选择账号";
}

function combinedPostRecords() {
  const records = [...(state.accountPosts.items ?? [])];
  for (const entry of state.feedback.entries ?? []) {
    if (entry.posted === false || !entry.accountId) continue;
    records.push({
      feedbackId: entry.id,
      accountId: entry.accountId,
      accountName: entry.accountName,
      toolId: entry.toolId,
      toolName: entry.toolName,
      variantType: entry.variantType,
      copyText: entry.copyText,
      postedUrl: entry.postedUrl,
      postedAt: entry.postedAt || entry.updatedAt || entry.createdAt
    });
  }
  return records;
}

function accountSafety(tool, copyText, accountId, excludeFeedbackId = "") {
  const account = accountById(accountId);
  const auth = accountAuthById(accountId);
  const policy = state.latest?.accountStrategy ?? {};
  const now = new Date();
  const posts = combinedPostRecords().filter((post) => post.feedbackId !== excludeFeedbackId);
  const checks = [];
  const blockReasons = [];
  const warnings = [];

  checks.push({
    label: "账号",
    value: account ? account.displayName : "未选择",
    ok: Boolean(account),
    block: !account
  });
  checks.push({
    label: "授权",
    value: auth?.configured ? "已绑定" : "未绑定",
    ok: Boolean(auth?.configured),
    block: true
  });

  const todayPosts = account ? posts.filter((post) => post.accountId === account.id && sameLocalDate(post.postedAt, now)).length : 0;
  checks.push({
    label: "今日账号限额",
    value: account ? `${todayPosts}/${account.dailyPostLimit}` : "-",
    ok: account ? todayPosts < Number(account.dailyPostLimit ?? 0) : false,
    block: true
  });

  const lastPost = account ? latestPostForAccount(posts, account.id) : null;
  const lastHours = lastPost ? hoursSince(lastPost.postedAt, now) : Number.POSITIVE_INFINITY;
  checks.push({
    label: "账号冷却",
    value: lastPost ? `${roundDisplay(lastHours)}h / ${account.cooldownHours}h` : "无近期发帖",
    ok: !lastPost || lastHours >= Number(account?.cooldownHours ?? 0),
    block: true
  });

  const toolCooldownDays = Number(policy.sameToolCooldownDays ?? 7);
  const sameTool = tool ? posts.find((post) => post.toolId === tool.toolId && daysSince(post.postedAt, now) < toolCooldownDays) : null;
  checks.push({
    label: "同工具冷却",
    value: sameTool ? `${sameTool.accountName || sameTool.accountId} 已发` : "无冲突",
    ok: !sameTool,
    block: true
  });

  const copyCooldownDays = Number(policy.sameCopyCooldownDays ?? 30);
  const normalizedCopy = normalizeCopy(copyText);
  const sameCopy = normalizedCopy ? posts.find((post) => normalizeCopy(post.copyText) === normalizedCopy && daysSince(post.postedAt, now) < copyCooldownDays) : null;
  checks.push({
    label: "同文案冷却",
    value: sameCopy ? `${sameCopy.accountName || sameCopy.accountId} 已用` : "无冲突",
    ok: !sameCopy,
    block: true
  });

  for (const check of checks) {
    if (check.ok) continue;
    const message = `${check.label}: ${check.value}`;
    if (check.block) blockReasons.push(message);
    else warnings.push(message);
  }

  return { account, auth, checks, blockReasons, warnings };
}

function renderAccountSafety(safety, compact = false) {
  return `<div class="account-safety-card ${safety.blockReasons.length ? "bad" : safety.warnings.length ? "warn" : "good"}">
    <div class="line-head">
      <strong>${esc(safety.account?.displayName || "选择账号")}</strong>
      ${pill(safety.blockReasons.length ? "Blocked" : safety.warnings.length ? "Review" : "OK", safety.blockReasons.length ? "bad" : safety.warnings.length ? "warn" : "good")}
    </div>
    <div class="check-list ${compact ? "compact" : ""}">
      ${safety.checks.map((item) => `<div class="check-row ${item.ok ? "ok" : "warn"}"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong></div>`).join("")}
    </div>
    ${safety.blockReasons.length ? `<ul class="publish-reasons">${safety.blockReasons.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

function latestPostForAccount(posts, accountId) {
  return posts
    .filter((post) => post.accountId === accountId)
    .sort((a, b) => new Date(b.postedAt || 0).getTime() - new Date(a.postedAt || 0).getTime())[0] ?? null;
}

function sameLocalDate(value, now) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toLocaleDateString("en-CA") === now.toLocaleDateString("en-CA");
}

function daysSince(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - date.getTime()) / 86400000);
}

function hoursSince(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - date.getTime()) / 3600000);
}

function normalizeCopy(value) {
  return String(value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function pendingFeedbackEntries() {
  return [...(state.feedback.entries ?? [])]
    .filter((entry) => entry.posted !== false && !hasRecordedMetrics(entry))
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

function hasRecordedMetrics(entry) {
  const metrics = entry.metrics ?? {};
  return ["impressions", "likes", "bookmarks", "replies", "reposts", "clicks", "profileVisits"]
    .some((key) => Number(metrics[key] ?? 0) > 0);
}

function renderToday() {
  $("#view-today").innerHTML = `${renderDailyChecklistPanel()}
  ${renderFocusPanel()}
  ${renderFeedbackFollowUpPanel()}
  ${renderFeedbackOpsPanel(state.feedbackOps ?? state.latest?.feedbackOps, "today")}
  ${renderQueuePipelinePanel("today")}
  <div class="grid">
    <section class="panel"><h2>今天最该做</h2><div class="list">${(state.latest?.actionList ?? []).map(renderAction).join("") || empty("暂无今日行动。")}</div></section>
    <section class="panel"><h2>系统建议</h2><div class="list">${(state.weekly?.suggestions ?? []).slice(0, 6).map((item) => `<div class="list-item"><strong>${esc(item.toolName)}</strong><div class="muted">${esc(labels[item.suggestion] ?? item.suggestion)} · ${esc(item.reason)}</div></div>`).join("") || empty("暂无建议。")}</div></section>
  </div>`;
}

function renderDailyChecklistPanel() {
  const latest = state.latest ?? {};
  const ageMinutes = dataAgeMinutes(latest.generatedAt);
  const pending = pendingFeedbackEntries();
  const candidates = finalReviewCandidates();
  const affiliateQueue = latest.affiliateResearchQueue ?? [];
  const stale = ageMinutes === null || ageMinutes > 360 || latest.source?.usedFallback;
  const items = [
    {
      done: !stale,
      title: stale ? "刷新今天数据" : "数据可用",
      detail: stale ? "先点刷新 Live Feed。超过 6 小时或 fallback 数据不建议花 API credits 发。" : `${formatDuration(ageMinutes)}前生成，可以进入发布审核。`,
      action: `<button class="button ghost" data-run-daily>${stale ? "刷新 Live Feed" : "重新刷新"}</button>`
    },
    {
      done: candidates.length > 0,
      title: candidates.length ? `审核 ${candidates.length} 条可发候选` : "没有安全发布候选",
      detail: candidates.length ? "去发布前最终审核队列，最多选 3 条，每条手动确认。" : "今天先研究 affiliate / 长文，不要硬发旧工具。",
      action: `<button class="button ghost" data-tab-jump="review">打开发布审核</button>`
    },
    {
      done: pending.length === 0,
      title: pending.length ? `补 ${pending.length} 条发推反馈` : "没有待补反馈",
      detail: pending.length ? "把 X Analytics 的 impressions、likes、bookmarks、clicks 粘进反馈页。" : "发完后记得点标记已发，下一轮再补数据。",
      action: `<button class="button ghost" data-tab-jump="feedback">打开反馈录入</button>`
    },
    {
      done: affiliateQueue.length === 0,
      title: affiliateQueue.length ? `查 ${Math.min(affiliateQueue.length, 3)} 个联盟项目` : "联盟研究队列清爽",
      detail: affiliateQueue.length ? "只查真实 official affiliate / partner / referral program，不要填假链接。" : "有互动的工具再加入 affiliate research。",
      action: `<button class="button ghost" data-tab-jump="affiliate">打开联盟研究</button>`
    }
  ];
  const ready = items.every((item) => item.done);

  return `<section class="panel daily-checklist">
    <div class="line-head">
      <div>
        <p class="eyebrow">Start here</p>
        <h2>今天打开后先看这里</h2>
        <p class="muted">按这 4 步走：刷新、审核、补反馈、查联盟。不要被整个控制台拖散。</p>
      </div>
      ${pill(ready ? "Ready" : "Needs action", ready ? "good" : "warn")}
    </div>
    <div class="checklist-grid">${items.map(renderChecklistItem).join("")}</div>
  </section>`;
}

function renderChecklistItem(item) {
  return `<article class="checklist-item ${item.done ? "done" : "todo"}">
    <div class="check-dot">${item.done ? "✓" : "!"}</div>
    <div>
      <strong>${esc(item.title)}</strong>
      <p>${esc(item.detail)}</p>
      <div class="row-actions">${item.action}</div>
    </div>
  </article>`;
}

function renderFeedbackFollowUpPanel() {
  const pending = pendingFeedbackEntries();
  const recent = pending.slice(0, 4);
  return `<section class="panel feedback-followup ${pending.length ? "warn" : "good"}">
    <div class="line-head">
      <div>
        <p class="eyebrow">Feedback loop</p>
        <h2>${pending.length ? `待补反馈 ${pending.length} 条` : "反馈闭环正常"}</h2>
      </div>
      ${pill(pending.length ? "Need metrics" : "Clean", pending.length ? "warn" : "good")}
    </div>
    <p class="muted">${pending.length ? "这些内容已经标记已发，但还没有 impressions / likes / bookmarks / clicks。补完数据后，系统才能判断该做 thread、SEO 测评页还是联盟研究。" : "当前没有已发但缺数据的文案。继续发少量新鲜候选，然后记得回填表现。"}</p>
    ${recent.length ? `<div class="list">${recent.map(renderPendingFeedbackItem).join("")}</div>` : ""}
  </section>`;
}

function renderPendingFeedbackItem(entry) {
  return `<div class="list-item">
    <div class="line-head">
      <strong>${esc(entry.toolName)} · ${esc(labels[entry.variantType] ?? entry.variantType)}</strong>
      ${pill("metrics 0", "warn")}
    </div>
    <div class="muted">账号：${esc(entry.accountName || accountLabel(entry.accountId))}</div>
    <p class="muted">${esc(entry.copyText || "No copy text saved.")}</p>
    <div class="row-actions">
      <button class="button ghost" data-edit-feedback="${attr(entry.id)}">录入反馈</button>
      ${entry.postedUrl ? `<a class="button ghost" href="${attr(entry.postedUrl)}" target="_blank" rel="noreferrer">打开 X</a>` : ""}
    </div>
  </div>`;
}

function renderFeedbackOpsPanel(ops, scope = "full") {
  if (!ops) return "";
  const compact = scope === "today";
  const actions = (ops.actionList ?? []).slice(0, compact ? 3 : 5);
  const accounts = (ops.accountStats ?? []).filter((item) => item.posts || item.measured || item.pending).slice(0, compact ? 4 : 8);
  const angles = (ops.angleStats ?? []).slice(0, compact ? 4 : 8);
  const sources = (ops.sourceStats ?? []).slice(0, compact ? 3 : 6);
  const debtGate = ops.debtGate;
  return `<section class="panel">
    <div class="line-head">
      <div>
        <p class="eyebrow">Feedback operating mode</p>
        <h2>反馈学习闭环</h2>
        <p class="muted">按账号、文案角度和来源看真实反馈。没补 metrics 时，这里会很诚实地显示学习能力不足。</p>
      </div>
      ${pill(`learning ${ops.summary?.learningScore ?? 0}/100`, Number(ops.summary?.learningScore ?? 0) >= 60 ? "good" : "warn")}
    </div>
    ${renderFeedbackDebtGateCard(debtGate)}
    <div class="pipeline-stats">
      <div><strong>${esc(ops.summary?.measured ?? 0)}/${esc(ops.summary?.posted ?? 0)}</strong><span>measured</span></div>
      <div><strong>${esc(ops.summary?.pending ?? 0)}</strong><span>pending</span></div>
      <div><strong>${esc(ops.summary?.measuredAccounts ?? 0)}/${esc(ops.summary?.activeAccounts ?? 0)}</strong><span>accounts</span></div>
      <div><strong>${esc(debtGate?.maxNewPostsBeforeMetrics ?? ops.summary?.maxNewPostsBeforeMetrics ?? 0)}</strong><span>safe next posts</span></div>
    </div>
    <div class="grid">
      <div class="list">
        <strong>下一步</strong>
        ${actions.map((item) => `<div class="list-item"><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p></div>`).join("") || empty("暂无反馈动作。")}
      </div>
      <div class="list">
        <strong>账号表现</strong>
        ${accounts.map((item) => `<div class="list-item"><strong>${esc(item.displayName)}</strong><div class="muted">measured ${esc(item.measured)}/${esc(item.posts)} · pending ${esc(item.pending)} · score ${esc(item.engagementScore)} · click ${esc(item.clicks)} · top ${esc((labels[item.topVariant] ?? item.topVariant) || "none")}</div></div>`).join("") || empty("暂无账号反馈。")}
      </div>
      ${compact ? "" : `<div class="list">
        <strong>角度表现</strong>
        ${angles.map((item) => `<div class="list-item"><strong>${esc(labels[item.variantType] ?? item.variantType)}</strong><div class="muted">score ${esc(item.engagementScore)} · avg ${esc(item.averageScore)} · posts ${esc(item.posts)} · clicks ${esc(item.clicks)} · bookmarks ${esc(item.bookmarks)}</div></div>`).join("") || empty("暂无 angle 数据。")}
      </div>
      <div class="list">
        <strong>来源表现</strong>
        ${sources.map((item) => `<div class="list-item"><strong>${esc(item.sourceName)}</strong><div class="muted">score ${esc(item.engagementScore)} · avg ${esc(item.averageScore)} · posts ${esc(item.posts)} · best ${esc(item.bestTool?.toolName ?? "none")}</div></div>`).join("") || empty("暂无来源反馈。")}
      </div>`}
    </div>
    <div class="row-actions">
      <button class="button ghost" data-tab-jump="feedback">补反馈</button>
      <button class="button ghost" data-tab-jump="decisions">看反馈决策</button>
      <button class="button ghost" data-tab-jump="accounts">看账号策略</button>
    </div>
  </section>`;
}

function renderFeedbackDebtGateCard(gate) {
  if (!gate) return "";
  const severity = gate.severity === "good" ? "good" : gate.severity === "bad" ? "bad" : "warn";
  return `<div class="feedback-debt-gate ${severity}">
    <div class="line-head">
      <strong>${esc(gate.title)}</strong>
      ${pill(gate.status, severity)}
    </div>
    <p class="muted">${esc(gate.headline)}</p>
    <div class="pipeline-stats">
      <div><strong>${esc(gate.maxNewPostsBeforeMetrics ?? 0)}</strong><span>max new posts</span></div>
      <div><strong>${esc(gate.pendingLimit ?? 0)}</strong><span>pending limit</span></div>
      <div><strong>${esc(formatRate(gate.measuredRate ?? 0))}</strong><span>measured rate</span></div>
      <div><strong>${esc(gate.oldestPendingHours ?? 0)}h</strong><span>oldest pending</span></div>
    </div>
    <div class="list mini-list">
      ${(gate.nextActions ?? []).map((item) => `<div class="list-item">${esc(item)}</div>`).join("")}
    </div>
  </div>`;
}

function activeQueueItems() {
  return (state.queues.items ?? []).filter((item) => !["published", "skipped", "archived"].includes(item.status));
}

function queuePipelineSummary() {
  const active = activeQueueItems();
  const byType = {};
  for (const item of active) byType[item.type] = (byType[item.type] ?? 0) + 1;
  const next = [...active].sort((a, b) => Number(b.priorityScore ?? 0) - Number(a.priorityScore ?? 0) || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")))[0] ?? null;
  return { active, byType, next };
}

function renderQueuePipelinePanel(scope = "full") {
  const summary = queuePipelineSummary();
  const next = summary.next;
  const compact = scope === "today";
  return `<section class="panel queue-pipeline ${summary.active.length ? "warn" : "good"}">
    <div class="line-head">
      <div>
        <p class="eyebrow">Follow-up pipeline</p>
        <h2>${summary.active.length ? `活跃跟进 ${summary.active.length} 项` : "跟进队列为空"}</h2>
      </div>
      ${pill(summary.active.length ? "Active" : "Clean", summary.active.length ? "warn" : "good")}
    </div>
    <div class="pipeline-stats">
      <div><strong>${esc(summary.byType.affiliate_research ?? 0)}</strong><span>联盟研究</span></div>
      <div><strong>${esc(summary.byType.thread ?? 0)}</strong><span>长线程</span></div>
      <div><strong>${esc(summary.byType.review_page ?? 0)}</strong><span>测评页</span></div>
      <div><strong>${esc(summary.byType.watch ?? 0)}</strong><span>观察</span></div>
    </div>
    ${next ? `<div class="pipeline-next">
      <strong>下一步：${esc(next.toolName)}</strong>
      <p>${esc(queueNextStep(next))}</p>
      <div class="row-actions">
        ${queuePrimaryAction(next)}
        <button class="button ghost" data-tab-jump="queues">打开队列</button>
      </div>
    </div>` : `<p class="muted">${compact ? "还没有活跃队列。先从 Focus 面板、反馈决策或工具卡里加入一个联盟研究/长文/测评页候选。" : "暂无活跃跟进。等发推有反馈后，再把强信号工具加入队列。"}</p>`}
  </section>`;
}

function queueNextStep(item) {
  if (item.type === "affiliate_research") {
    if (item.status === "new") return "先查 official affiliate / partner / referral program，记录 programUrl 和真实 affiliate link。";
    if (item.status === "researching") return "把查到的 network、programUrl、申请状态写进联盟研究页。";
    return "确认状态是否还能推进，不能推进就标记 skipped 或 archived。";
  }
  if (item.type === "review_page") {
    if (item.status === "new") return "先生成测评页大纲，再补官方价格、限制、竞品和真实 affiliate 信息。";
    if (item.status === "drafted") return "检查大纲里的价格/联盟信息是否真实，再决定是否发布。";
    return "推进 SEO 测评页，或者根据反馈归档。";
  }
  if (item.type === "thread") {
    if (item.status === "new") return "先把 short post 扩成 5-7 条 thread opening，不要直接写成广告。";
    if (item.status === "drafted") return "检查 thread 是否仍然自然、具体、无夸张承诺。";
    return "根据反馈决定发布、重写或归档。";
  }
  if (item.type === "watch") return "继续观察，不要急着发；等新反馈或新版本出现再处理。";
  return "确认这个队列项是否还值得保留。";
}

function queuePrimaryAction(item) {
  if (item.type === "affiliate_research") {
    return `<button class="button ghost" data-affiliate="${attr(item.toolName)}" data-url="${attr(item.toolUrl)}" data-score="${attr(item.priorityScore)}">加入联盟研究</button>`;
  }
  if (item.type === "review_page") {
    return `<button class="button ghost" data-review="${attr(item.toolName)}">生成大纲</button>`;
  }
  if (item.type === "thread") {
    return `<button class="button ghost" data-tab-jump="copy">打开文案库</button>`;
  }
  return `<button class="button ghost" data-tab-jump="tools">打开工具池</button>`;
}

function renderFocusPanel() {
  const tasks = buildFocusTasks();
  return `<section class="panel focus-panel">
    <div class="focus-head">
      <div>
        <p class="eyebrow">Daily focus</p>
        <h2>今天只做这 3 件事</h2>
        <p class="muted">先按这里执行，再去工具池深挖。这样不会被 50 个候选拖散注意力。</p>
      </div>
      <div class="row-actions">
        ${pill(focusStatusText(tasks), focusStatusKind(tasks))}
        <button class="button ghost" type="button" data-tab-jump="review">打开发布审核</button>
      </div>
    </div>
    <div class="focus-grid">${tasks.map(renderFocusTask).join("")}</div>
  </section>`;
}

function buildFocusTasks() {
  const actions = state.latest?.actionList ?? [];
  const tools = state.latest?.tools ?? [];
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const postAction = actions.find((action) => action.type === "post");
  const waitAction = actions.find((action) => action.type === "wait");
  const affiliateAction = actions.find((action) => action.type === "research affiliate");
  const longformAction = actions.find((action) => action.type === "longform");
  const postTool = postAction ? byName.get(postAction.toolName) : null;
  const affiliateTool = affiliateAction ? byName.get(affiliateAction.toolName) : null;
  const longformTool = longformAction ? byName.get(longformAction.toolName) : null;
  const fallbackAffiliate = !affiliateTool ? (state.latest?.affiliateResearchQueue ?? [])[0] : null;
  const fallbackLongform = !longformTool ? tools.find((tool) => ["review page candidate", "thread candidate"].includes(tool.followUpAction)) : null;
  const tasks = [];

  tasks.push({
    step: "1",
    kind: postTool ? "post" : "wait",
    title: postTool ? `发 1 条新鲜 X：${postTool.name}` : "今天先别花 credits 发",
    detail: postTool ? postAction.reason : waitAction?.reason || readinessAdvice(state.latest ?? {}, freshnessStats(tools)),
    tool: postTool,
    action: postAction,
    cta: postTool ? "发布前确认" : "刷新 Live Feed"
  });

  tasks.push({
    step: "2",
    kind: "affiliate",
    title: affiliateTool ? `查联盟：${affiliateTool.name}` : fallbackAffiliate ? `查联盟：${fallbackAffiliate.name}` : "补一个真实 affiliate link",
    detail: affiliateAction?.reason || (fallbackAffiliate ? `affiliateScore ${fallbackAffiliate.affiliateScore}，还没有真实联盟链接。` : "从待查联盟列表挑一个高分工具，确认 programUrl 和真实 affiliate link。"),
    tool: affiliateTool,
    fallback: fallbackAffiliate,
    cta: "加入联盟研究"
  });

  tasks.push({
    step: "3",
    kind: "longform",
    title: longformTool ? `留作长文：${longformTool.name}` : fallbackLongform ? `留作长文：${fallbackLongform.name}` : "复盘反馈，选一个长文候选",
    detail: longformAction?.reason || (fallbackLongform ? fallbackLongform.reason : "如果今天没有新鲜工具，就把已有反馈高的工具推进到 thread 或 SEO review page。"),
    tool: longformTool || fallbackLongform,
    action: longformAction,
    cta: "加入测评页队列"
  });

  return tasks;
}

function renderFocusTask(task) {
  const freshness = task.tool ? freshnessBadge(task.tool) : null;
  const actionType = task.kind === "longform" && task.tool?.followUpAction === "thread candidate" ? "thread" : "review_page";
  const copy = task.tool?.copyVariants?.shortPost ?? task.detail;
  return `<article class="focus-task ${task.kind}">
    <div class="focus-step">${esc(task.step)}</div>
    <div class="focus-content">
      <div class="line-head">
        <strong>${esc(task.title)}</strong>
        ${freshness ? pill(freshness.label, freshness.kind) : pill(task.kind === "wait" ? "Hold" : "Follow up", task.kind === "wait" ? "warn" : "good")}
      </div>
      <p>${esc(task.detail)}</p>
      <div class="row-actions">
        ${task.kind === "post" && task.tool ? `<button class="button publish" data-publish="${attr(task.tool.toolId)}" data-tool="${attr(task.tool.name)}" data-url="${attr(task.tool.url)}" data-copytext="${attr(copy)}" data-variant="shortPost">${esc(task.cta)}</button>` : ""}
        ${task.kind === "post" && task.tool ? `<button class="button ghost" data-copy="${attr(copy)}">复制文案</button>` : ""}
        ${task.kind === "wait" ? `<button class="button ghost" data-run-daily>刷新 Live Feed</button>` : ""}
        ${task.kind === "wait" ? `<button class="button ghost" data-tab-jump="affiliate">去做联盟研究</button>` : ""}
        ${task.kind === "affiliate" && task.tool ? `<button class="button ghost" data-queue="affiliate_research" data-tool-id="${attr(task.tool.toolId)}" data-tool="${attr(task.tool.name)}" data-url="${attr(task.tool.url)}">加入联盟研究</button>` : ""}
        ${task.kind === "affiliate" && task.fallback ? `<button class="button ghost" data-affiliate="${attr(task.fallback.name)}" data-url="${attr(task.fallback.url)}" data-score="${attr(task.fallback.affiliateScore)}">加入联盟研究</button>` : ""}
        ${task.kind === "affiliate" ? `<button class="button ghost" data-tab-jump="affiliate">打开联盟页</button>` : ""}
        ${task.kind === "longform" && task.tool ? `<button class="button ghost" data-queue="${attr(actionType)}" data-tool-id="${attr(task.tool.toolId)}" data-tool="${attr(task.tool.name)}" data-url="${attr(task.tool.url)}">${esc(task.cta)}</button>` : ""}
        ${task.kind === "longform" && task.tool ? `<button class="button ghost" data-review="${attr(task.tool.name)}">生成大纲</button>` : ""}
        ${task.kind === "longform" && !task.tool ? `<button class="button ghost" data-tab-jump="decisions">看反馈决策</button>` : ""}
      </div>
    </div>
  </article>`;
}

function renderFinalReviewQueue() {
  const candidates = finalReviewCandidates();
  const latest = state.latest ?? {};
  const ageMinutes = dataAgeMinutes(latest.generatedAt);
  const blocked = latest.source?.usedFallback || (ageMinutes !== null && ageMinutes > 360);
  $("#view-review").innerHTML = `<section class="panel final-review ${blocked ? "warn" : "good"}">
    <div class="line-head">
      <div>
        <p class="eyebrow">Final publish review</p>
        <h2>发布前最终审核队列</h2>
        <p class="muted">只集中看今天最值得发的 3 条。每条仍然必须打开确认弹窗，Dashboard 不会批量发布。</p>
      </div>
      ${pill(candidates.length ? `${candidates.length}/3 ready` : "No safe post", candidates.length ? "good" : "warn")}
    </div>
    ${blocked ? `<div class="safety-note">当前数据不是可付费发布状态：${latest.source?.usedFallback ? "Fallback sample" : "刷新超过 6 小时"}。先刷新 Live Feed，再花 API credits。</div>` : ""}
    <div class="final-review-grid">${candidates.map(renderFinalReviewCard).join("") || empty("没有符合 Fresh today / Fresh 48h 的发布候选。先刷新 Live Feed，或改做联盟研究和测评页。")}</div>
  </section>`;
}

function finalReviewCandidates() {
  const latest = state.latest ?? {};
  const ageMinutes = dataAgeMinutes(latest.generatedAt);
  if (latest.source?.usedFallback || (ageMinutes !== null && ageMinutes > 360)) return [];
  const postedIds = new Set((state.feedback.entries ?? [])
    .filter((entry) => entry.posted !== false)
    .map((entry) => entry.toolId)
    .filter(Boolean));
  return [...(latest.tools ?? [])]
    .map((tool) => {
      const text = tool.copyVariants?.shortPost ?? "";
      const qa = copyQuality(text);
      const freshness = freshnessBadge(tool);
      const readiness = buildPublishReadiness(tool, text, recommendedAccountId(tool));
      return { tool, text, qa, freshness, readiness, priority: finalReviewPriority(tool, qa) };
    })
    .filter((item) => item.freshness.kind === "fresh")
    .filter((item) => !postedIds.has(item.tool.toolId))
    .filter((item) => item.tool.followUpAction !== "skip")
    .filter((item) => Number(item.tool.scoreBreakdown?.riskScore ?? 0) < 8)
    .filter((item) => item.qa.kind !== "bad")
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);
}

function finalReviewPriority(tool, qa) {
  const score = Number(tool.score ?? 0);
  const affiliateScore = Number(tool.scoreBreakdown?.affiliateScore ?? 0);
  const contentScore = Number(tool.scoreBreakdown?.contentScore ?? 0);
  const riskScore = Number(tool.scoreBreakdown?.riskScore ?? 0);
  return score + affiliateScore * 2 + contentScore - riskScore * 2 - (qa.kind === "warn" ? 4 : 0);
}

function renderFinalReviewCard(item, index) {
  const tool = item.tool;
  const checks = item.readiness.checks.slice(0, 4);
  return `<article class="final-card ${item.readiness.kind}">
    <div class="line-head">
      <div>
        <strong>${esc(`${index + 1}. ${tool.name}`)}</strong>
        <div class="muted">score ${esc(tool.score)} · ${esc(labels[tool.followUpAction] ?? tool.followUpAction)}</div>
      </div>
      ${pill(item.freshness.label, item.freshness.kind)}
    </div>
    <p>${esc(tool.reason)}</p>
    ${renderAccountRoute(tool)}
    <div class="copy-qa">
      <span>${esc(item.qa.length)} chars</span>
      <span>${esc(item.qa.forbidden.length ? `禁用词 ${item.qa.forbidden.join(", ")}` : "无禁用词")}</span>
      <span>${esc(item.qa.risky.length ? `风险词 ${item.qa.risky.join(", ")}` : "无高风险承诺")}</span>
    </div>
    <pre class="copy-text">${esc(item.text)}</pre>
    <div class="mini-checks">${checks.map((check) => `<span class="${check.ok ? "ok" : "warn"}">${esc(check.label)}: ${esc(check.value)}</span>`).join("")}</div>
    ${item.readiness.blockReasons.length ? `<p class="muted">阻断：${esc(item.readiness.blockReasons.join(" "))}</p>` : ""}
    ${item.readiness.overrideReasons.length ? `<p class="muted">需确认：${esc(item.readiness.overrideReasons.join(" "))}</p>` : ""}
    <div class="row-actions">
      <button class="button publish" data-publish="${attr(tool.toolId)}" data-tool="${attr(tool.name)}" data-url="${attr(tool.url)}" data-copytext="${attr(item.text)}" data-variant="shortPost">打开发布确认</button>
      <button class="button ghost" data-copy="${attr(item.text)}">复制文案</button>
      <button class="button ghost" data-posted="${attr(tool.toolId)}" data-tool="${attr(tool.name)}" data-url="${attr(tool.url)}" data-copytext="${attr(item.text)}" data-variant="shortPost">标记已发</button>
      <button class="button ghost" data-feedback="${attr(tool.toolId)}" data-tool="${attr(tool.name)}" data-url="${attr(tool.url)}" data-copytext="${attr(item.text)}" data-variant="shortPost">录入反馈</button>
    </div>
  </article>`;
}

function focusStatusText(tasks) {
  return tasks.some((task) => task.kind === "post") ? "有新鲜发布候选" : "今天偏研究";
}

function focusStatusKind(tasks) {
  return tasks.some((task) => task.kind === "post") ? "good" : "warn";
}

function renderCandidates() {
  const active = state.candidateInbox.items.filter((item) => item.status === "active");
  const archived = state.candidateInbox.items.filter((item) => item.status !== "active");
  $("#view-candidates").innerHTML = `<div class="grid">
    <section class="panel">
      <h2>添加外部候选</h2>
      <p class="muted">从 X、newsletter、微信群、官网看到的新工具可以先放这里。保存后点「刷新 Live Feed」，它会和 Product Hunt 一起打分。</p>
      <form class="inline-form" id="candidateForm">
        <label>工具名 <input name="name" required placeholder="Tool name"></label>
        <label>URL <input name="url" required type="url" placeholder="https://..."></label>
        <label>一句话痛点 <input name="tagline" placeholder="What narrow problem does it solve?"></label>
        <label>来源 <input name="source" placeholder="X / newsletter / manual"></label>
        <label>来源链接 <input name="sourceUrl" type="url" placeholder="https://..."></label>
        <label>圈子 <select name="circle">${circleOptions()}</select></label>
        <label>类型 <select name="candidateType"><option value="product">product/tool</option><option value="topic">topic/signal</option></select></label>
        <label>发布时间 <input name="published" type="datetime-local" value="${attr(defaultCandidateDateTime())}"></label>
        <label class="wide">描述/备注 <textarea name="description" rows="3" placeholder="Who is it for, what pain, why it might convert?"></textarea></label>
        <label class="wide">内部备注 <textarea name="notes" rows="2" placeholder="Where you found it, why to watch it"></textarea></label>
        <button class="button" type="submit">保存候选</button>
      </form>
    </section>
    <section class="panel">
      <h2>批量粘贴导入</h2>
      <p class="muted">支持 CSV 表头：name,url,tagline,source；也支持一行一个：Tool name | https://... | narrow pain。</p>
      <form class="stack-form" id="candidatePasteForm">
        <label>默认来源 <input name="source" placeholder="X / newsletter / manual" value="paste"></label>
        <label>默认圈子 <select name="circle">${circleOptions()}</select></label>
        <label>默认类型 <select name="candidateType"><option value="product">product/tool</option><option value="topic">topic/signal</option></select></label>
        <label>导入策略 <select name="importMode"><option value="recommended" selected>只导入可导入项</option><option value="all">导入全部非重复项</option></select></label>
        <textarea name="text" rows="9" placeholder="Tool A | https://example.com | Fixes one narrow workflow&#10;Tool B | https://example.org | Better reporting for small teams"></textarea>
        <div class="row-actions">
          <button class="button ghost" type="button" data-preview-candidates="candidatePasteForm">预览评分</button>
          <button class="button" type="submit">批量导入候选</button>
        </div>
      </form>
      ${renderCandidatePreview()}
    </section>
    <section class="panel">
      <h2>Active 收集箱</h2>
      <p class="muted">${esc(active.length)} 个 active 候选会参与下一次 daily 评分。</p>
      <div class="list">${active.map(renderCandidateItem).join("") || empty("暂无 active 候选。")}</div>
    </section>
    <section class="panel">
      <h2>已归档</h2>
      <div class="list">${archived.slice(-10).reverse().map(renderCandidateItem).join("") || empty("暂无归档候选。")}</div>
    </section>
  </div>`;
}

function renderCandidatePreview() {
  const preview = state.candidatePreview;
  if (!preview) return "";
  const rows = preview.previews ?? [];
  return `<div class="preview-box">
    <div class="line-head"><strong>预评分结果</strong><span class="muted">${esc(preview.date ?? "")} · parsed ${esc(preview.parsed ?? rows.length)} · import ${esc(preview.summary?.importable ?? 0)} · review ${esc(preview.summary?.review ?? 0)} · skip ${esc(preview.summary?.skipped ?? 0)} · duplicate ${esc(preview.summary?.duplicates ?? 0)}</span></div>
    ${preview.errors?.length ? `<p class="muted">跳过：${esc(preview.errors.join(" "))}</p>` : ""}
    <div class="list">${rows.map((item) => `<div class="list-item">
      <div class="line-head"><strong>${esc(item.name)}</strong>${pill(candidateDecisionLabels[item.importDecision] ?? item.importDecision, item.importDecision === "import" ? "good" : item.importDecision === "review" ? "warn" : "bad")}${pill(labels[item.followUpAction] ?? item.followUpAction, item.followUpAction === "skip" ? "bad" : "good")}<strong class="mini-score">${esc(item.score)}</strong></div>
      <div class="muted">${esc(item.sourceName)} · ${esc(item.circle || "unknown circle")} · ${esc(item.candidateType || "product")} · ${esc(item.affiliateStatus)} · ${item.seenBefore ? "Seen before" : "New to history"} · ${esc(item.duplicateStatus || "new_candidate")}</div>
      <p class="muted">${esc(item.importReason || "")}</p>
      <p>${esc(item.reason)}</p>
      <div class="score-bars">${Object.entries(item.scoreBreakdown ?? {}).filter(([key]) => ["painScore","nicheScore","affiliateScore","contentScore","noveltyScore","riskScore"].includes(key)).map(([key, value]) => bar(key, value)).join("")}</div>
    </div>`).join("") || empty("暂无预览结果。")}</div>
  </div>`;
}

function circleOptions() {
  return [
    ["", "auto / unknown"],
    ["ai_startups", "AI startups"],
    ["indie_hackers", "Indie hackers"],
    ["saas_founders", "SaaS founders"],
    ["crypto_builders", "Crypto builders"]
  ].map(([value, label]) => `<option value="${attr(value)}">${esc(label)}</option>`).join("");
}

function renderCandidateItem(item) {
  return `<div class="list-item">
    <div class="line-head"><strong>${esc(item.name)}</strong>${pill(item.status, item.status === "active" ? "good" : "stale")}</div>
    <div class="muted">${esc(item.source || "manual")} · ${esc(item.circle || "unknown circle")} · ${esc(item.candidateType || "product")} · ${esc(formatCandidatePublished(item.published))}</div>
    <p>${esc(item.tagline || item.description || item.notes || "")}</p>
    <div class="row-actions">
      <a class="button ghost" href="${attr(item.url)}" target="_blank" rel="noreferrer">打开</a>
      ${item.sourceUrl ? `<a class="button ghost" href="${attr(item.sourceUrl)}" target="_blank" rel="noreferrer">来源</a>` : ""}
      ${item.status === "active"
        ? `<button class="button ghost" data-candidate-status="${attr(item.id)}" data-status="archived">归档</button>`
        : `<button class="button ghost" data-candidate-status="${attr(item.id)}" data-status="active">重新激活</button>`}
    </div>
  </div>`;
}

function renderAction(action) {
  const tool = (state.latest?.tools ?? []).find((item) => item.name === action.toolName);
  const copy = tool?.copyVariants?.shortPost ?? action.reason;
  const freshness = tool ? freshnessBadge(tool) : null;
  const canPublish = action.type === "post" && tool;
  const canQueueThread = action.type === "post" || action.type === "longform";
  return `<div class="list-item">
    <div class="line-head">
      <strong>${esc(actionLabel(action.type))}: ${esc(action.toolName)}</strong>
      ${freshness ? pill(freshness.label, freshness.kind) : ""}
    </div>
    <p class="muted">${esc(action.reason)}</p>
    <div class="row-actions">
      ${canPublish ? `<button class="button ghost" data-copy="${attr(copy)}">复制相关文案</button>` : ""}
      ${canPublish ? `<button class="button publish" data-publish="${attr(tool.toolId)}" data-tool="${attr(tool.name)}" data-url="${attr(tool.url)}" data-copytext="${attr(copy)}" data-variant="shortPost">发布到 X</button>` : ""}
      ${canPublish ? `<button class="button ghost" data-posted="${attr(tool.toolId)}" data-tool="${attr(tool.name)}" data-url="${attr(tool.url)}" data-copytext="${attr(copy)}" data-variant="shortPost">标记已发</button>` : ""}
      ${canQueueThread && tool ? `<button class="button ghost" data-queue="thread" data-tool-id="${attr(tool.toolId)}" data-tool="${attr(tool.name)}" data-url="${attr(tool.url)}">加入长推队列</button>` : ""}
    </div>
  </div>`;
}

function renderTools() {
  const tools = filteredTools();
  $("#view-tools").innerHTML = `<div class="grid">${tools.map(renderToolCard).join("") || empty("没有匹配工具。")}</div>`;
}

function renderCopyLibrary() {
  const blocks = filteredTools().flatMap((tool) => Object.entries(tool.copyVariants ?? {}).map(([variant, text]) => renderCopyBlock(tool, variant, text)));
  $("#view-copy").innerHTML = `<section class="panel"><h2>文案库</h2><div class="list">${blocks.join("") || empty("暂无文案。")}</div></section>`;
}

function renderToolCard(tool) {
  const stats = feedbackFor(tool.toolId);
  const queued = state.queues.items.filter((item) => item.toolId === tool.toolId);
  const freshness = freshnessBadge(tool);
  const account = tool.accountRecommendation?.primary;
  return `<article class="tool-card">
    <div class="card-head"><div><div class="title-row"><h2>${esc(tool.name)}</h2>${pill(freshness.label, freshness.kind)}</div><p class="muted">${esc(tool.tagline || "")}</p></div><strong class="score">${esc(tool.score)}</strong></div>
    <div class="pill-row">
      ${pill(labels[tool.followUpAction] ?? tool.followUpAction, "good")}
      ${account ? pill(`账号 ${account.displayName}`, "good") : pill("未分配账号", "warn")}
      ${pill(tool.affiliateLink ? "已有联盟链接" : "需要查联盟", tool.affiliateLink ? "good" : "warn")}
      ${tool.seenBefore ? pill("历史出现过", "warn") : pill("新工具", "good")}
      ${stats.entries ? pill(`已发 ${stats.entries}`, "good") : ""}
      ${queued.length ? pill(`队列 ${queued.length}`, "warn") : ""}
    </div>
    <p>${esc(tool.reason)}</p>
    ${renderAccountRoute(tool)}
    <p class="muted">反馈：score ${stats.engagementScore} · like ${stats.likes} · bookmark ${stats.bookmarks} · reply ${stats.replies} · click ${stats.clicks}</p>
    <div class="score-bars">${Object.entries(tool.scoreBreakdown).filter(([key]) => ["painScore","nicheScore","affiliateScore","contentScore","noveltyScore","riskScore"].includes(key)).map(([key, value]) => bar(key, value)).join("")}</div>
    <div class="copy-block">${Object.entries(tool.copyVariants ?? {}).slice(0, 2).map(([variant, text]) => renderCopyBlock(tool, variant, text)).join("")}</div>
    <div class="row-actions">
      <a class="button ghost" href="${attr(tool.url)}" target="_blank" rel="noreferrer">Product Hunt</a>
      <button class="button ghost" data-queue="affiliate_research" data-tool-id="${attr(tool.toolId)}" data-tool="${attr(tool.name)}" data-url="${attr(tool.url)}">加入联盟研究</button>
      <button class="button ghost" data-queue="review_page" data-tool-id="${attr(tool.toolId)}" data-tool="${attr(tool.name)}" data-url="${attr(tool.url)}">加入测评页队列</button>
      <button class="button ghost" data-review="${attr(tool.name)}">生成大纲</button>
    </div>
  </article>`;
}

function renderCopyBlock(tool, variant, text) {
  const freshness = freshnessBadge(tool);
  const qa = copyQuality(text);
  const account = tool.accountRecommendation?.primary;
  return `<div class="copy-block">
    <div class="line-head">
      <strong>${esc(tool.name)} · ${esc(labels[variant] ?? variant)}</strong>
      ${pill(freshness.label, freshness.kind)}
      ${pill(qa.label, qa.kind)}
      ${account ? pill(account.displayName, "good") : ""}
    </div>
    ${renderAccountRoute(tool)}
    <div class="copy-qa">
      <span>${esc(qa.length)} chars</span>
      <span>${esc(qa.forbidden.length ? `禁用词 ${qa.forbidden.join(", ")}` : "无禁用词")}</span>
      <span>${esc(qa.risky.length ? `风险词 ${qa.risky.join(", ")}` : "无高风险承诺")}</span>
    </div>
    <pre class="copy-text">${esc(text)}</pre>
    <div class="copy-actions">
      <button class="button ghost" data-copy="${attr(text)}">Copy</button>
      <button class="button publish" data-publish="${attr(tool.toolId)}" data-tool="${attr(tool.name)}" data-url="${attr(tool.url)}" data-copytext="${attr(text)}" data-variant="${attr(variant)}">发布到 X</button>
      <button class="button ghost" data-posted="${attr(tool.toolId)}" data-tool="${attr(tool.name)}" data-url="${attr(tool.url)}" data-copytext="${attr(text)}" data-variant="${attr(variant)}">标记已发</button>
      <button class="button ghost" data-feedback="${attr(tool.toolId)}" data-tool="${attr(tool.name)}" data-url="${attr(tool.url)}" data-copytext="${attr(text)}" data-variant="${attr(variant)}">录入反馈</button>
      <button class="button ghost" data-queue="thread" data-tool-id="${attr(tool.toolId)}" data-tool="${attr(tool.name)}" data-url="${attr(tool.url)}">加入长推</button>
      <button class="button ghost" data-queue="review_page" data-tool-id="${attr(tool.toolId)}" data-tool="${attr(tool.name)}" data-url="${attr(tool.url)}">加入测评页</button>
    </div>
  </div>`;
}

function renderAccountRoute(tool) {
  const route = tool.accountRecommendation;
  const primary = route?.primary;
  if (!primary) return `<p class="muted">推荐账号：未配置。先到「账号策略」检查账号分类。</p>`;
  const alternatives = (route.alternatives ?? []).map((item) => item.displayName).join(" / ");
  return `<div class="account-route">
    <strong>推荐账号：${esc(primary.displayName)}</strong>
    <span>${esc(primary.category)} · match ${esc(primary.score)} · limit ${esc(primary.dailyPostLimit)}/day · cooldown ${esc(primary.cooldownHours)}h</span>
    <span>${esc(route.reason || "")}${alternatives ? ` 备选：${esc(alternatives)}` : ""}</span>
  </div>`;
}

function renderFeedback() {
  const rows = [...state.feedback.entries].sort((a, b) => Number(b.engagementScore ?? 0) - Number(a.engagementScore ?? 0));
  $("#view-feedback").innerHTML = `${renderFeedbackOpsPanel(state.feedbackOps ?? state.latest?.feedbackOps, "full")}
  <div class="grid">
    <section class="panel"><h2>待补反馈</h2><p class="muted">发完以后，先把这块清零。没有真实反馈，后面的决策报告会变钝。X Analytics 一般等几个小时或第二天再补。</p><div class="list">${pendingFeedbackEntries().map(renderPendingFeedbackItem).join("") || empty("没有待补反馈。")}</div></section>
    <section class="panel"><h2>CSV / X Analytics 粘贴导入</h2>
      <p class="muted">支持 CSV，也支持从 X Analytics 表格直接复制出来的 tab 分隔数据。推荐先点预览；不会自动保存。</p>
      <form class="stack-form" id="feedbackCsvForm">
        <textarea name="csv" rows="8" placeholder="toolName,variantType,postedUrl,impressions,likes,bookmarks,replies,reposts,clicks,profileVisits,notes&#10;Mailwarm 2.0,shortPost,https://x.com/you/status/123,1200,18,6,3,1,9,4,first test&#10;&#10;或直接粘贴 X Analytics 表格：&#10;Post text&#9;Tweet permalink&#9;Impressions&#9;Likes&#9;Bookmarks&#9;Replies&#9;Reposts&#9;Link clicks&#10;Your posted copy...&#9;https://x.com/you/status/123&#9;1200&#9;18&#9;6&#9;3&#9;1&#9;9"></textarea>
        <div class="row-actions">
          <button class="button ghost" type="button" data-preview-feedback="feedbackCsvForm">预览导入</button>
          <button class="button" type="submit">确认导入反馈</button>
        </div>
      </form>
      ${renderFeedbackPreview()}
    </section>
    <section class="panel"><h2>反馈录入</h2><p class="muted">还没有 feedback 时，先在今日文案里点击「标记已发」，或直接用左侧 CSV 导入。</p><div class="list">${rows.map((entry) => `<div class="list-item"><strong>${esc(entry.toolName)} · ${esc(labels[entry.variantType] ?? entry.variantType)}</strong><div class="muted">账号 ${esc(entry.accountName || accountLabel(entry.accountId))} · engagement ${esc(entry.engagementScore ?? 0)} · likes ${esc(entry.metrics.likes)} · bookmarks ${esc(entry.metrics.bookmarks)} · replies ${esc(entry.metrics.replies)} · clicks ${esc(entry.metrics.clicks)}</div><div class="row-actions"><button class="button ghost" data-edit-feedback="${attr(entry.id)}">录入反馈</button></div></div>`).join("") || empty("还没有发推反馈。先在今日文案里点击「标记已发」。")}</div></section>
  </div>`;
}

function renderFeedbackPreview() {
  const preview = state.feedbackPreview;
  if (!preview) return "";
  const rows = preview.previews ?? [];
  return `<div class="preview-box">
    <div class="line-head"><strong>反馈预览</strong><span class="muted">valid ${esc(preview.count ?? rows.length)}</span></div>
    ${preview.errors?.length ? `<p class="muted">跳过：${esc(preview.errors.join(" "))}</p>` : ""}
    <div class="list">${rows.map((entry) => `<div class="list-item">
      <div class="line-head"><strong>${esc(entry.toolName)} · ${esc(labels[entry.variantType] ?? entry.variantType)}</strong><strong class="mini-score">${esc(entry.engagementScore ?? 0)}</strong></div>
      <div class="muted">账号 ${esc(entry.accountName || accountLabel(entry.accountId))} · impressions ${esc(entry.metrics?.impressions ?? 0)} · likes ${esc(entry.metrics?.likes ?? 0)} · bookmarks ${esc(entry.metrics?.bookmarks ?? 0)} · replies ${esc(entry.metrics?.replies ?? 0)} · clicks ${esc(entry.metrics?.clicks ?? 0)}</div>
      <div class="muted">engagement rate ${esc(formatRate(entry.engagementRate))} · click rate ${esc(formatRate(entry.clickRate))}</div>
      ${entry.postedUrl ? `<a class="muted-link" href="${attr(entry.postedUrl)}" target="_blank" rel="noreferrer">打开 X 链接</a>` : ""}
      <p>${esc(entry.copyText || "")}</p>
    </div>`).join("") || empty("暂无可导入反馈。")}</div>
  </div>`;
}

function renderDecisions() {
  const recommendations = state.decisions?.recommendations ?? [];
  const summary = state.decisions?.summary ?? {};
  $("#view-decisions").innerHTML = `<div class="grid">
    <section class="panel"><h2>反馈决策摘要</h2><div class="list">
      <div class="list-item">反馈记录: ${esc(summary.feedbackEntries ?? 0)}</div>
      <div class="list-item">有反馈工具: ${esc(summary.toolsWithFeedback ?? 0)}</div>
      <div class="list-item">建议动作: ${esc(summary.recommendations ?? 0)}</div>
      <div class="list-item">赢家信号: ${esc(summary.winners ?? 0)}</div>
      <div class="list-item">弱信号: ${esc(summary.weakSignals ?? 0)}</div>
      <div class="list-item">最佳 angle: ${esc(labels[summary.topAngle] ?? summary.topAngle ?? "暂无")}</div>
    </div></section>
    <section class="panel"><h2>Top angle</h2><div class="chart-list">${(state.decisions?.angleScores ?? []).map(renderDecisionAngle).join("") || empty("暂无 angle 反馈。")}</div></section>
    <section class="panel"><h2>推荐动作</h2><div class="list">${recommendations.map(renderDecisionCard).join("") || empty("还没有足够反馈。先在「反馈录入」导入 CSV，或给已发文案录入数据。")}</div></section>
    <section class="panel"><h2>弱信号</h2><div class="list">${(state.decisions?.weakSignals ?? []).map(renderDecisionCard).join("") || empty("暂无需要暂停的工具。")}</div></section>
  </div>`;
}

function renderDecisionCard(item) {
  return `<div class="list-item">
    <strong>${esc(item.toolName)} · ${esc(decisionLabel(item.decision))}</strong>
    <div class="muted">建议加入 ${esc(labels[item.queueType] ?? item.queueType)} · priority ${esc(item.priorityScore)} · ${item.alreadyQueued ? "已在队列" : "未入队"}</div>
    <p>${esc(item.reason)}</p>
    <div class="muted">score ${esc(item.evidence.engagementScore)} · bookmark ${esc(item.evidence.bookmarks)} · reply ${esc(item.evidence.replies)} · click ${esc(item.evidence.clicks)} · angle ${esc(labels[item.suggestedAngle] ?? item.suggestedAngle)}</div>
    <div class="row-actions">
      <button class="button ghost" data-queue="${attr(item.queueType)}" data-tool-id="${attr(item.toolId)}" data-tool="${attr(item.toolName)}" data-url="${attr(item.toolUrl)}" data-priority="${attr(item.priorityScore)}" data-reason="${attr(item.reason)}">${item.alreadyQueued ? "再次更新队列" : "加入队列"}</button>
    </div>
  </div>`;
}

function renderDecisionAngle(item) {
  const maxValue = Math.max(1, ...(state.decisions?.angleScores ?? []).map((angle) => Number(angle.engagementScore || 0)));
  const width = Math.round((Number(item.engagementScore || 0) / maxValue) * 100);
  return `<div class="chart-row">
    <div><strong>${esc(labels[item.variantType] ?? item.variantType)}</strong><div class="muted">score ${esc(item.engagementScore)} · entries ${esc(item.entries)} · bookmarks ${esc(item.bookmarks)} · clicks ${esc(item.clicks)}</div></div>
    <div class="chart-track"><div class="chart-fill accent" style="width:${width}%"></div></div>
  </div>`;
}

function renderQueues() {
  const groups = ["affiliate_research", "thread", "review_page", "watch", "skip"];
  $("#view-queues").innerHTML = `${renderPromotionReviewPanel(state.latest?.promotionReview)}
  ${renderQueuePipelinePanel("full")}
  <div class="three-grid">${groups.map((type) => `<section class="panel"><h2>${esc(labels[type] ?? type)}</h2><div class="list">${state.queues.items.filter((item) => item.type === type).map(renderQueueItem).join("") || empty("暂无。")}</div></section>`).join("")}</div>`;
}

function renderPromotionReviewPanel(review) {
  if (!review) return "";
  const items = review.items ?? [];
  return `<section class="panel wide-panel">
    <div class="line-head">
      <div>
        <p class="eyebrow">Promotion review</p>
        <h2>推广审核清单</h2>
        <p class="muted">${esc(review.rule)}</p>
      </div>
      ${pill(`${review.summary?.readyToQueue ?? 0} ready`, Number(review.summary?.readyToQueue ?? 0) ? "good" : "warn")}
    </div>
    <div class="pipeline-stats">
      <div><strong>${esc(review.summary?.totalItems ?? 0)}</strong><span>items</span></div>
      <div><strong>${esc(review.summary?.readyToQueue ?? 0)}</strong><span>ready</span></div>
      <div><strong>${esc(review.summary?.alreadyQueued ?? 0)}</strong><span>queued</span></div>
      <div><strong>${esc(review.summary?.needsFeedback ?? 0)}</strong><span>needs feedback</span></div>
    </div>
    <div class="list">${items.slice(0, 10).map(renderPromotionReviewItem).join("") || empty("暂无推广审核项。")}</div>
  </section>`;
}

function renderPromotionReviewItem(item) {
  const canQueue = item.queueType && !item.alreadyQueued && item.reviewStatus !== "needs_feedback";
  return `<div class="list-item">
    <div class="line-head">
      <strong>${esc(item.toolName)}</strong>
      ${pill(item.reviewStatus, item.reviewStatus === "ready_to_queue" ? "good" : item.reviewStatus === "already_queued" ? "warn" : "neutral")}
    </div>
    <div class="muted">${esc(labels[item.queueType] ?? item.queueType ?? item.suggestion)} · priority ${esc(item.priorityScore)} · score ${esc(item.score)} · affiliate ${esc(item.evidence?.affiliateScore ?? 0)} · clicks ${esc(item.evidence?.clicks ?? 0)} · bookmarks ${esc(item.evidence?.bookmarks ?? 0)}</div>
    <p>${esc(item.reason)}</p>
    <div class="queue-next">${esc(item.recommendedAction)}</div>
    <div class="row-actions">
      ${canQueue ? `<button class="button ghost" data-queue="${attr(item.queueType)}" data-tool-id="${attr(item.toolId)}" data-tool="${attr(item.toolName)}" data-url="${attr(item.toolUrl)}" data-priority="${attr(item.priorityScore)}" data-reason="${attr(item.reason)}">加入${esc(labels[item.queueType] ?? item.queueType)}</button>` : ""}
    </div>
  </div>`;
}

function renderQueueItem(item) {
  return `<div class="queue-card">
    <strong>${esc(item.toolName)}</strong>
    <div class="muted">${esc(item.status)} · priority ${esc(item.priorityScore)} · ${esc((item.sourceDates ?? []).join(", "))}</div>
    <p>${esc(item.reason)}</p>
    <div class="queue-next">${esc(queueNextStep(item))}</div>
    <div class="row-actions">${["new","researching","drafted","published","skipped","archived"].map((status) => `<button class="button ghost" data-queue-status="${attr(item.id)}" data-status="${status}">${status}</button>`).join("")}</div>
  </div>`;
}

function renderAccounts() {
  const strategy = state.latest?.accountStrategy;
  const supplyPlan = state.latest?.supplyPlan;
  if (!strategy) {
    $("#view-accounts").innerHTML = `<section class="panel"><h2>账号策略</h2>${empty("还没有账号策略数据。先运行 npm run daily。")}</section>`;
    return;
  }
  const accounts = strategy.accounts ?? [];
  const recommendations = strategy.toolRecommendations ?? [];
  $("#view-accounts").innerHTML = `<div class="grid">
    <section class="panel">
      <div class="line-head">
        <div>
          <p class="eyebrow">Account routing</p>
          <h2>账号策略 v1</h2>
          <p class="muted">现在只做内容分配，不做授权、不自动轮发。以后授权时，把 token 绑定到这些 accountId 即可。</p>
        </div>
        ${pill(strategy.authReady ? "Auth ready" : "Planning only", strategy.authReady ? "good" : "warn")}
      </div>
      <div class="pipeline-stats">
        <div><strong>${esc(strategy.summary?.activeAccounts ?? 0)}</strong><span>active</span></div>
        <div><strong>${esc(strategy.summary?.totalAccounts ?? 0)}</strong><span>total</span></div>
        <div><strong>${esc(strategy.summary?.routedTools ?? 0)}</strong><span>routed tools</span></div>
        <div><strong>${esc(strategy.sameToolCooldownDays ?? 7)}d</strong><span>same tool cooldown</span></div>
      </div>
      <div class="list">${(strategy.rotationNotes ?? []).map((note) => `<div class="list-item">${esc(note)}</div>`).join("")}</div>
    </section>
    ${renderSupplyCoverage(supplyPlan)}
    ${renderDraftPlannerPanel(state.latest?.draftPlan)}
    ${renderContentCalendarPanel(state.latest?.contentCalendar)}
    ${renderSourceQueuePanel(state.latest?.sourceQualityQueue)}
    ${renderSourceDiscoveryPanel(state.latest?.sourceDiscovery)}
    ${renderSourceHealthPanel(state.latest?.sourceHealth)}
    <section class="panel">
      <h2>今日工具分配</h2>
      <div class="list">${recommendations.map(renderAccountRecommendation).join("") || empty("暂无分配。")}</div>
    </section>
    <section class="panel wide-panel">
      <h2>OAuth 绑定准备</h2>
      <p class="muted">先不在页面里粘 token。需要绑定时，在本机运行对应命令，token 会写入本地 .env 的账号命名空间，不会进入 Git。</p>
      <div class="account-grid">${accounts.map(renderAccountBindingCard).join("") || empty("暂无账号配置。")}</div>
    </section>
    <section class="panel wide-panel">
      <h2>账号画像</h2>
      <div class="account-grid">${accounts.map(renderAccountCard).join("") || empty("暂无账号配置。")}</div>
    </section>
  </div>`;
}

function renderContentCalendarPanel(calendar) {
  if (!calendar) return "";
  const conflicts = (calendar.accountCalendars ?? [])
    .filter((account) => account.status === "target_incompatible")
    .slice(0, 8);
  const scalePlan = calendar.scalePlan ?? fallbackScalePlan(calendar);
  return `<section class="panel">
    <div class="line-head">
      <div>
        <p class="eyebrow">Content calendar</p>
        <h2>账号发布时间槽</h2>
        <p class="muted">${esc(calendar.rule)}</p>
      </div>
      ${pill(`capacity gap ${calendar.summary?.capacityGap ?? 0}`, Number(calendar.summary?.capacityGap ?? 0) ? "warn" : "good")}
    </div>
    <div class="pipeline-stats">
      <div><strong>${esc(calendar.summary?.scheduledPosts ?? 0)}/${esc(calendar.summary?.targetPosts ?? 0)}</strong><span>scheduled</span></div>
      <div><strong>${esc(calendar.summary?.sameDayCapacity ?? 0)}</strong><span>same-day slots</span></div>
      <div><strong>${esc(calendar.summary?.draftGap ?? 0)}</strong><span>draft gap</span></div>
      <div><strong>${esc(calendar.summary?.readyAccounts ?? 0)}/${esc(calendar.summary?.accounts ?? 0)}</strong><span>ready accounts</span></div>
    </div>
    ${renderScaleReality(scalePlan)}
    <div class="list">${conflicts.map((account) => `<div class="list-item">
      <strong>${esc(account.displayName)}</strong>
      <div class="muted">${esc(account.sameDayCapacity)}/${esc(account.targetPosts)} slots · cooldown ${esc(account.cooldownHours)}h · target needs about ${esc(account.recommendedCooldownHours)}h</div>
    </div>`).join("") || empty("当前冷却时间能容纳目标发布槽。")}</div>
  </section>`;
}

function renderScaleReality(scalePlan) {
  if (!scalePlan) return "";
  return `<div class="scale-reality">
    <div class="line-head">
      <strong>规模可行性</strong>
      ${pill(scalePlan.status === "ready_to_scale" ? "ready" : "not ready", scalePlan.status === "ready_to_scale" ? "good" : "warn")}
    </div>
    <p class="muted">${esc(scalePlan.headline)}</p>
    <div class="pipeline-stats">
      <div><strong>${esc(scalePlan.currentScheduledPosts ?? 0)}</strong><span>today review</span></div>
      <div><strong>${esc(scalePlan.theoreticalMaxTodayPosts ?? 0)}</strong><span>max today</span></div>
      <div><strong>${esc(scalePlan.recommendedTargetPerAccountIfKeepCooldown ?? 0)}/acct</strong><span>keep cooldown</span></div>
      <div><strong>${esc(scalePlan.recommendedCooldownHoursForTarget ?? 0)}h</strong><span>target cooldown</span></div>
    </div>
    <div class="list mini-list">${(scalePlan.nextActions ?? []).map((action) => `<div class="list-item">${esc(action)}</div>`).join("")}</div>
  </div>`;
}

function fallbackScalePlan(calendar) {
  const summary = calendar.summary ?? {};
  const accounts = Math.max(1, Number(summary.accounts ?? 0));
  const targetPosts = Number(summary.targetPosts ?? 0);
  const availableDrafts = Number(summary.availableDrafts ?? 0);
  const sameDayCapacity = Number(summary.sameDayCapacity ?? 0);
  const currentScheduledPosts = Number(summary.scheduledPosts ?? 0);
  const theoreticalMaxTodayPosts = Math.min(targetPosts, availableDrafts, sameDayCapacity);
  const recommendedTargetPerAccountIfKeepCooldown = Math.floor(sameDayCapacity / accounts);
  const recommendedCooldownHoursForTarget = maxNumber((calendar.accountCalendars ?? []).map((account) => account.recommendedCooldownHours));
  const blockers = [
    Number(summary.draftGap ?? 0) > 0 ? "draft_supply" : "",
    Number(summary.capacityGap ?? 0) > 0 ? "cooldown_capacity" : ""
  ].filter(Boolean);
  return {
    status: blockers.length ? "not_ready_to_scale" : "ready_to_scale",
    currentScheduledPosts,
    theoreticalMaxTodayPosts,
    recommendedTargetPerAccountIfKeepCooldown,
    recommendedCooldownHoursForTarget,
    headline: blockers.length
      ? `先别按 ${targetPosts}/day 放大。今天更现实的是审核约 ${theoreticalMaxTodayPosts} 条。`
      : "当前目标匹配草稿数量和发布时间槽。",
    nextActions: [
      Number(summary.draftGap ?? 0) > 0 ? `先补 ${summary.draftGap} 条合格、不重复候选。` : "",
      Number(summary.capacityGap ?? 0) > 0 ? `保持当前冷却时，目标约 ${recommendedTargetPerAccountIfKeepCooldown}/account/day；若坚持当前目标，冷却约 ${recommendedCooldownHoursForTarget}h。` : "",
      `先人工审核 ${currentScheduledPosts} 条已排期内容。`
    ].filter(Boolean)
  };
}

function renderDraftPlannerPanel(plan) {
  if (!plan) return "";
  const gaps = (plan.accountPlans ?? []).filter((account) => account.gap > 0).slice(0, 8);
  const covered = plan.summary?.accountsCovered ?? 0;
  return `<section class="panel">
    <div class="line-head">
      <div>
        <p class="eyebrow">Draft planner</p>
        <h2>不重复草稿规划</h2>
        <p class="muted">${esc(plan.rule)}</p>
      </div>
      ${pill(`gap ${plan.summary?.gap ?? 0}`, Number(plan.summary?.gap ?? 0) ? "warn" : "good")}
    </div>
    <div class="pipeline-stats">
      <div><strong>${esc(plan.summary?.plannedPosts ?? 0)}/${esc(plan.summary?.targetPosts ?? 0)}</strong><span>planned</span></div>
      <div><strong>${esc(plan.summary?.uniqueToolsUsed ?? 0)}</strong><span>unique tools</span></div>
      <div><strong>${esc(covered)}/${esc(plan.summary?.accounts ?? 0)}</strong><span>covered accounts</span></div>
    </div>
    <div class="list">${gaps.map((account) => `<div class="list-item"><strong>${esc(account.displayName)}</strong><div class="muted">${esc(account.plannedPosts)}/${esc(account.targetPosts)} unique drafts · gap ${esc(account.gap)}</div></div>`).join("") || empty("所有账号都达到当前目标。")}</div>
  </section>`;
}

function renderSourceQueuePanel(queue) {
  if (!queue?.items?.length) return "";
  return `<section class="panel">
    <div class="line-head">
      <div>
        <p class="eyebrow">Source quality queue</p>
        <h2>今天优先补什么来源</h2>
        <p class="muted">按账号缺口和圈子缺口生成，不降低质量线。</p>
      </div>
      ${pill(`${queue.summary?.totalNeededCandidates ?? 0} needed`, "warn")}
    </div>
    <div class="list">${queue.items.slice(0, 6).map((item) => `<div class="list-item">
      <div class="line-head"><strong>${esc(item.circleName)}</strong>${pill(`need ${item.neededCandidates}`, "warn")}</div>
      <div class="muted">${esc(item.importHint)}</div>
      <div class="muted">Query: ${esc(item.searchQueries?.[0] ?? "")}</div>
    </div>`).join("")}</div>
  </section>`;
}

function renderSourceDiscoveryPanel(discovery) {
  if (!discovery?.circles?.length) return "";
  return `<section class="panel">
    <div class="line-head">
      <div>
        <p class="eyebrow">Source discovery</p>
        <h2>去哪里补高质量选题</h2>
        <p class="muted">按当前缺口生成搜索入口。这里只负责发现，不自动抓取、不自动导入。</p>
      </div>
      ${pill(`${discovery.summary?.totalNeededCandidates ?? 0} needed`, Number(discovery.summary?.totalNeededCandidates ?? 0) ? "warn" : "good")}
    </div>
    <div class="list">${discovery.circles.slice(0, 4).map((circle) => `<div class="list-item">
      <div class="line-head">
        <strong>${esc(circle.circleName)}</strong>
        ${pill(`need ${circle.neededCandidates}`, Number(circle.neededCandidates) > 20 ? "warn" : "neutral")}
      </div>
      <p class="muted">${esc(circle.openingMove)}</p>
      <div class="button-row">${(circle.searchLinks ?? []).slice(0, 5).map((link) => `<a class="btn ghost" href="${attr(link.url)}" target="_blank" rel="noreferrer">${esc(link.label)}</a>`).join("")}</div>
    </div>`).join("")}</div>
  </section>`;
}

function renderSourceHealthPanel(health) {
  if (!health) return "";
  const sources = (health.sources ?? [])
    .filter((source) => ["disable_candidate", "needs_candidates", "weak", "tune"].includes(source.status))
    .slice(0, 8);
  return `<section class="panel">
    <div class="line-head">
      <div>
        <p class="eyebrow">Source health</p>
        <h2>来源健康度</h2>
        <p class="muted">按候选数量、合格率、新鲜度和噪音率判断来源是否该保留、调参或关闭。</p>
      </div>
      ${pill(`${health.summary?.healthySources ?? 0} healthy`, Number(health.summary?.disableCandidates ?? 0) ? "warn" : "good")}
    </div>
    <div class="pipeline-stats">
      <div><strong>${esc(health.summary?.enabledSources ?? 0)}/${esc(health.summary?.configuredSources ?? 0)}</strong><span>enabled</span></div>
      <div><strong>${esc(health.summary?.qualifiedCandidates ?? 0)}/${esc(health.summary?.totalCandidates ?? 0)}</strong><span>qualified</span></div>
      <div><strong>${esc(health.summary?.noiseCandidates ?? 0)}</strong><span>noise</span></div>
      <div><strong>${esc(health.summary?.tuneSources ?? 0)}</strong><span>tune</span></div>
    </div>
    <div class="list">${sources.map((source) => `<div class="list-item">
      <div class="line-head"><strong>${esc(source.name)}</strong>${pill(`${source.healthScore}/100`, source.status === "tune" ? "warn" : source.status === "disable_candidate" ? "bad" : "neutral")}</div>
      <div class="muted">${esc(source.status)} · ${esc(source.qualifiedCandidates)}/${esc(source.totalCandidates)} qualified · noise ${esc(source.noiseCandidates)} · ${esc(source.circle || "unknown circle")}</div>
      <p>${esc(source.recommendation)}</p>
    </div>`).join("") || empty("来源健康度暂无明显问题。")}</div>
  </section>`;
}

function renderSupplyCoverage(supplyPlan) {
  if (!supplyPlan) return "";
  const shortages = (supplyPlan.accountCoverage ?? []).filter((item) => item.gap > 0).slice(0, 10);
  const circles = supplyPlan.circleCoverage ?? [];
  return `<section class="panel">
    <div class="line-head">
      <div>
        <p class="eyebrow">Supply coverage</p>
        <h2>20 账号内容供给</h2>
        <p class="muted">${esc(supplyPlan.note)}</p>
      </div>
      ${pill(supplyPlan.status === "covered" ? "covered" : `gap ${supplyPlan.totalGap}`, supplyPlan.status === "covered" ? "good" : "warn")}
    </div>
    <div class="pipeline-stats">
      <div><strong>${esc(supplyPlan.targetAccounts)}×${esc(supplyPlan.targetPerAccount)}</strong><span>target</span></div>
      <div><strong>${esc(supplyPlan.qualifiedTools)}</strong><span>qualified items</span></div>
      <div><strong>${esc(supplyPlan.possibleDrafts)}</strong><span>copy variants</span></div>
      <div><strong>${esc(supplyPlan.minimumQualityScore)}+</strong><span>quality floor</span></div>
    </div>
    <h3>圈子覆盖</h3>
    <div class="list">${circles.map((circle) => `<div class="list-item"><strong>${esc(circle.name)}</strong><div class="muted">${esc(circle.qualifiedTools)} qualified · ${esc(circle.possibleDrafts)} variants</div></div>`).join("") || empty("暂无圈子覆盖。")}</div>
    <h3>账号缺口</h3>
    <div class="list">${shortages.map((item) => `<div class="list-item"><strong>${esc(item.displayName)}</strong><div class="muted">${esc(item.availableDrafts)}/${esc(item.targetPosts)} unique candidates · gap ${esc(item.gap)}</div></div>`).join("") || empty("当前目标下没有账号缺口。")}</div>
  </section>`;
}

function renderAccountRecommendation(item) {
  const primary = item.primary;
  const alternatives = (item.alternatives ?? []).map((alt) => alt.displayName).join(" / ");
  return `<div class="list-item">
    <div class="line-head">
      <strong>${esc(item.toolName)}</strong>
      ${primary ? pill(primary.displayName, "good") : pill("No account", "warn")}
    </div>
    <div class="muted">${esc(item.reason ?? "")}</div>
    ${alternatives ? `<div class="muted">备选：${esc(alternatives)}</div>` : ""}
  </div>`;
}

function renderAccountCard(account) {
  const auth = accountAuthById(account.id);
  return `<article class="account-card">
    <div class="line-head">
      <strong>${esc(account.displayName)}</strong>
      ${pill(account.active ? "active" : "paused", account.active ? "good" : "warn")}
      ${pill(auth?.configured ? "auth bound" : "auth missing", auth?.configured ? "good" : "warn")}
    </div>
    <div class="muted">${esc(account.category)} · ${esc(account.id)}</div>
    <p>${esc(account.description)}</p>
    <div class="pill-row">${(account.contentPillars ?? []).map((item) => pill(item, "good")).join("")}</div>
    <div class="muted">limit ${esc(account.dailyPostLimit)}/day · planned ${esc(account.plannedToolsToday ?? 0)} · remaining ${esc(account.remainingSlotsToday ?? 0)} · cooldown ${esc(account.cooldownHours)}h</div>
    <div class="muted">keywords: ${esc((account.keywords ?? []).slice(0, 8).join(", "))}</div>
  </article>`;
}

function renderAccountBindingCard(account) {
  const auth = accountAuthById(account.id);
  const command = `npm run x:auth -- --account ${account.id}`;
  return `<article class="account-card">
    <div class="line-head">
      <strong>${esc(account.displayName)}</strong>
      ${pill(auth?.configured ? xAuthStatus(account.id).label : "未绑定", auth?.configured ? "good" : "warn")}
    </div>
    <div class="muted">${esc(account.id)} · ${esc(auth?.envPrefix ?? "")}</div>
    <pre class="copy-text">${esc(command)}</pre>
    <div class="row-actions">
      <button class="button ghost" data-copy="${attr(command)}">复制授权命令</button>
    </div>
  </article>`;
}

function renderAffiliate() {
  const latestCandidates = (state.latest?.affiliateResearchQueue ?? []);
  $("#view-affiliate").innerHTML = `${renderAffiliateReadinessPanel()}
  <div class="grid">
    <section class="panel"><h2>待查候选</h2><div class="list">${latestCandidates.map((item) => `<div class="list-item"><strong>${esc(item.name)}</strong><div class="muted">affiliateScore ${esc(item.affiliateScore)} · 搜索 "${esc(item.name)} affiliate program"</div><div class="row-actions">${renderSearchLinks(item.name, item.url)}<button class="button ghost" data-affiliate="${attr(item.name)}" data-url="${attr(item.url)}" data-score="${attr(item.affiliateScore)}">加入联盟研究</button></div></div>`).join("") || empty("暂无。")}</div></section>
    <section class="panel"><h2>手动记录</h2>
      <form class="inline-form" id="affiliateForm">
        <label>工具名 <input name="toolName" required placeholder="Tool name"></label>
        <label>官网或 PH URL <input name="toolUrl" required type="url" placeholder="https://..."></label>
        <label>分数 <input name="affiliateScore" type="number" min="0" max="10" value="0"></label>
        <label>状态 <select name="status">${["not_started","searching","applied","approved","rejected","no_program","added_to_config"].map((status) => `<option value="${status}">${esc(labels[status] ?? status)}</option>`).join("")}</select></label>
        <label>network <input name="network" placeholder="PartnerStack / Impact / self-hosted"></label>
        <label>programUrl <input name="programUrl" type="url" placeholder="https://..."></label>
        <label>affiliateLink <input name="affiliateLink" type="url" placeholder="只填你真实拿到的链接"></label>
        <label>commissionNote <input name="commissionNote" placeholder="人工确认后再写"></label>
        <label class="wide">notes <textarea name="notes" rows="3" placeholder="搜索记录、申请状态、注意事项"></textarea></label>
        <button class="button" type="submit">保存研究记录</button>
      </form>
    </section>
    <section class="panel"><h2>研究记录</h2><div class="list">${state.affiliateResearch.items.map(renderAffiliateRecord).join("") || empty("暂无研究记录。")}</div></section>
  </div>`;
}

function renderAffiliateReadinessPanel() {
  const summary = affiliateReadinessSummary();
  return `<section class="panel affiliate-readiness ${summary.ready ? "good" : summary.missing ? "warn" : ""}">
    <div class="line-head">
      <div>
        <p class="eyebrow">Affiliate readiness</p>
        <h2>${summary.ready ? `${summary.ready} 条可加入配置` : "还没有可加入配置的联盟链接"}</h2>
      </div>
      ${pill(summary.ready ? "Ready" : "Research", summary.ready ? "good" : "warn")}
    </div>
    <div class="pipeline-stats">
      <div><strong>${esc(summary.ready)}</strong><span>可配置</span></div>
      <div><strong>${esc(summary.missing)}</strong><span>缺字段</span></div>
      <div><strong>${esc(summary.researching)}</strong><span>研究中</span></div>
      <div><strong>${esc(summary.noFit)}</strong><span>不适合</span></div>
    </div>
    <p class="muted">${summary.ready ? "只复制你真实拿到的 affiliateLink 到配置；不要把 programUrl 或官网链接当成 affiliate link。" : "先查官方 partner / affiliate / referral 页面，拿到真实 affiliateLink 后再复制配置片段。"}</p>
  </section>`;
}

function affiliateReadinessSummary() {
  return (state.affiliateResearch.items ?? []).reduce((acc, item) => {
    const readiness = affiliateReadiness(item);
    if (readiness.state === "ready") acc.ready += 1;
    else if (readiness.state === "missing") acc.missing += 1;
    else if (readiness.state === "no_fit") acc.noFit += 1;
    else acc.researching += 1;
    return acc;
  }, { ready: 0, missing: 0, researching: 0, noFit: 0 });
}

function renderAffiliateRecord(item) {
  const readiness = affiliateReadiness(item);
  const snippet = affiliateConfigSnippet(item);
  return `<div class="list-item affiliate-record">
    <div class="line-head">
      <strong>${esc(item.toolName)}</strong>
      ${pill(readiness.label, readiness.kind)}
    </div>
    <div class="muted">${esc(labels[item.status] ?? item.status)} · ${esc(item.network || "no network")} · score ${esc(item.affiliateScore ?? 0)}</div>
    <div class="affiliate-checks">
      ${renderAffiliateCheck("programUrl", Boolean(item.programUrl), item.programUrl || "missing")}
      ${renderAffiliateCheck("affiliateLink", Boolean(item.affiliateLink), item.affiliateLink || "missing")}
      ${renderAffiliateCheck("status", readiness.state !== "researching", labels[item.status] ?? item.status)}
    </div>
    <p class="muted">${esc(readiness.reason)}</p>
    ${item.notes ? `<div class="muted">${esc(item.notes)}</div>` : ""}
    <div class="row-actions">
      ${renderSearchLinks(item.toolName, item.toolUrl)}
      ${readiness.state === "ready" ? `<button class="button ghost" data-copy="${attr(snippet)}">复制配置片段</button>` : ""}
      ${["searching","applied","approved","rejected","no_program","added_to_config"].map((status) => `<button class="button ghost" data-aff-status="${attr(item.id)}" data-tool="${attr(item.toolName)}" data-url="${attr(item.toolUrl)}" data-status="${status}">${esc(labels[status] ?? status)}</button>`).join("")}
    </div>
  </div>`;
}

function affiliateReadiness(item) {
  if (item.status === "added_to_config") {
    return { state: "ready", kind: "good", label: "已配置", reason: "这条已经标记为 added_to_config，后续只需定期确认链接仍然有效。" };
  }
  if (["rejected", "no_program"].includes(item.status)) {
    return { state: "no_fit", kind: "stale", label: "暂不适合", reason: "当前没有可用 program 或申请未通过，不要把它写进 affiliate 配置。" };
  }
  if (item.status === "approved" && item.programUrl && item.affiliateLink) {
    return { state: "ready", kind: "good", label: "可加入配置", reason: "已通过且有真实 affiliateLink，可以复制配置片段到 config/affiliate-links.json。" };
  }
  if (item.status === "approved" && (!item.programUrl || !item.affiliateLink)) {
    const missing = [!item.programUrl ? "programUrl" : "", !item.affiliateLink ? "affiliateLink" : ""].filter(Boolean).join(", ");
    return { state: "missing", kind: "warn", label: "缺字段", reason: `状态已通过，但还缺 ${missing}。补齐前不要写入配置。` };
  }
  if (item.status === "applied") {
    return { state: "researching", kind: "warn", label: "等待审核", reason: "已申请但还没 approved；先不要使用 affiliate link。" };
  }
  return { state: "researching", kind: "warn", label: "继续查", reason: "先确认官方 programUrl、network 和申请路径，再记录真实 affiliateLink。" };
}

function renderAffiliateCheck(label, ok, value) {
  return `<div class="affiliate-check ${ok ? "ok" : "warn"}">
    <span>${esc(label)}</span>
    <strong>${esc(value)}</strong>
  </div>`;
}

function affiliateConfigSnippet(item) {
  const domain = safeHost(item.toolUrl);
  const record = {
    match: item.toolName,
    keywords: [],
    domains: domain ? [domain] : [],
    affiliateUrl: item.affiliateLink || "",
    note: item.commissionNote || `Verified affiliate program: ${item.programUrl || "programUrl missing"}`
  };
  return JSON.stringify(record, null, 2);
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function renderReviews() {
  const candidates = (state.latest?.tools ?? []).filter((tool) => ["review page candidate", "thread candidate"].includes(tool.followUpAction));
  $("#view-reviews").innerHTML = `<div class="grid"><section class="panel"><h2>候选工具</h2><div class="list">${candidates.map((tool) => `<div class="list-item"><strong>${esc(tool.name)}</strong><div class="muted">${esc(tool.reason)}</div><button class="button ghost" data-review="${attr(tool.name)}">生成测评页大纲</button></div>`).join("") || empty("暂无候选。")}</div></section><section class="panel"><h2>已生成大纲</h2><div class="list">${state.reviewPages.items.map((item) => `<div class="list-item"><strong>${esc(item.toolName)}</strong><div class="muted">${esc(item.status)} · ${esc(item.filePath)}</div></div>`).join("") || empty("暂无大纲。")}</div></section></div>`;
}

function renderHistory() {
  const records = [...state.history.tools].sort((a, b) => String(b.date).localeCompare(String(a.date)) || Number(b.score) - Number(a.score)).slice(0, 30);
  $("#view-history").innerHTML = `<section class="panel"><h2>历史复盘</h2><div class="list">${records.map((item) => `<div class="list-item"><strong>${esc(item.toolName)}</strong><div class="muted">${esc(item.date)} · score ${esc(item.score)} · ${esc(labels[item.followUpAction] ?? item.followUpAction)}</div></div>`).join("") || empty("暂无历史。")}</div></section>`;
}

function renderWeekly() {
  const trend = state.weekly?.dailyTrend ?? [];
  const angles = state.weekly?.topAngles ?? [];
  $("#view-weekly").innerHTML = `<div class="weekly-layout">
    ${renderWeeklySummaryCards()}
    <section class="panel wide-panel"><h2>7 天趋势图</h2><p class="muted">柱高看 engagementScore；下面的小标签看 posts、bookmarks、clicks。没有反馈时，系统会退回用 topScore / toolsSeen 做参考。</p>${renderTrendChart(trend)}</section>
    <section class="panel"><h2>Top angle 统计</h2><p class="muted">优先看 avg score 和 bookmarks/clicks；likes 不是主要决策指标。</p><div class="chart-list">${angles.map(renderAngleRow).join("") || empty("暂无 angle 反馈。")}</div></section>
    <section class="panel"><h2>Angle 结论</h2>${renderAngleInsight(angles)}</section>
    <section class="panel"><h2>摘要</h2><div class="list">
      <div class="list-item">跑 daily 天数: ${esc(state.weekly?.summary?.dailyDays ?? 0)}</div>
      <div class="list-item">历史工具记录: ${esc(state.weekly?.summary?.toolsSeen ?? state.weekly?.historyCount ?? 0)}</div>
      <div class="list-item">已追踪发推: ${esc(state.weekly?.summary?.postsTracked ?? state.weekly?.feedbackCount ?? 0)}</div>
      <div class="list-item">最佳 angle: ${esc(labels[state.weekly?.summary?.topAngle] ?? state.weekly?.summary?.topAngle ?? "暂无")}</div>
    </div></section>
    <section class="panel"><h2>系统建议</h2><div class="list">${(state.weekly?.suggestions ?? []).slice(0, 8).map((item) => `<div class="list-item"><strong>${esc(item.toolName)}</strong><div class="muted">${esc(labels[item.suggestion] ?? item.suggestion)} · ${esc(item.reason)}</div></div>`).join("") || empty("暂无建议。")}</div></section>
  </div>`;
}

function renderSettings() {
  const xAuth = xAuthStatus();
  $("#view-settings").innerHTML = `<div class="grid"><section class="panel"><h2>数据状态</h2><div class="list">
    <div class="list-item">latest 日期: ${esc(state.settings?.latestDate ?? "-")}</div>
    <div class="list-item">history 记录: ${esc(state.settings?.historyCount ?? 0)}</div>
    <div class="list-item">voice 禁用词: ${esc(state.settings?.forbiddenWords?.length ?? 0)}</div>
    <div class="list-item">voice 长度上限: ${esc(state.settings?.maxTweetCharacters ?? 260)}</div>
    <div class="list-item">affiliate links: ${esc(state.settings?.affiliateLinks?.length ?? 0)}</div>
    <div class="list-item">feedback: ${esc(state.settings?.feedbackCount ?? 0)}</div>
    <div class="list-item">account posts: ${esc(state.settings?.accountPostCount ?? 0)}</div>
    <div class="list-item">queues: ${esc(state.settings?.queueCount ?? 0)}</div>
    <div class="list-item">candidate inbox: ${esc(state.settings?.candidateInboxCount ?? 0)}</div>
    <div class="list-item">X 发布: ${esc(xAuth.label)} · ${esc(state.xStatus.health ?? "unknown")}</div>
    <div class="list-item">X refresh: ${esc(state.xStatus.refreshConfigured ? "已配置" : "未配置")} · expires ${esc(state.xStatus.expiresAt ? formatDateTime(state.xStatus.expiresAt) : "未知")}</div>
    <div class="list-item">affiliate research: ${esc(state.settings?.affiliateResearchCount ?? 0)}</div>
    <div class="list-item">review pages: ${esc(state.settings?.reviewPageCount ?? 0)}</div>
  </div></section><section class="panel"><h2>禁用词</h2><p class="muted">${esc((state.settings?.forbiddenWords ?? []).join(", ") || "暂无")}</p></section><section class="panel"><h2>Affiliate Links</h2><div class="list">${(state.settings?.affiliateLinks ?? []).map((link) => `<div class="list-item"><strong>${esc(link.name ?? link.match ?? "unnamed")}</strong><div class="muted">${esc(link.affiliateUrl ?? "")}</div></div>`).join("") || empty("还没有配置 affiliate link。")}</div></section></div>`;
}

function renderSearchLinks(toolName, toolUrl = "") {
  const links = affiliateSearchLinks(toolName, toolUrl);
  return `<div class="affiliate-search-group">
    <button class="button ghost" type="button" data-open-searches="${attr(JSON.stringify(links.map((item) => item.url)))}">一键打开搜索组</button>
    ${links.map((item) => `<a class="button ghost" href="${attr(item.url)}" target="_blank" rel="noreferrer">${esc(item.label)}</a>`).join("")}
  </div>`;
}

function affiliateSearchLinks(toolName, toolUrl = "") {
  const domain = safeHost(toolUrl);
  const quoted = `"${toolName}"`;
  const google = (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const links = [];
  if (toolUrl) links.push({ label: "官网", url: toolUrl });
  links.push({ label: "official affiliate", url: google(domain ? `site:${domain} affiliate OR partner OR referral` : `${quoted} affiliate program`) });
  links.push({ label: "PartnerStack", url: google(`site:partnerstack.com ${quoted}`) });
  links.push({ label: "Impact", url: google(`site:impact.com ${quoted} affiliate`) });
  links.push({ label: "Rewardful", url: google(`site:rewardful.com ${quoted}`) });
  links.push({ label: "Terms", url: google(`${quoted} terms affiliate referral partner`) });
  return links;
}

function renderWeeklySummaryCards() {
  const trend = state.weekly?.dailyTrend ?? [];
  const totalEngagement = trend.reduce((sum, item) => sum + Number(item.engagementScore ?? 0), 0);
  const totalPosts = trend.reduce((sum, item) => sum + Number(item.postsTracked ?? 0), 0);
  const totalBookmarks = trend.reduce((sum, item) => sum + Number(item.bookmarks ?? 0), 0);
  const totalClicks = trend.reduce((sum, item) => sum + Number(item.clicks ?? 0), 0);
  const topAngle = state.weekly?.topAngles?.[0];
  const cards = [
    ["7d engagement", roundDisplay(totalEngagement)],
    ["tracked posts", totalPosts],
    ["bookmarks", totalBookmarks],
    ["clicks", totalClicks],
    ["top angle", labels[topAngle?.variantType] ?? topAngle?.variantType ?? "暂无"]
  ];
  return `<section class="weekly-cards">${cards.map(([label, value]) => `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</section>`;
}

function renderTrendChart(trend) {
  if (!trend.length) return empty("数据还少，先连续跑几天 daily 并录入发推反馈。");
  const maxValue = Math.max(1, ...trend.map(trendValue));
  return `<div class="trend-chart">${trend.map((item) => {
    const value = trendValue(item);
    const height = Math.max(8, Math.round((value / maxValue) * 100));
    return `<div class="trend-column">
      <div class="trend-bar-wrap"><div class="trend-bar" style="height:${height}%"></div></div>
      <strong>${esc(item.date.slice(5))}</strong>
      <span>score ${esc(roundDisplay(item.engagementScore ?? 0))}</span>
      <small>posts ${esc(item.postsTracked)} · bm ${esc(item.bookmarks)} · clicks ${esc(item.clicks)}</small>
    </div>`;
  }).join("")}</div>`;
}

function renderAngleInsight(angles) {
  if (!angles.length) return empty("暂无 angle 反馈。先导入几条发推数据，再看哪类文案值得重复。");
  const top = angles[0];
  const runnerUp = angles[1];
  const avg = Number(top.posts) ? Number(top.engagementScore || 0) / Number(top.posts) : 0;
  return `<div class="insight-card">
    <strong>${esc(labels[top.variantType] ?? top.variantType)} 暂时领先</strong>
    <p class="muted">总分 ${esc(top.engagementScore)}，平均 ${esc(roundDisplay(avg))}/post，bookmarks ${esc(top.bookmarks)}，clicks ${esc(top.clicks)}。</p>
    <p>${esc(runnerUp ? `下一个对照角度可以测 ${labels[runnerUp.variantType] ?? runnerUp.variantType}，避免过早押单一文案套路。` : "样本还少，先继续用不同角度发 3-5 条再判断。")}</p>
  </div>`;
}

function renderTrendRow(item) {
  const maxValue = Math.max(1, ...(state.weekly?.dailyTrend ?? []).map(trendValue));
  const width = Math.round((trendValue(item) / maxValue) * 100);
  return `<div class="chart-row">
    <div><strong>${esc(item.date)}</strong><div class="muted">tools ${esc(item.toolsSeen)} · posts ${esc(item.postsTracked)} · engagement ${esc(item.engagementScore)}</div></div>
    <div class="chart-track"><div class="chart-fill" style="width:${width}%"></div></div>
  </div>`;
}

function renderAngleRow(item) {
  const maxValue = Math.max(1, ...(state.weekly?.topAngles ?? []).map((angle) => Number(angle.engagementScore || 0)));
  const width = Math.round((Number(item.engagementScore || 0) / maxValue) * 100);
  const avg = Number(item.posts) ? Number(item.engagementScore || 0) / Number(item.posts) : 0;
  return `<div class="chart-row">
    <div><strong>${esc(labels[item.variantType] ?? item.variantType)}</strong><div class="muted">score ${esc(item.engagementScore)} · avg ${esc(roundDisplay(avg))} · posts ${esc(item.posts)} · bookmarks ${esc(item.bookmarks)} · clicks ${esc(item.clicks)}</div></div>
    <div class="chart-track"><div class="chart-fill accent" style="width:${width}%"></div></div>
  </div>`;
}

function trendValue(item) {
  return Number(item.engagementScore || item.topScore || item.toolsSeen || 0);
}

function roundDisplay(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 10) / 10;
}

function bar(key, value) {
  const label = { painScore: "痛点", nicheScore: "小众", affiliateScore: "联盟", contentScore: "内容", noveltyScore: "新鲜", riskScore: "风险" }[key] ?? key;
  const width = Math.max(0, Math.min(100, Number(value) * 10));
  return `<div class="bar"><span>${esc(label)}</span><div class="track"><div class="fill ${key === "riskScore" ? "risk" : ""}" style="width:${width}%"></div></div><strong>${esc(value)}</strong></div>`;
}

function actionLabel(type) {
  return { post: "发这条推", "research affiliate": "查联盟计划", longform: "保留做长文", wait: "先别付费发布" }[type] ?? type;
}

function decisionLabel(type) {
  return { double_down: "继续加码", monetize: "查转化", pause: "暂停观察", watch: "继续观察" }[type] ?? type;
}

function pill(text, kind = "") {
  return `<span class="pill ${kind}">${esc(text)}</span>`;
}

function freshnessBadge(tool) {
  const category = freshnessCategory(tool);
  if (category === "seen") return { label: "Seen before", kind: "seen" };
  if (category === "freshToday") return { label: "Fresh today", kind: "fresh" };
  if (category === "fresh48") return { label: "Fresh 48h", kind: "fresh" };
  return { label: "Older but useful", kind: "stale" };
}

function freshnessCategory(tool) {
  if (tool?.seenBefore) return "seen";
  const ageHours = productAgeHours(tool.published);
  if (ageHours !== null && ageHours <= 24) return "freshToday";
  if (ageHours !== null && ageHours <= 48) return "fresh48";
  return "stale";
}

function productAgeHours(published) {
  const date = new Date(published);
  if (Number.isNaN(date.getTime())) return null;
  const reference = state.latest?.generatedAt ? new Date(state.latest.generatedAt) : new Date();
  if (Number.isNaN(reference.getTime())) return null;
  return Math.max(0, (reference.getTime() - date.getTime()) / 3600000);
}

function freshnessStats(tools) {
  const stats = { freshToday: 0, fresh48: 0, seen: 0, stale: 0, apiReady: 0 };
  for (const tool of tools) {
    const category = freshnessCategory(tool);
    if (category === "freshToday") stats.freshToday += 1;
    if (category === "fresh48") stats.fresh48 += 1;
    if (category === "seen") stats.seen += 1;
    if (category === "stale") stats.stale += 1;
    if (["freshToday", "fresh48"].includes(category)) stats.apiReady += 1;
  }
  return stats;
}

function readinessAdvice(latest, stats) {
  const ageMinutes = dataAgeMinutes(latest.generatedAt);
  if (latest.source?.usedFallback) return "当前数据来自 fallback sample，只适合看格式，不建议发布。";
  if (ageMinutes !== null && ageMinutes > 360) return "数据已经超过 6 小时，发布前先跑 npm run daily 刷新一遍。";
  if (stats.apiReady > 0) return "只建议用 API 发布 Fresh today / Fresh 48h；Seen before 先手动观察或放进长文/测评页。";
  return "今天没有明显的新鲜候选，先别花 credits；可以做历史工具的测评页或联盟研究。";
}

function renderPublishRisk(tool, accountId = "") {
  if (!tool) return `<div class="publish-risk-card warn">找不到工具记录，建议取消后刷新数据。</div>`;
  const latest = state.latest ?? {};
  const freshness = freshnessBadge(tool);
  const age = productAgeHours(tool.published);
  const risks = [];
  if (latest.source?.usedFallback) risks.push("当前是 fallback sample，不建议 API 发布。");
  if (dataAgeMinutes(latest.generatedAt) > 360) risks.push("数据刷新超过 6 小时，建议先跑 npm run daily。");
  if (tool.seenBefore) risks.push("历史出现过，不要把它当今天新工具发。");
  if (freshness.kind === "stale") risks.push("发布时间超过 48 小时，更适合长文或 SEO 测评页。");
  const xAuth = xAuthStatus(accountId);
  if (xAuth.blocked) risks.push(xAuth.reason);
  else if (xAuth.warning) risks.push(xAuth.reason);
  if (!risks.length) risks.push("新鲜度适合小额 API 测试，发布后记得回填反馈。");
  const kind = latest.source?.usedFallback || freshness.kind === "stale" ? "bad" : tool.seenBefore ? "warn" : "good";
  const ageText = age === null ? "发布时间未知" : `PH 发布时间约 ${Math.round(age)} 小时前`;
  return `<div class="publish-risk-card ${kind}">
    <div class="line-head">${pill(freshness.label, freshness.kind)}<strong>${esc(ageText)}</strong></div>
    <ul>${risks.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
  </div>`;
}

function buildPublishReadiness(tool, text, accountId = "") {
  const latest = state.latest ?? {};
  const normalized = String(text ?? "").trim();
  const count = normalized.length;
  const ageMinutes = dataAgeMinutes(latest.generatedAt);
  const staleData = ageMinutes !== null && ageMinutes > 360;
  const freshness = tool ? freshnessBadge(tool) : null;
  const claimRisks = findRiskyClaims(normalized);
  const forbidden = forbiddenPhrases(normalized);
  const xAuth = xAuthStatus(accountId);
  const safety = accountSafety(tool, normalized, accountId);
  const blockReasons = [];
  const overrideReasons = [];

  if (!tool) blockReasons.push("找不到工具记录，刷新页面后再试。");
  if (xAuth.blocked) blockReasons.push(xAuth.reason);
  if (!normalized) blockReasons.push("文案为空。");
  if (count > 280) blockReasons.push(`文案 ${count} 字，超过 X 280 字限制。`);
  if (forbidden.length) blockReasons.push(`文案包含 voice 禁用词：${forbidden.join(", ")}。`);
  if (latest.source?.usedFallback) blockReasons.push("当前是 fallback sample，不允许 API 发布。");
  if (staleData) blockReasons.push("数据刷新超过 6 小时，先刷新 Live Feed。");
  if (!xAuth.blocked && xAuth.warning) overrideReasons.push(xAuth.reason);
  if (tool?.seenBefore) overrideReasons.push("这个工具历史出现过，不要当成今天新工具发。");
  if (freshness?.kind === "stale") overrideReasons.push("这条不是 Fresh today / Fresh 48h，更适合观察、长推或测评页。");
  if (claimRisks.length) overrideReasons.push(`文案含高风险承诺词：${claimRisks.join(", ")}。`);
  blockReasons.push(...safety.blockReasons);

  const kind = blockReasons.length ? "bad" : overrideReasons.length ? "warn" : "good";
  const actionText = blockReasons.length ? "暂不能 API 发布" : overrideReasons.length ? "需要额外确认" : "可以谨慎发布";
  const checks = [
    {
      label: "账号",
      value: safety.account?.displayName || "未选择",
      ok: Boolean(safety.account)
    },
    {
      label: "数据",
      value: latest.source?.usedFallback ? "Fallback sample" : ageMinutes === null ? "年龄未知" : `刷新 ${formatDuration(ageMinutes)}前`,
      ok: !latest.source?.usedFallback && !staleData
    },
    {
      label: "新鲜度",
      value: freshness?.label ?? "未知",
      ok: freshness?.kind === "fresh"
    },
    {
      label: "X 配置",
      value: xAuth.label,
      ok: !xAuth.blocked
    },
    {
      label: "字数",
      value: `${count} / 280`,
      ok: count > 0 && count <= 280
    },
    {
      label: "Voice",
      value: forbidden.length ? forbidden.join(", ") : "无禁用词",
      ok: !forbidden.length
    },
    {
      label: "承诺风险",
      value: claimRisks.length ? claimRisks.join(", ") : "未发现明显高风险词",
      ok: !claimRisks.length
    }
  ];

  return { kind, actionText, blockReasons, overrideReasons, checks, accountSafety: safety };
}

function findRiskyClaims(text) {
  const lower = String(text ?? "").toLowerCase();
  const terms = ["guaranteed", "passive income", "make money", "revenue", "profit", "earn", "10x"];
  const found = terms.filter((term) => lower.includes(term));
  if (text.includes("$")) found.push("$");
  return Array.from(new Set(found)).slice(0, 5);
}

function copyQuality(text) {
  const normalized = String(text ?? "").trim();
  const length = normalized.length;
  const forbidden = forbiddenPhrases(normalized);
  const risky = findRiskyClaims(normalized);
  const max = maxTweetCharacters();
  const tooLong = length > max;
  const ok = length > 0 && !tooLong && !forbidden.length && !risky.length;
  const kind = forbidden.length || tooLong ? "bad" : risky.length ? "warn" : "good";
  const label = ok ? "Copy QA OK" : tooLong ? `Too long ${length}/${max}` : forbidden.length ? "禁用词" : "需复查";
  return { ok, kind, label, length, max, forbidden, risky, tooLong };
}

function forbiddenPhrases(text) {
  const lower = String(text ?? "").toLowerCase();
  return (state.settings?.forbiddenWords ?? [])
    .filter((phrase) => lower.includes(String(phrase).toLowerCase()))
    .slice(0, 6);
}

function maxTweetCharacters() {
  return Number(state.settings?.maxTweetCharacters || 260);
}

function xAuthStatus(accountId = "") {
  const status = accountId ? accountAuthById(accountId) || {} : state.xStatus ?? {};
  if (!status.configured) {
    return {
      label: "未配置",
      blocked: true,
      warning: false,
      reason: "X token 未配置，只能预览，不能调用 API 发布。"
    };
  }
  if (status.health === "expired_no_refresh") {
    return {
      label: "已过期",
      blocked: true,
      warning: false,
      reason: "X token 已过期且没有 refresh token，请重新运行 npm run x:auth。"
    };
  }
  if (status.health === "expired_refresh_ready") {
    return {
      label: "已过期，可刷新",
      blocked: false,
      warning: true,
      reason: "X token 已过期，但 refresh token 已配置；发布前会自动刷新。"
    };
  }
  if (status.health === "refresh_due") {
    return {
      label: "即将刷新",
      blocked: false,
      warning: true,
      reason: "X token 接近过期；发布前会自动刷新。"
    };
  }
  return {
    label: "已配置",
    blocked: false,
    warning: false,
    reason: "X token 可用。"
  };
}

function renderPublishChecklist(readiness) {
  return `<div class="publish-checklist-card ${readiness.kind}">
    <div class="line-head">
      <strong>${esc(readiness.actionText)}</strong>
      ${pill(readiness.kind === "good" ? "Clear" : readiness.kind === "warn" ? "Review" : "Blocked", readiness.kind)}
    </div>
    <div class="check-list">
      ${readiness.checks.map((item) => `<div class="check-row ${item.ok ? "ok" : "warn"}">
        <span>${esc(item.label)}</span>
        <strong>${esc(item.value)}</strong>
      </div>`).join("")}
    </div>
    ${readiness.blockReasons.length ? `<ul class="publish-reasons">${readiness.blockReasons.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}
    ${readiness.overrideReasons.length ? `<ul class="publish-reasons">${readiness.overrideReasons.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

function updatePublishReview() {
  const form = $("#publishForm");
  const text = form.elements.text?.value ?? "";
  const accountId = form.elements.accountId?.value ?? "";
  const readiness = buildPublishReadiness(state.publishTool, text, accountId);
  const overrideLine = $("#publishOverrideLine");
  const overrideInput = form.elements.overrideChecked;
  const confirmButton = $("#confirmPublishButton");

  $("#publishCount").textContent = `${String(text).trim().length} / 280`;
  $("#publishCount").classList.toggle("bad", String(text).trim().length > 280);
  $("#publishStatus").textContent = readiness.actionText;
  $("#publishAccountSafety").innerHTML = renderAccountSafety(readiness.accountSafety);
  $("#publishChecklist").innerHTML = renderPublishChecklist(readiness);
  overrideLine.hidden = readiness.overrideReasons.length === 0;
  overrideInput.required = readiness.overrideReasons.length > 0;
  if (!readiness.overrideReasons.length) overrideInput.checked = false;
  confirmButton.disabled = readiness.blockReasons.length > 0;
  confirmButton.textContent = readiness.blockReasons.length ? "暂不能发布" : readiness.overrideReasons.length ? "额外确认并发布" : "确认发布";
}

function dataAgeMinutes(generatedAt) {
  const date = new Date(generatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, (Date.now() - date.getTime()) / 60000);
}

function formatDuration(minutes) {
  const rounded = Math.round(Number(minutes));
  if (!Number.isFinite(rounded)) return "未知";
  if (rounded < 60) return `${rounded} 分钟`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours < 24) return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
  const days = Math.floor(hours / 24);
  const dayHours = hours % 24;
  return dayHours ? `${days} 天 ${dayHours} 小时` : `${days} 天`;
}

function formatRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0%";
  return `${(number * 100).toFixed(1)}%`;
}

function maxNumber(values) {
  const numbers = values.map((value) => Number(value)).filter(Number.isFinite);
  return numbers.length ? Math.max(...numbers) : 0;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatAgeDays(value) {
  if (value === null || value === undefined) return "unknown age";
  if (Number(value) <= 0) return "today";
  if (Number(value) === 1) return "1 day old";
  return `${Number(value)} days old`;
}

function defaultCandidateDateTime() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function formatCandidatePublished(value) {
  if (!value) return "发布时间未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function empty(text) {
  return `<p class="empty">${esc(text)}</p>`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("已复制");
  } catch {
    if (legacyCopy(text)) {
      toast("已复制");
    } else {
      toast("复制失败，请手动选中文案复制");
    }
  }
}

function openSearchGroup(button) {
  const urls = JSON.parse(button.dataset.openSearches || "[]");
  urls.slice(0, 6).forEach((url) => window.open(url, "_blank", "noopener,noreferrer"));
  toast(`已打开 ${Math.min(urls.length, 6)} 个搜索页`);
}

function legacyCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

function flashButton(button, text = "已复制") {
  const original = button.textContent;
  button.textContent = text;
  window.setTimeout(() => {
    button.textContent = original;
  }, 1200);
}

async function markPosted(button) {
  openFeedback(button, {
    toolId: button.dataset.posted,
    toolName: button.dataset.tool,
    toolUrl: button.dataset.url,
    sourceDate: state.latest.date,
    variantType: button.dataset.variant,
    accountId: recommendedAccountId((state.latest?.tools ?? []).find((item) => item.toolId === button.dataset.posted)),
    copyText: button.dataset.copytext,
    posted: true,
    metrics: {}
  });
}

function openFeedback(button, existing = null) {
  const form = $("#feedbackForm");
  form.reset();
  const data = existing ?? {
    toolId: button.dataset.feedback,
    toolName: button.dataset.tool,
    toolUrl: button.dataset.url,
    sourceDate: state.latest.date,
    variantType: button.dataset.variant,
    accountId: recommendedAccountId((state.latest?.tools ?? []).find((item) => item.toolId === button.dataset.feedback)),
    copyText: button.dataset.copytext,
    metrics: {}
  };
  const selectedAccountId = data.accountId || recommendedAccountId((state.latest?.tools ?? []).find((item) => item.toolId === data.toolId));
  data.accountId = selectedAccountId;
  $("#feedbackAccountSelect").innerHTML = accountSelectOptions(selectedAccountId);
  for (const key of ["id","toolId","toolName","toolUrl","sourceDate","variantType","accountId","copyText","postedUrl","notes"]) {
    if (form.elements[key]) form.elements[key].value = data[key] ?? "";
  }
  for (const key of ["impressions","likes","bookmarks","replies","reposts","clicks","profileVisits"]) {
    form.elements[key].value = data.metrics?.[key] ?? 0;
  }
  $("#feedbackDialog").showModal();
}

function openPublish(button) {
  const form = $("#publishForm");
  form.reset();
  const text = button.dataset.copytext || "";
  const tool = (state.latest?.tools ?? []).find((item) => item.toolId === button.dataset.publish);
  state.publishTool = tool ?? null;
  const accountId = recommendedAccountId(tool);
  const data = {
    toolId: button.dataset.publish,
    toolName: button.dataset.tool,
    toolUrl: button.dataset.url,
    sourceDate: state.latest?.date ?? "",
    variantType: button.dataset.variant,
    accountId,
    text
  };
  $("#publishAccountSelect").innerHTML = accountSelectOptions(accountId);
  for (const key of ["toolId", "toolName", "toolUrl", "sourceDate", "variantType", "accountId", "text"]) {
    if (form.elements[key]) form.elements[key].value = data[key] ?? "";
  }
  $("#publishRisk").innerHTML = renderPublishRisk(tool, accountId);
  updatePublishReview();
  $("#publishDialog").showModal();
}

function updatePublishCount() {
  updatePublishReview();
}

async function submitFeedback(event) {
  event.preventDefault();
  if (guardReadOnlyAction(event)) return;
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.metrics = {};
  for (const key of ["impressions","likes","bookmarks","replies","reposts","clicks","profileVisits"]) {
    payload.metrics[key] = Number(payload[key] || 0);
    delete payload[key];
  }
  payload.posted = true;
  await api.post("/api/feedback/upsert", payload);
  $("#feedbackDialog").close();
  toast("反馈已保存");
  await loadAll();
}

async function submitPublish(event) {
  event.preventDefault();
  if (guardReadOnlyAction(event)) return;
  try {
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const readiness = buildPublishReadiness(state.publishTool, payload.text, payload.accountId);
    if (readiness.blockReasons.length) throw new Error(readiness.blockReasons[0]);
    if (readiness.overrideReasons.length && payload.overrideChecked !== "on") {
      throw new Error("这条需要额外风险确认后才能发布。");
    }
    payload.confirmed = payload.confirmChecked === "on";
    delete payload.confirmChecked;
    delete payload.overrideChecked;
    const result = await api.post("/api/x/publish", payload);
    $("#publishDialog").close();
    toast(result.url ? `已发布到 X：${result.url}` : "已发布到 X");
    await loadAll();
  } catch (error) {
    toast(error.message);
  }
}

async function addQueue(button) {
  await api.post("/api/queue/upsert", {
    toolId: button.dataset.toolId,
    toolName: button.dataset.tool,
    toolUrl: button.dataset.url,
    sourceDate: state.latest.date,
    type: button.dataset.queue,
    priorityScore: Number(button.dataset.priority || 10),
    reason: button.dataset.reason || "Dashboard 手动加入"
  });
  toast("已加入队列");
  await loadAll();
}

async function generateReview(toolName) {
  const result = await api.post("/api/review-outline/generate", { toolName });
  await copyText(result.markdown);
  toast(`大纲已生成：${result.filePath}`);
  await loadAll();
}

async function addAffiliate(button) {
  await api.post("/api/affiliate-research/upsert", {
    toolName: button.dataset.affiliate,
    toolUrl: button.dataset.url,
    affiliateScore: Number(button.dataset.score || 0),
    status: "not_started"
  });
  toast("已加入联盟研究");
  await loadAll();
}

async function submitAffiliateResearch(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.affiliateScore = Number(payload.affiliateScore || 0);
  await api.post("/api/affiliate-research/upsert", payload);
  form.reset();
  toast("联盟研究记录已保存");
  await loadAll();
}

async function submitCandidate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  if (payload.published) payload.published = new Date(payload.published).toISOString();
  await api.post("/api/candidate-inbox/upsert", payload);
  state.candidatePreview = null;
  form.reset();
  toast("候选已保存，刷新 Live Feed 后会参与评分");
  await loadAll();
}

async function submitCandidatePaste(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  const result = await api.post("/api/candidate-inbox/import-paste", payload);
  state.candidatePreview = null;
  form.reset();
  toast(`已导入 ${result.imported} 个候选，跳过 ${result.skipped ?? 0} 个${result.errors?.length ? `，${result.errors.length} 行解析跳过` : ""}`);
  await loadAll();
}

async function previewCandidatePaste(formId) {
  const form = document.getElementById(formId);
  if (!form) throw new Error("candidate paste form not found");
  const payload = Object.fromEntries(new FormData(form).entries());
  state.candidatePreview = await api.post("/api/candidate-inbox/preview-paste", payload);
  renderActiveView();
  toast(`已预览 ${state.candidatePreview.previews.length} 个候选`);
}

async function submitFeedbackCsv(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const csv = new FormData(form).get("csv");
  const result = await api.post("/api/feedback/import-csv", { csv });
  state.feedbackPreview = null;
  form.reset();
  toast(`已导入 ${result.imported} 条反馈${result.errors?.length ? `，${result.errors.length} 行跳过` : ""}`);
  await loadAll();
}

async function previewFeedbackCsv(formId) {
  const form = document.getElementById(formId);
  if (!form) throw new Error("feedback CSV form not found");
  const csv = new FormData(form).get("csv");
  state.feedbackPreview = await api.post("/api/feedback/preview-csv", { csv });
  renderActiveView();
  toast(`已预览 ${state.feedbackPreview.previews.length} 条反馈`);
}

async function runDaily() {
  if (guardReadOnlyAction()) {
    state.dailyRun = { running: false, message: readOnlyActionMessage() };
    render();
    return;
  }
  if (state.dailyRun.running) return;
  state.dailyRun = { running: true, message: "正在从 Product Hunt live feed 刷新..." };
  render();
  try {
    const result = await api.post("/api/daily/run", {});
    state.dailyRun = {
      running: false,
      message: `刷新完成：${result.latestDate ?? "unknown"} · ${result.topPicks ?? 0} 个候选${result.usedFallback ? " · 使用 fallback" : ""}`
    };
    toast("Live feed 已刷新");
    await loadAll();
  } catch (error) {
    state.dailyRun = { running: false, message: `刷新失败：${error.message}` };
    render();
    toast(error.message);
  }
}

function buildClientTodayPlanMarkdown() {
  const latest = state.latest ?? {};
  const actions = latest.actionList ?? [];
  const tools = latest.tools ?? [];
  const lines = [
    `# Today Plan — ${latest.date ?? "unknown"}`,
    "",
    "## Action List",
    actions.length ? actions.map((action, index) => `${index + 1}. ${action.type}: ${action.toolName ?? "N/A"} — ${action.reason ?? ""}`).join("\n") : "No action list available.",
    "",
    "## Top Picks",
    tools.slice(0, 5).map((tool, index) => `${index + 1}. ${tool.name} — score ${tool.score ?? "-"} — ${tool.followUpAction ?? ""}`).join("\n") || "No tools available.",
    "",
    isReadOnlyMode() ? "Generated in static read-only mode. Run `npm start` locally for refresh, feedback, publishing, and file exports." : "Generated from the local Dashboard."
  ];
  return lines.join("\n");
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  setTimeout(() => node.classList.remove("show"), 1800);
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
function attr(value) { return esc(value).replace(/`/g, "&#96;"); }

document.addEventListener("click", async (event) => {
  const button = event.target.closest("button, a");
  if (!button) return;
  try {
    if (button.matches(writeActionSelector) && guardReadOnlyAction(event)) return;
    if (button.dataset.tab) {
      switchTab(button.dataset.tab);
    } else if (button.dataset.tabJump) {
      switchTab(button.dataset.tabJump);
    } else if (button.dataset.copy) {
      await copyText(button.dataset.copy);
      flashButton(button);
    } else if (button.dataset.openSearches) {
      openSearchGroup(button);
    } else if (button.dataset.runDaily !== undefined) {
      await runDaily();
    } else if (button.dataset.previewCandidates) {
      await previewCandidatePaste(button.dataset.previewCandidates);
    } else if (button.dataset.previewFeedback) {
      await previewFeedbackCsv(button.dataset.previewFeedback);
    } else if (button.dataset.publish) {
      openPublish(button);
    } else if (button.dataset.posted) {
      await markPosted(button);
    } else if (button.dataset.feedback) {
      openFeedback(button);
    } else if (button.dataset.editFeedback) {
      openFeedback(button, state.feedback.entries.find((entry) => entry.id === button.dataset.editFeedback));
    } else if (button.dataset.queue) {
      await addQueue(button);
    } else if (button.dataset.queueStatus) {
      await api.post("/api/queue/status", { id: button.dataset.queueStatus, status: button.dataset.status });
      toast("队列状态已更新");
      await loadAll();
    } else if (button.dataset.candidateStatus) {
      await api.post("/api/candidate-inbox/status", { id: button.dataset.candidateStatus, status: button.dataset.status });
      toast("候选状态已更新");
      await loadAll();
    } else if (button.dataset.affiliate) {
      await addAffiliate(button);
    } else if (button.dataset.affStatus) {
      await api.post("/api/affiliate-research/upsert", { id: button.dataset.affStatus, toolName: button.dataset.tool, toolUrl: button.dataset.url, status: button.dataset.status });
      toast("联盟研究状态已更新");
      await loadAll();
    } else if (button.dataset.review) {
      await generateReview(button.dataset.review);
    }
  } catch (error) {
    toast(error.message);
  }
});

document.addEventListener("submit", async (event) => {
  if (!["affiliateForm", "feedbackCsvForm", "candidateForm", "candidatePasteForm"].includes(event.target?.id)) return;
  if (guardReadOnlyAction(event)) return;
  try {
    if (event.target.id === "affiliateForm") await submitAffiliateResearch(event);
    if (event.target.id === "feedbackCsvForm") await submitFeedbackCsv(event);
    if (event.target.id === "candidateForm") await submitCandidate(event);
    if (event.target.id === "candidatePasteForm") await submitCandidatePaste(event);
  } catch (error) {
    toast(error.message);
  }
});

$("#feedbackForm").addEventListener("submit", submitFeedback);
$("#cancelFeedback").addEventListener("click", () => $("#feedbackDialog").close());
$("#publishForm").addEventListener("submit", submitPublish);
$("#publishForm").elements.text.addEventListener("input", updatePublishCount);
$("#publishForm").elements.accountId.addEventListener("change", () => {
  $("#publishRisk").innerHTML = renderPublishRisk(state.publishTool, $("#publishForm").elements.accountId.value);
  updatePublishReview();
});
$("#cancelPublish").addEventListener("click", () => $("#publishDialog").close());
$("#refreshButton").addEventListener("click", loadAll);
$("#copyPlanButton").addEventListener("click", async () => {
  try {
    if (isReadOnlyMode()) {
      await copyText(buildClientTodayPlanMarkdown());
      toast("已复制静态今日计划");
      return;
    }
    const result = await api.post("/api/export/today-plan", {});
    await copyText(result.markdown);
  } catch (error) {
    await copyText(buildClientTodayPlanMarkdown());
    toast(`已复制当前页面计划：${error.message}`);
  }
});
$("#weeklyButton").addEventListener("click", async () => {
  if (guardReadOnlyAction()) return;
  try {
    const result = await api.post("/api/weekly/generate", {});
    state.tab = "weekly";
    $$(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === "weekly"));
    await loadAll();
    toast(`周报已生成：${result.filePath}`);
  } catch (error) {
    toast(error.message);
  }
});
$("#themeButton").addEventListener("click", () => {
  const current = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = current;
  localStorage.setItem("theme", current);
});
for (const [selector, key] of [["#searchInput", "search"], ["#actionFilter", "action"], ["#affiliateFilter", "affiliate"], ["#stateFilter", "state"], ["#minScore", "minScore"], ["#sortBy", "sortBy"]]) {
  const updateFilter = (event) => {
    state.filters[key] = event.target.value;
    if (["tools", "copy"].includes(state.tab)) renderActiveView();
  };
  $(selector).addEventListener("input", updateFilter);
  $(selector).addEventListener("change", updateFilter);
}
document.documentElement.dataset.theme = localStorage.getItem("theme") || "";
loadAll();
