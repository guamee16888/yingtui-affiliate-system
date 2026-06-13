const state = {
  workspaceId: new URLSearchParams(location.search).get("workspaceId") || "",
  userId: new URLSearchParams(location.search).get("userId") || "",
  status: "all",
  data: null
};

const $ = (selector) => document.querySelector(selector);

$("#refreshButton").addEventListener("click", () => loadStaff());
$("#userSelect").addEventListener("change", (event) => {
  state.userId = event.target.value;
  const url = new URL(location.href);
  if (state.workspaceId) url.searchParams.set("workspaceId", state.workspaceId);
  url.searchParams.set("userId", state.userId);
  history.replaceState({}, "", url);
  loadStaff();
});
$("#statusFilter").addEventListener("change", (event) => {
  state.status = event.target.value;
  render();
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const taskId = button.dataset.taskId;
  const action = button.dataset.action;
  const task = state.data?.tasks.find((item) => item.taskId === taskId);
  if (!task) return;
  try {
    if (action === "copy-text") {
      await navigator.clipboard.writeText(task.copyText);
      if (isReadOnlyMode()) {
        toast("已复制文案。线上只读快照不记录 copied 状态。");
        return;
      }
      await updateTask(taskId, "copy");
      toast("已复制，并记录为 copied");
      return;
    }
    if (action === "copy") {
      await updateTask(taskId, "copy");
      toast("已记录为 copied");
      return;
    }
    if (action === "posted") {
      const postedUrl = prompt("粘贴 X post URL（可以先留空，之后补反馈时再填）：", task.postedUrl || "");
      if (postedUrl === null) return;
      await updateTask(taskId, "posted", { postedUrl: postedUrl.trim() });
      toast("已记录为手动发布，进入待补反馈");
      return;
    }
    if (action === "skip") {
      const reason = prompt("跳过原因（可选）：", "");
      if (reason === null) return;
      await updateTask(taskId, "skip", { reason: reason.trim() });
      toast("已跳过该任务");
    }
  } catch (error) {
    toast(error.message);
  }
});

await loadStaff();

async function loadStaff() {
  try {
    $("#statusText").textContent = "读取中心任务池中...";
    const query = new URLSearchParams();
    if (state.workspaceId) query.set("workspaceId", state.workspaceId);
    if (state.userId) query.set("userId", state.userId);
    const suffix = query.toString() ? `?${query}` : "";
    const json = await apiGet(`/api/staff/summary${suffix}`);
    state.data = json;
    state.workspaceId = json.selectedWorkspace?.workspaceId || state.workspaceId;
    state.userId = json.selectedUser?.userId || "";
    updateUrl();
    render();
  } catch (error) {
    $("#statusText").textContent = `读取失败：${error.message}`;
    toast(error.message);
  }
}

async function updateTask(taskId, action, extra = {}) {
  const json = await apiPost("/api/staff/task", {
    taskId,
    action,
    workspaceId: state.workspaceId,
    userId: state.userId,
    ...extra
  });
  state.data = json.summary;
  render();
}

function render() {
  if (!state.data) return;
  renderModeBanner();
  if (!state.data.accessAllowed) {
    $("#statusText").textContent = state.data.accessError || "当前员工没有权限查看这个 workspace";
    renderUsers();
    $("#metrics").innerHTML = "";
    $("#feedbackAlert").innerHTML = "";
    $("#accounts").innerHTML = `<div class="empty">${esc(state.data.accessError || "没有权限")}</div>`;
    $("#tasks").innerHTML = "";
    return;
  }
  const readOnlySuffix = isReadOnlyMode() ? " · 线上只读快照" : "";
  $("#statusText").textContent = `${state.data.selectedWorkspace?.name || "Workspace"} · ${state.data.selectedUser?.name || "员工"} · ${state.data.summary.ready} 条可复制 · ${state.data.summary.feedbackDue} 条待补反馈${readOnlySuffix}`;
  renderUsers();
  renderMetrics();
  renderFeedbackAlert();
  renderAccounts();
  renderTasks();
}

