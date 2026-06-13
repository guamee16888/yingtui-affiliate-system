const params = new URLSearchParams(location.search);
const state = {
  workspaceId: params.get("workspaceId") || "",
  managerUserId: params.get("managerUserId") || "",
  activeTab: params.get("tab") || "overview",
  status: "all",
  data: null,
  selectedTaskIds: new Set()
};

const $ = (selector) => document.querySelector(selector);

const tabs = [
  { id: "overview", label: "今日总览" },
  { id: "tasks", label: "任务审核" },
  { id: "accounts", label: "账号池" },
  { id: "staff", label: "员工与分配" },
  { id: "publish", label: "发布队列" },
  { id: "feedback", label: "反馈欠账" },
  { id: "lanes", label: "内容线" },
  { id: "risks", label: "风险面板" },
  { id: "settings", label: "管理端设置" }
];

const rejectTemplates = [
  { value: "", label: "选择拒绝模板" },
  { value: "Too generic for this workspace. Needs a sharper niche pain point.", label: "太泛，不够垂直" },
  { value: "Duplicate or too similar to recent account content. Hold for a different angle.", label: "重复风险，换角度" },
  { value: "Not fresh enough for today. Better for watchlist or long-form research.", label: "不够新鲜" },
  { value: "Overly promotional. Rewrite with a more personal observation.", label: "广告味太重" },
  { value: "Needs source verification before staff can post it.", label: "来源需核验" }
];

$("#refreshButton").addEventListener("click", () => loadManager());
$("#workspaceSelect").addEventListener("change", (event) => {
  state.workspaceId = event.target.value;
  updateUrl();
  loadManager();
});
$("#managerSelect").addEventListener("change", (event) => {
  state.managerUserId = event.target.value;
  updateUrl();
  loadManager();
});

document.addEventListener("click", async (event) => {
  const tabButton = event.target.closest("[data-tab]");
  if (tabButton) {
    state.activeTab = tabButton.dataset.tab;
    updateUrl();
    render();
    return;
  }

  const copyButton = event.target.closest("[data-copy-detail]");
  if (copyButton) {
    const task = taskById(copyButton.dataset.taskId);
    if (!task) return;
    const value = copyButton.dataset.copyDetail === "copyText" ? task.copyText : task.taskId;
    await navigator.clipboard.writeText(value || "");
    toast(copyButton.dataset.copyDetail === "copyText" ? "已复制文案" : "已复制任务 ID");
    return;
  }

  const accountFilter = event.target.closest("[data-account-filter]");
  if (accountFilter) {
    state.activeTab = "tasks";
    state.status = "all";
    render();
    const accountId = accountFilter.dataset.accountFilter;
    for (const task of state.data.tasks || []) {
      if (task.accountId === accountId) state.selectedTaskIds.add(task.taskId);
    }
    render();
    return;
  }

  const batchButton = event.target.closest("[data-batch-action]");
  if (batchButton) {
    try {
      await applyBatch(batchButton.dataset.batchAction);
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  const button = event.target.closest("[data-action]");
  if (!button) return;
  const taskId = button.dataset.taskId;
  const action = button.dataset.action;
  const task = taskById(taskId);
  if (!task) return;

  try {
    if (action === "assign") {
      await updateTask(taskId, "assign", currentAssignment(taskId));
      toast("分配已保存");
      return;
    }
    if (action === "approve") {
      await updateTask(taskId, "approve", currentAssignment(taskId));
      toast("已批准，员工端可继续执行");
      return;
    }
    if (action === "reject") {
      const reason = prompt("拒绝原因（可选）：", currentRejectReason());
      if (reason === null) return;
      await updateTask(taskId, "reject", { reason: reason.trim() });
      toast("已拒绝，任务回到 draft");
    }
  } catch (error) {
    toast(error.message);
  }
});

document.addEventListener("change", (event) => {
  const input = event.target.closest("[data-select-task], [data-select-all], [data-status-filter]");
  if (!input) return;
  if (input.dataset.statusFilter !== undefined) {
    state.status = input.value;
    renderTasks();
    return;
  }
  if (input.dataset.selectAll !== undefined) {
    for (const task of filteredTasks()) {
      if (canBatchSelect(task)) {
        if (input.checked) state.selectedTaskIds.add(task.taskId);
        else state.selectedTaskIds.delete(task.taskId);
      }
    }
    renderTasks();
    return;
  }
  if (input.checked) state.selectedTaskIds.add(input.dataset.taskId);
  else state.selectedTaskIds.delete(input.dataset.taskId);
  renderBatchBar();
});

await loadManager();

async function loadManager() {
  try {
    $("#statusText").textContent = "读取 workspace 管理数据中...";
    const query = new URLSearchParams();
    if (state.workspaceId) query.set("workspaceId", state.workspaceId);
    if (state.managerUserId) query.set("managerUserId", state.managerUserId);
    const json = await apiGet(`/api/manager/summary${query.toString() ? `?${query}` : ""}`);
    state.data = json;
    state.workspaceId = json.selectedWorkspace?.workspaceId || "";
    state.managerUserId = json.selectedManager?.userId || "";
    updateUrl();
    render();
  } catch (error) {
    $("#statusText").textContent = `读取失败：${error.message}`;
    toast(error.message);
  }
}

async function updateTask(taskId, action, extra = {}) {
  const endpoint = action === "approve"
    ? "/api/manager/task/approve"
    : action === "reject"
      ? "/api/manager/task/reject"
      : "/api/manager/task";
  state.data = await apiPost(endpoint, {
    taskId,
    action,
    workspaceId: state.workspaceId,
    managerUserId: state.managerUserId,
    ...extra
  }).then((json) => json.summary || json);
  state.selectedTaskIds.clear();
  render();
}

function render() {
  if (!state.data) return;
  renderSelectors();
  renderTabs();
  renderModeBanner();
  if (!state.data.accessAllowed) {
    $("#statusText").textContent = state.data.accessError || "当前主管没有权限查看这个 workspace";
    $("#metrics").innerHTML = "";
    $("#managerView").innerHTML = `<section class="panel"><h2>没有权限</h2><p class="muted">${esc(state.data.accessError || "请切换 workspace 或 manager。")}</p></section>`;
    return;
  }

  const workspace = state.data.selectedWorkspace;
  const summary = state.data.summary;
  const readOnlySuffix = isReadOnlyMode() ? " · 线上只读快照" : "";
  $("#statusText").textContent = `${workspace?.name || "Workspace"} · ${workspace?.workspaceId || ""} · ${summary.pendingReview} 条待审核 · ${summary.feedbackDebt} 条待反馈${readOnlySuffix}`;
  $("#staffLink").href = `/staff/?workspaceId=${encodeURIComponent(state.workspaceId)}&userId=${encodeURIComponent(state.managerUserId)}`;
  renderMetrics();
  const renderer = {
    overview: renderOverview,
    tasks: renderTasksView,
    accounts: renderAccounts,
    staff: renderStaff,
    publish: renderPublishJobs,
    feedback: renderFeedbackDebt,
    lanes: renderLanes,
    risks: renderRisks,
    settings: renderSettings
  }[state.activeTab] || renderOverview;
  renderer();
}

function renderSelectors() {
  $("#workspaceSelect").innerHTML = (state.data?.workspaces || []).map((workspace) => `
    <option value="${attr(workspace.workspaceId)}" ${workspace.workspaceId === state.workspaceId ? "selected" : ""}>${esc(workspace.name)}</option>
  `).join("");
  $("#managerSelect").innerHTML = (state.data?.managers || []).map((manager) => `
    <option value="${attr(manager.userId)}" ${manager.userId === state.managerUserId ? "selected" : ""}>${esc(manager.name)} (${esc(manager.role)})</option>
  `).join("");
}

function renderTabs() {
  $("#managerTabs").innerHTML = tabs.map((tab) => `
    <button class="manager-tab ${state.activeTab === tab.id ? "active" : ""}" data-tab="${attr(tab.id)}" type="button">${esc(tab.label)}</button>
  `).join("");
}

function renderMetrics() {
  const summary = state.data.summary || {};
  const workspace = state.data.selectedWorkspace || {};
  const metrics = [
    ["账号", `${summary.accounts || 0}/${summary.accountLimit || workspace.accountLimit || 0}`],
    ["今日任务", summary.totalTasks],
    ["待审核", summary.pendingReview],
    ["已发布", state.data.overview?.published || 0],
    ["待反馈", summary.feedbackDebt],
    ["风险", summary.blockedRisk]
  ];
  $("#metrics").innerHTML = metrics.map(([label, value]) => `
    <div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>
  `).join("");
}

function renderOverview() {
  const overview = state.data.overview || {};
  $("#managerView").innerHTML = `
    <section class="manager-grid">
      <article class="panel span-2">
        <div class="panel-head">
          <div>
            <h2>今日总览</h2>
            <p class="muted">10 秒内看清今天有没有卡点。</p>
          </div>
          ${badge(`${overview.completionRate || 0}% 完成率`, overview.completionRate >= 70 ? "good" : "warn")}
        </div>
        <div class="compact-metrics">
          ${miniMetric("任务总数", overview.totalTasks)}
          ${miniMetric("待审核", overview.pendingReview)}
          ${miniMetric("已批准", overview.approved)}
          ${miniMetric("已分配", overview.assigned)}
          ${miniMetric("已复制", overview.copied)}
          ${miniMetric("已发布", overview.published)}
          ${miniMetric("待反馈", overview.feedbackDue)}
          ${miniMetric("已跳过", overview.skipped)}
          ${miniMetric("blocked 风险", overview.blocked)}
        </div>
      </article>
      <article class="panel">
        <h2>发布队列状态</h2>
        <div class="resource-list">
          ${resource("队列总数", overview.publishQueue?.total ?? 0)}
          ${resource("可 dry-run", overview.publishQueue?.ready ?? 0)}
          ${resource("blocked/failed", overview.publishQueue?.blocked ?? 0)}
        </div>
        <p class="muted">Live publish 当前关闭，需要平台总后台开启。</p>
      </article>
      <article class="panel">
        <h2>员工完成率</h2>
        <strong class="hero-number">${esc(overview.staffCompletionRate || 0)}%</strong>
        <p class="muted">来自当前 workspace 的员工任务。</p>
      </article>
      <article class="panel span-2">
        <h2>账号发布情况</h2>
        <div class="table-like">
          ${(overview.accountPosting || []).map((account) => `
            <div class="row">
              <strong>${esc(account.persona)}</strong>
              <span>${esc(account.todayTasks)} 任务</span>
              <span>${esc(account.todayPublished)} 已发</span>
              <span>${esc(account.feedbackDue)} 待反馈</span>
            </div>
          `).join("") || empty("暂无账号数据")}
        </div>
      </article>
    </section>
  `;
}

function renderTasksView() {
  $("#managerView").innerHTML = `
    <section class="panel task-panel">
      <div class="panel-head">
        <div>
          <h2>任务审核</h2>
          <p class="muted">这里只审核当前 workspace 的任务。批准后进入员工端，不直接 live publish。</p>
        </div>
        <select data-status-filter aria-label="任务状态">
          <option value="all" ${state.status === "all" ? "selected" : ""}>全部</option>
          <option value="pending" ${state.status === "pending" ? "selected" : ""}>待审核</option>
          <option value="approved" ${state.status === "approved" ? "selected" : ""}>已批准</option>
          <option value="rejected" ${state.status === "rejected" ? "selected" : ""}>已拒绝</option>
          <option value="unassigned" ${state.status === "unassigned" ? "selected" : ""}>未分配</option>
          <option value="blocked" ${state.status === "blocked" ? "selected" : ""}>不可批</option>
        </select>
      </div>
      <div id="batchBar" class="batch-bar"></div>
      <div id="tasks" class="task-list"></div>
    </section>
  `;
  renderTasks();
}

function renderTasks() {
  const tasks = filteredTasks();
  const visibleIds = new Set(tasks.map((task) => task.taskId));
  for (const taskId of [...state.selectedTaskIds]) {
    if (!visibleIds.has(taskId)) state.selectedTaskIds.delete(taskId);
  }
  renderBatchBar();
  $("#tasks").innerHTML = tasks.length ? tasks.map(renderTask).join("") : empty("当前筛选下没有任务。");
}

function filteredTasks() {
  const tasks = state.data.tasks || [];
  if (state.status === "pending") return tasks.filter((task) => task.approvalStatus === "pending" || task.status === "pending_review");
  if (state.status === "approved") return tasks.filter((task) => task.approvalStatus === "approved");
  if (state.status === "rejected") return tasks.filter((task) => task.approvalStatus === "rejected");
  if (state.status === "unassigned") return tasks.filter((task) => !task.accountId || !task.assignedTo);
  if (state.status === "blocked") return tasks.filter((task) => task.blockReasons?.length);
  return tasks;
}

function renderTask(task) {
  const length = task.tweetLength || {};
  const lengthClass = length.status === "over_limit" ? "bad" : length.status === "near_limit" || length.status === "watch" ? "warn" : "good";
  const cardClass = task.blockReasons?.length ? " blocked" : task.canApprove ? " ready" : "";
  return `
    <article class="task-card${cardClass}">
      <div class="task-top">
        <label class="task-check">
          <input type="checkbox" data-select-task data-task-id="${attr(task.taskId)}" ${state.selectedTaskIds.has(task.taskId) ? "checked" : ""} ${canBatchSelect(task) ? "" : "disabled"}>
          <div>
            <h3 class="task-title">${esc(task.toolName)}</h3>
            <span class="muted">${esc(task.laneId || "no lane")} · ${esc(task.accountName)} · ${esc(task.assignedToName)}</span>
          </div>
        </label>
        ${task.toolUrl ? `<a class="button secondary" href="${attr(task.toolUrl)}" target="_blank" rel="noreferrer">打开来源</a>` : ""}
      </div>
      <div class="badges">
        ${badge(task.status, task.status === "draft" ? "warn" : task.status === "assigned" ? "good" : "")}
        ${badge(task.approvalStatus, task.approvalStatus === "rejected" ? "bad" : task.approvalStatus === "approved" ? "good" : "")}
        ${badge(`${task.weightedCharCount || length.weightedCharCount || 0}/280`, lengthClass)}
        ${badge(task.publishMode || "manual")}
        ${task.riskLevel ? badge(`risk ${task.riskLevel}`, task.riskLevel === "block" ? "bad" : task.riskLevel === "medium" ? "warn" : "good") : ""}
      </div>
      <div class="assignment-grid">
        <label class="field">
          <span>账号</span>
          <select data-field="account" data-task-id="${attr(task.taskId)}" ${task.canAssign ? "" : "disabled"}>${accountOptions(task.accountId)}</select>
        </label>
        <label class="field">
          <span>员工</span>
          <select data-field="staff" data-task-id="${attr(task.taskId)}" ${task.canAssign ? "" : "disabled"}>${staffOptions(task.assignedTo)}</select>
        </label>
      </div>
      <div class="copy-box">${esc(task.copyText)}</div>
      ${renderTaskDetail(task)}
      ${task.blockReasons?.length ? `<div class="badges">${task.blockReasons.map((reason) => badge(reason, "bad")).join("")}</div>` : ""}
      <div class="task-actions">
        <button class="button secondary" data-action="assign" data-task-id="${attr(task.taskId)}" ${task.canAssign && !isReadOnlyMode() ? "" : "disabled"} type="button">保存分配</button>
        <button class="button" data-action="approve" data-task-id="${attr(task.taskId)}" ${task.canApprove && !isReadOnlyMode() ? "" : "disabled"} type="button">批准</button>
        <button class="button danger" data-action="reject" data-task-id="${attr(task.taskId)}" ${task.canReject && !isReadOnlyMode() ? "" : "disabled"} type="button">拒绝</button>
      </div>
    </article>
  `;
}

function renderTaskDetail(task) {
  const duplicateFlags = task.duplicateCheckResult?.flags ?? task.duplicateFlags ?? [];
  const riskFlags = task.riskFlags ?? [];
  return `<details class="task-detail">
    <summary>查看详情 / 风险原因</summary>
    <div class="detail-grid">
      ${detailItem("taskId", task.taskId)}
      ${detailItem("workspaceId", task.workspaceId)}
      ${detailItem("laneId", task.laneId || "none")}
      ${detailItem("sourceCandidateId", task.sourceCandidateId || "none")}
      ${detailItem("account", `${task.accountName || task.accountId || "none"} (${task.accountId || "none"})`)}
      ${detailItem("assigned staff", `${task.assignedToName || task.assignedTo || "none"} (${task.assignedTo || "none"})`)}
      ${detailItem("weightedCharCount", `${task.weightedCharCount ?? task.tweetLength?.weightedCharCount ?? 0}/280`)}
      ${detailItem("fitsTweetLimit", task.fitsTweetLimit ? "yes" : "no")}
      ${detailItem("publishMode", task.publishMode || "manual")}
      ${detailItem("approvalStatus", task.approvalStatus || "pending")}
      ${detailItem("linkPolicy", task.linkPolicy || "no_link")}
      ${detailItem("copyId", task.copyId || "none")}
      ${detailItem("toolId", task.toolId || "none")}
      ${detailItem("topicId", task.topicId || "none")}
      ${detailItem("postedUrl", task.postedUrl || "none")}
    </div>
    <div class="detail-block">
      <strong>为什么可以批准</strong>
      <ul>${(task.approvalReasons ?? []).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>还有阻断项，暂不建议批准。</li>"}</ul>
    </div>
    <div class="detail-block">
      <strong>为什么阻断 / 风险</strong>
      <ul>${[...(task.blockReasons ?? []), ...duplicateFlags.map((flag) => flag.message || flag.type), ...riskFlags.map((flag) => typeof flag === "string" ? flag : flag.message || flag.type)].map((item) => `<li>${esc(item)}</li>`).join("") || "<li>当前没有阻断风险。</li>"}</ul>
    </div>
    <div class="detail-actions">
      <button class="button secondary" type="button" data-copy-detail="taskId" data-task-id="${attr(task.taskId)}">复制任务 ID</button>
      <button class="button secondary" type="button" data-copy-detail="copyText" data-task-id="${attr(task.taskId)}">复制文案</button>
    </div>
  </details>`;
}

function renderAccounts() {
  $("#managerView").innerHTML = `<section class="panel">
    <div class="panel-head"><div><h2>账号池</h2><p class="muted">只显示当前 workspace 的账号。写操作仍受 workspace 校验。</p></div></div>
    <div class="card-grid">${(state.data.accounts || []).map((account) => `
      <article class="mini-card">
        <div class="card-title">
          <h3>${esc(account.persona)}</h3>
          ${badge(account.status, account.status === "active" ? "good" : "warn")}
        </div>
        <p class="muted">${esc(account.handle || account.accountId)} · ${esc(account.niche || "no niche")}</p>
        <div class="compact-metrics">
          ${miniMetric("今日任务", account.todayTasks)}
          ${miniMetric("已发布", account.todayPublished)}
          ${miniMetric("待反馈", account.feedbackDue)}
          ${miniMetric("日上限", account.dailyPostLimit)}
        </div>
        <p class="muted">负责人：${esc(account.ownerStaff?.join(" / ") || "未分配")}</p>
        <p class="muted">publishMode：${esc(account.publishMode)} · 外链上限 ${esc(account.externalLinkLimit)}</p>
        ${account.riskTips?.length ? `<div class="badges">${account.riskTips.map((tip) => badge(tip, "warn")).join("")}</div>` : ""}
        <div class="task-actions">
          <button class="button secondary" data-account-filter="${attr(account.accountId)}" type="button">查看账号任务</button>
          <button class="button secondary" disabled type="button">暂停/恢复占位</button>
          <button class="button secondary" disabled type="button">修改上限占位</button>
        </div>
      </article>
    `).join("") || empty("暂无账号。")}</div>
  </section>`;
}

function renderStaff() {
  const assignments = state.data.assignments || [];
  const accounts = state.data.accounts || [];
  const assignedAccountIds = new Set(assignments.filter((item) => item.active !== false).map((item) => item.accountId));
  const activeStaffIds = new Set(assignments.filter((item) => item.active !== false).map((item) => item.userId));
  $("#managerView").innerHTML = `<section class="manager-grid">
    <article class="panel span-2">
      <h2>员工与分配</h2>
      <div class="card-grid">${(state.data.staff || []).map((user) => `
        <article class="mini-card">
          <h3>${esc(user.name)}</h3>
          <p class="muted">${esc(user.userId)} · ${esc(user.role)}</p>
          <div class="compact-metrics">
            ${miniMetric("账号", user.assignedAccounts?.length || 0)}
            ${miniMetric("任务", user.todayTasks)}
            ${miniMetric("已发布", user.published)}
            ${miniMetric("待反馈", user.feedbackDue)}
            ${miniMetric("完成率", `${user.completionRate || 0}%`)}
          </div>
          <p class="muted">${esc(user.assignedAccountNames?.join(" / ") || "暂无账号")}</p>
          ${user.overload ? badge("任务过载", "warn") : ""}
        </article>
      `).join("") || empty("暂无员工。")}</div>
    </article>
    <article class="panel">
      <h2>分配异常</h2>
      ${resource("没有员工的账号", accounts.filter((account) => !assignedAccountIds.has(account.accountId)).length)}
      ${resource("没有账号的员工", (state.data.staff || []).filter((user) => !activeStaffIds.has(user.userId)).length)}
      ${resource("任务过载员工", (state.data.staff || []).filter((user) => user.overload).length)}
      <p class="muted">分配写操作暂时通过任务审核里的账号/员工选择完成，不做跨 workspace 分配。</p>
    </article>
  </section>`;
}

function renderPublishJobs() {
  $("#managerView").innerHTML = `<section class="panel">
    <div class="panel-head">
      <div>
        <h2>发布队列</h2>
        <p class="muted">这里只显示当前 workspace 的 publish jobs。Live publish 当前关闭，需要平台总后台开启。</p>
      </div>
      <div class="task-actions">
        <button class="button secondary" disabled type="button">Prepare jobs 占位</button>
        <button class="button secondary" disabled type="button">Dry-run 占位</button>
        <button class="button" disabled type="button">Live publish 已禁用</button>
      </div>
    </div>
    <div class="table-like">${(state.data.publishJobs || []).map((job) => `
      <div class="row publish-row">
        <strong>${esc(job.jobId)}</strong>
        <span>${esc(job.accountName)}</span>
        <span>${esc(job.publishMode)}</span>
        <span>${esc(job.status)}</span>
        <span>${esc(job.blockedReason || "ready")}</span>
      </div>
    `).join("") || empty("暂无发布作业。")}</div>
  </section>`;
}

function renderFeedbackDebt() {
  $("#managerView").innerHTML = `<section class="panel">
    <h2>反馈欠账</h2>
    <p class="muted">主管可以看到谁没补数据，但不要替员工乱填假数据。</p>
    <div class="table-like">${(state.data.feedbackDebt || []).map((item) => `
      <div class="row">
        <strong>${esc(item.accountName || item.accountId)}</strong>
        <span>${esc(item.staffName || item.staffId || "未分配")}</span>
        <span>${esc(item.daysOverdue)} 天</span>
        <span>${esc((item.missingMetrics || []).join(", "))}</span>
        ${item.postedUrl ? `<a href="${attr(item.postedUrl)}" target="_blank" rel="noreferrer">打开</a>` : "<span>无链接</span>"}
      </div>
    `).join("") || empty("暂无反馈欠账。")}</div>
  </section>`;
}

function renderLanes() {
  $("#managerView").innerHTML = `<section class="panel">
    <h2>内容线</h2>
    <p class="muted">manager 只能看到当前 workspace 已启用的内容线，不能改平台级 source connector。</p>
    <div class="card-grid">${(state.data.lanes || []).map((lane) => `
      <article class="mini-card">
        <div class="card-title">
          <h3>${esc(lane.name)}</h3>
          ${badge(lane.enabled ? "enabled" : "disabled", lane.enabled ? "good" : "warn")}
        </div>
        <div class="compact-metrics">
          ${miniMetric("候选", lane.candidateCount)}
          ${miniMetric("任务", lane.taskCount)}
          ${miniMetric("风险", lane.riskCount)}
          ${miniMetric("本月用量", lane.usedThisMonth)}
        </div>
        <p class="muted">${esc(lane.defaultStyle || "no style")}</p>
        <p class="muted">禁止：${esc(lane.blockedTopics?.join(" / ") || "none")}</p>
      </article>
    `).join("") || empty("当前 workspace 没有启用内容线。")}</div>
  </section>`;
}

function renderRisks() {
  $("#managerView").innerHTML = `<section class="panel">
    <h2>风险面板</h2>
    <div class="card-grid">${(state.data.risks || []).map((risk) => `
      <article class="mini-card risk-${attr(risk.severity)}">
        <div class="card-title">
          <h3>${esc(risk.label)}</h3>
          ${badge(risk.severity, risk.severity === "block" ? "bad" : "warn")}
        </div>
        <strong class="hero-number">${esc(risk.count)}</strong>
        <p class="muted">${esc(risk.detail)}</p>
      </article>
    `).join("") || empty("当前没有明显风险。")}</div>
  </section>`;
}

function renderSettings() {
  const settings = state.data.settings || {};
  $("#managerView").innerHTML = `<section class="panel">
    <h2>管理端设置</h2>
    <p class="muted">${esc(settings.notice || "如需修改数据源或全局发布策略，请联系平台管理员。")}</p>
    <div class="detail-grid">
      ${detailItem("workspaceId", settings.workspaceId)}
      ${detailItem("workspace name", settings.name)}
      ${detailItem("plan", settings.plan)}
      ${detailItem("accountLimit", settings.accountLimit)}
      ${detailItem("enabledLaneIds", settings.enabledLaneIds?.join(", ") || "none")}
      ${detailItem("publishMode", settings.publishMode)}
      ${detailItem("autoPublishEnabled", settings.autoPublishEnabled ? "yes" : "no")}
      ${detailItem("requiresFinalApproval", settings.requiresFinalApproval ? "yes" : "no")}
    </div>
    <div class="notice compact">管理端不能修改平台总开关、source connector、API key，也不能直接开启 live publish。</div>
  </section>`;
}

function renderBatchBar() {
  const batchBar = $("#batchBar");
  if (!batchBar || !state.data?.accessAllowed) return;
  const tasks = filteredTasks();
  const selectable = tasks.filter(canBatchSelect);
  const selected = tasks.filter((task) => state.selectedTaskIds.has(task.taskId));
  const allSelected = selectable.length > 0 && selectable.every((task) => state.selectedTaskIds.has(task.taskId));
  batchBar.innerHTML = `<div class="batch-main">
    <label class="batch-select-all">
      <input type="checkbox" data-select-all ${allSelected ? "checked" : ""} ${selectable.length ? "" : "disabled"}>
      <span>已选 ${esc(selected.length)} / 可选 ${esc(selectable.length)}</span>
    </label>
    <label><span>批量账号</span><select id="batchAccountSelect">${accountOptions("")}</select></label>
    <label><span>批量员工</span><select id="batchStaffSelect">${staffOptions("")}</select></label>
    <button class="button secondary" data-batch-action="assign" ${selected.length ? "" : "disabled"} type="button">批量保存分配</button>
    <button class="button" data-batch-action="approve" ${selected.length ? "" : "disabled"} type="button">批量批准</button>
  </div>
  <div class="batch-reject">
    <label><span>拒绝模板</span><select id="rejectTemplateSelect">${rejectTemplates.map((template) => `<option value="${attr(template.value)}">${esc(template.label)}</option>`).join("")}</select></label>
    <input id="rejectReasonInput" type="text" placeholder="可自定义拒绝原因">
    <button class="button danger" data-batch-action="reject" ${selected.length ? "" : "disabled"} type="button">批量拒绝</button>
  </div>`;
}

function canBatchSelect(task) {
  return !isReadOnlyMode() && (task.canAssign || task.canApprove || task.canReject);
}

async function applyBatch(action) {
  const taskIds = [...state.selectedTaskIds];
  if (!taskIds.length) throw new Error("先勾选任务。");
  const payload = {
    taskIds,
    action,
    workspaceId: state.workspaceId,
    managerUserId: state.managerUserId
  };
  if (action === "assign") Object.assign(payload, batchAssignment());
  if (action === "reject") payload.reason = currentRejectReason() || "Rejected in batch manager review.";
  const json = await apiPost("/api/manager/task/batch", payload);
  state.data = json.summary;
  state.selectedTaskIds.clear();
  render();
  const failed = json.failed?.length ?? 0;
  toast(failed ? `批量完成，失败 ${failed} 条` : `批量${batchActionLabel(action)}完成`);
}

function batchAssignment() {
  return {
    accountId: $("#batchAccountSelect")?.value || "",
    assignedTo: $("#batchStaffSelect")?.value || ""
  };
}

function currentRejectReason() {
  const custom = $("#rejectReasonInput")?.value?.trim() || "";
  const template = $("#rejectTemplateSelect")?.value?.trim() || "";
  return custom || template;
}

function batchActionLabel(action) {
  if (action === "approve") return "批准";
  if (action === "reject") return "拒绝";
  return "分配";
}

function accountOptions(selected) {
  const accounts = state.data.accounts || [];
  return [
    `<option value="">选择账号</option>`,
    ...accounts.map((account) => `<option value="${attr(account.accountId)}" ${account.accountId === selected ? "selected" : ""}>${esc(account.persona || account.accountId)}</option>`)
  ].join("");
}

function staffOptions(selected) {
  const staff = state.data.staff || [];
  return [
    `<option value="">选择员工</option>`,
    ...staff.map((user) => `<option value="${attr(user.userId)}" ${user.userId === selected ? "selected" : ""}>${esc(user.name || user.userId)}</option>`)
  ].join("");
}

function currentAssignment(taskId) {
  return {
    accountId: fieldValue(taskId, "account"),
    assignedTo: fieldValue(taskId, "staff")
  };
}

function fieldValue(taskId, field) {
  return Array.from(document.querySelectorAll(`[data-field="${field}"]`))
    .find((element) => element.dataset.taskId === taskId)
    ?.value || "";
}

function taskById(taskId) {
  return state.data?.tasks.find((item) => item.taskId === taskId);
}

function miniMetric(label, value) {
  return `<div class="mini-metric"><span>${esc(label)}</span><strong>${esc(value ?? 0)}</strong></div>`;
}

function resource(label, value) {
  return `<div class="resource-card"><strong>${esc(label)}</strong><span>${esc(value)}</span></div>`;
}

function detailItem(label, value) {
  return `<div class="detail-item"><span>${esc(label)}</span><strong>${esc(value ?? "")}</strong></div>`;
}

function badge(text, type = "") {
  return `<span class="badge ${type}">${esc(text)}</span>`;
}

function empty(text) {
  return `<div class="empty">${esc(text)}</div>`;
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

function updateUrl() {
  const url = new URL(location.href);
  if (state.workspaceId) url.searchParams.set("workspaceId", state.workspaceId);
  if (state.managerUserId) url.searchParams.set("managerUserId", state.managerUserId);
  if (state.activeTab) url.searchParams.set("tab", state.activeTab);
  history.replaceState({}, "", url);
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

function attr(value) {
  return esc(value).replace(/'/g, "&#39;");
}