function renderUsers() {
  $("#userSelect").innerHTML = state.data.users.map((user) => `
    <option value="${esc(user.userId)}" ${user.userId === state.userId ? "selected" : ""}>${esc(user.name)} (${esc(user.role)})</option>
  `).join("");
}

function updateUrl() {
  const url = new URL(location.href);
  if (state.workspaceId) url.searchParams.set("workspaceId", state.workspaceId);
  if (state.userId) url.searchParams.set("userId", state.userId);
  history.replaceState({}, "", url);
}

function renderMetrics() {
  const metrics = [
    ["账号", state.data.summary.accounts],
    ["任务", state.data.summary.totalTasks],
    ["可复制", state.data.summary.ready],
    ["已复制", state.data.summary.copied],
    ["待反馈", state.data.summary.feedbackDue],
    ["超 280", state.data.summary.overLimit]
  ];
  $("#metrics").innerHTML = metrics.map(([label, value]) => `
    <div class="metric"><span>${esc(label)}</span><strong>${Number(value || 0)}</strong></div>
  `).join("");
}

function renderAccounts() {
  const accounts = state.data.accounts;
  $("#accounts").innerHTML = accounts.length
    ? `<div class="account-list">${accounts.map((account) => `
      <div class="account">
        <strong>${esc(account.persona || account.accountId)}</strong>
        <span>${esc(account.accountId)} · ${esc(account.status)}</span>
        <span>${esc(account.niche || "No niche")}</span>
        <span>${Number(account.dailyPostLimit || 0)}/day · ${Number(account.externalLinkLimit || 0)} link/day</span>
      </div>
    `).join("")}</div>`
    : `<div class="empty">这个员工还没有分配账号。</div>`;
}

function renderFeedbackAlert() {
  const feedbackDue = (state.data.tasks || []).filter((task) => task.status === "feedback_due");
  const host = $("#feedbackAlert");
  if (!feedbackDue.length) {
    host.innerHTML = "";
    return;
  }
  const oldest = feedbackDue
    .map((task) => task.feedbackDueAt || task.postedAt)
    .filter(Boolean)
    .sort()[0];
  host.innerHTML = `<section class="feedback-alert">
    <div>
      <p class="eyebrow">Feedback debt</p>
      <h2>先补 ${esc(feedbackDue.length)} 条 X Analytics</h2>
      <p class="muted">这些任务已经发出或被系统标记为待反馈。先补 impressions、likes、bookmarks、clicks，再继续发新内容。</p>
    </div>
    <div class="feedback-alert-actions">
      <span>${oldest ? `最早待补：${esc(formatDateTime(oldest))}` : "待补时间未知"}</span>
      <a class="button" href="/dashboard/?tab=feedback">打开反馈录入</a>
    </div>
  </section>`;
}

function renderTasks() {
  const tasks = filteredTasks();
  $("#tasks").innerHTML = tasks.length
    ? tasks.map(renderTask).join("")
    : `<div class="empty">当前筛选下没有任务。</div>`;
}

function filteredTasks() {
  const tasks = state.data.tasks || [];
  if (state.status === "ready") return tasks.filter((task) => task.canCopy);
  if (state.status === "copied") return tasks.filter((task) => task.status === "copied");
  if (state.status === "feedback_due") return tasks.filter((task) => task.status === "feedback_due");
  if (state.status === "blocked") return tasks.filter((task) => task.blockReasons.length);
  return tasks;
}

function renderTask(task) {
  const length = task.tweetLength;
  const lengthClass = length.status === "over_limit" ? "bad" : length.status === "near_limit" || length.status === "watch" ? "warn" : "good";
  const cardClass = task.blockReasons.length ? " blocked" : task.status === "feedback_due" ? " feedback" : "";
  return `
    <article class="task-card${cardClass}">
      <div class="task-top">
        <div>
          <h3 class="task-title">${esc(task.toolName)}</h3>
          <div class="muted">${esc(task.accountName)} · ${esc(task.accountId)}</div>
        </div>
        <a class="button secondary" href="${esc(task.toolUrl)}" target="_blank" rel="noreferrer">打开来源</a>
      </div>
      <div class="badges">
        ${badge(task.status, task.status === "feedback_due" ? "warn" : "")}
        ${badge(task.approvalStatus, task.approvalStatus === "rejected" ? "bad" : task.approvalStatus === "approved" ? "good" : "")}
        ${badge(`${length.weightedCharCount}/280`, lengthClass)}
        ${badge(task.publishMode || "manual", task.systemManaged ? "warn" : "")}
        ${badge(task.variantType)}
        ${task.riskLevel ? badge(`risk ${task.riskLevel}`, task.riskLevel === "block" ? "bad" : task.riskLevel === "medium" ? "warn" : "good") : ""}
      </div>
      <div class="copy-box">${esc(task.copyText)}</div>
      ${task.status === "feedback_due" ? `<div class="feedback-due-box">
        <strong>待补反馈</strong>
        <span>去 Dashboard 反馈录入页补真实 X Analytics。补完后系统才知道这个账号和角度是否值得继续。</span>
        <a class="button secondary" href="/dashboard/?tab=feedback">补反馈</a>
      </div>` : ""}
      ${task.systemManaged && task.status !== "feedback_due" ? `<div class="system-managed-box">
        <strong>系统发布队列任务</strong>
        <span>${esc(task.publishMode)} 模式由 Manager/Dashboard 发布队列处理，员工端只读，避免重复手动发布。</span>
      </div>` : ""}
      ${task.blockReasons.length ? `<div class="badges">${task.blockReasons.map((reason) => badge(reason, "bad")).join("")}</div>` : ""}
      ${task.postedUrl ? `<p class="muted">已发：<a href="${esc(task.postedUrl)}" target="_blank" rel="noreferrer">${esc(task.postedUrl)}</a></p>` : ""}
      <div class="task-actions">
        <button class="button" data-action="copy-text" data-task-id="${esc(task.taskId)}" ${task.canCopy ? "" : "disabled"} type="button">${isReadOnlyMode() ? "复制文案" : "复制并记录"}</button>
        <button class="button secondary" data-action="copy" data-task-id="${esc(task.taskId)}" ${task.canCopy && !isReadOnlyMode() ? "" : "disabled"} type="button">只记录已复制</button>
        <button class="button secondary" data-action="posted" data-task-id="${esc(task.taskId)}" ${task.canMarkPosted && !isReadOnlyMode() ? "" : "disabled"} type="button">手动已发</button>
        <button class="button secondary" data-action="skip" data-task-id="${esc(task.taskId)}" ${task.canSkip && !isReadOnlyMode() ? "" : "disabled"} type="button">跳过</button>
      </div>
    </article>
  `;
}

function badge(text, type = "") {
  return `<span class="badge ${type}">${esc(text)}</span>`;
}

async function apiGet(path) {
  const res = await fetch(path);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || `GET ${path} failed`);
  return json.data;
}

async function apiPost(path, body) {
  if (isReadOnlyMode()) throw new Error(readOnlyActionMessage());
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || `POST ${path} failed`);
  return json.data;
}

function isReadOnlyMode() {
  return Boolean(state.data?.deployment?.readOnly);
}

function readOnlyActionMessage() {
  return state.data?.deployment?.note || "演示环境不支持写入，请在私有管理端操作。";
}

function renderModeBanner() {
  const banner = $("#modeBanner");
  if (!banner) return;
  banner.hidden = !isReadOnlyMode();
  if (!isReadOnlyMode()) {
    banner.innerHTML = "";
    return;
  }
  banner.innerHTML = `<strong>只读演示模式</strong> 当前是公开演示环境，只能查看和复制，不能保存审核、反馈或发布。真实运营请使用私有服务端。`;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "未知";
  return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
