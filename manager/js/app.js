const params = new URLSearchParams(location.search);
const state = {
  workspaceId: params.get("workspaceId") || "",
  managerUserId: params.get("managerUserId") || "",
  devEmail: params.get("devEmail") || "",
  appMode: params.get("appMode") === "1",
  session: null,
  workspace: null,
  status: "all",
  data: null,
  demoMode: false,
  appError: "",
  selectedTaskIds: new Set()
};

const $ = (selector) => document.querySelector(selector);

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
$("#statusFilter").addEventListener("change", (event) => {
  state.status = event.target.value;
  render();
});

document.addEventListener("click", async (event) => {
  const copyButton = event.target.closest("[data-copy-detail]");
  if (copyButton) {
    const taskId = copyButton.dataset.taskId;
    const task = state.data?.tasks.find((item) => item.taskId === taskId);
    if (!task) return;
    const value = copyButton.dataset.copyDetail === "copyText" ? task.copyText : task.taskId;
    await navigator.clipboard.writeText(value || "");
    toast(copyButton.dataset.copyDetail === "copyText" ? "已复制文案" : "已复制任务 ID");
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
  const feedbackButton = event.target.closest("[data-feedback-save]");
  if (feedbackButton) {
    try {
      await saveFeedback(feedbackButton.dataset.taskId);
      toast("反馈已保存");
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  if (!button) return;
  const taskId = button.dataset.taskId;
  const action = button.dataset.action;
  const task = state.data?.tasks.find((item) => item.taskId === taskId);
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
  const input = event.target.closest("[data-select-task], [data-select-all]");
  if (!input) return;
  if (input.dataset.selectAll !== undefined) {
    for (const task of filteredTasks()) {
      if (canBatchSelect(task)) {
        if (input.checked) state.selectedTaskIds.add(task.taskId);
        else state.selectedTaskIds.delete(task.taskId);
      }
    }
    renderTasks();
    return;
  } else {
    if (input.checked) state.selectedTaskIds.add(input.dataset.taskId);
    else state.selectedTaskIds.delete(input.dataset.taskId);
  }
  renderBatchBar();
});

await loadManager();

async function loadManager() {
  if (state.appMode) {
    await loadAppManager();
    return;
  }
  try {
    $("#statusText").textContent = "读取 workspace 任务中...";
    const query = new URLSearchParams();
    if (state.workspaceId) query.set("workspaceId", state.workspaceId);
    if (state.managerUserId) query.set("managerUserId", state.managerUserId);
    const suffix = query.toString() ? `?${query}` : "";
    const json = await apiGet(`/api/manager/summary${suffix}`);
    state.data = json;
    state.demoMode = false;
    state.workspaceId = json.selectedWorkspace?.workspaceId || "";
    state.managerUserId = json.selectedManager?.userId || "";
    updateUrl();
    render();
  } catch (error) {
    try {
      state.data = await readStaticDemo();
      state.demoMode = true;
      state.workspaceId = state.data.selectedWorkspace?.workspaceId || "workspace_default";
      state.managerUserId = state.data.selectedManager?.userId || "";
      updateUrl();
      render();
      toast("已进入演示模式");
    } catch {
      $("#statusText").textContent = `读取失败：${error.message}`;
      toast(error.message);
    }
  }
}

async function loadAppManager() {
  try {
    $("#statusText").textContent = "读取真实工作区...";
    const query = appQuery();
    const suffix = query.toString() ? `?${query}` : "";
    const [session, workspace, summary] = await Promise.all([
      apiGet(`/api/app/v1/session${suffix}`),
      apiGet(`/api/app/v1/workspace${suffix}`),
      apiGet(`/api/app/v1/manager/summary${suffix}`)
    ]);
    state.session = session;
    state.workspace = workspace;
    state.data = summary;
    state.demoMode = false;
    state.appError = "";
    state.workspaceId = session.workspaceId || workspace.workspaceId || "";
    state.managerUserId = session.userId || "";
    updateUrl();
    render();
  } catch (error) {
    state.data = null;
    state.appError = error.message || "请先登录 app.guamee.org";
    renderAppError();
  }
}

async function updateTask(taskId, action, extra = {}) {
  if (state.demoMode) throw new Error("公开 Demo 是演示模式，不会写入任务。");
  if (state.appMode) {
    if (action === "assign") throw new Error("App API MVP 先支持批准、拒绝和反馈保存。");
    const query = appQuery();
    const suffix = query.toString() ? `?${query}` : "";
    const endpoint = action === "approve"
      ? "/api/app/v1/manager/tasks/approve"
      : "/api/app/v1/manager/tasks/reject";
    await apiPost(`${endpoint}${suffix}`, { taskId, ...extra });
    await loadAppManager();
    return;
  }
  const json = await apiPost("/api/manager/task", {
    taskId,
    action,
    workspaceId: state.workspaceId,
    managerUserId: state.managerUserId,
    ...extra
  });
  state.data = json.summary;
  render();
}

async function saveFeedback(taskId) {
  if (!state.appMode) throw new Error("反馈保存只在真实工作区模式启用。");
  const task = state.data?.tasks.find((item) => item.taskId === taskId);
  if (!task) throw new Error("任务不存在。");
  const metrics = {};
  for (const key of ["impressions", "likes", "bookmarks", "replies", "reposts", "clicks", "profileVisits"]) {
    const input = document.querySelector(`[data-feedback-metric="${key}"][data-task-id="${CSS.escape(taskId)}"]`);
    metrics[key] = Number(input?.value || 0);
  }
  const notes = document.querySelector(`[data-feedback-notes][data-task-id="${CSS.escape(taskId)}"]`)?.value || "";
  const query = appQuery();
  const suffix = query.toString() ? `?${query}` : "";
  await apiPost(`/api/app/v1/manager/feedback${suffix}`, { taskId, metrics, notes });
  await loadAppManager();
}

function render() {
  if (!state.data) return;
  if (!state.data.accessAllowed) {
    $("#statusText").textContent = state.data.accessError || "当前主管没有权限查看这个 workspace";
    renderSelectors();
    $("#metrics").innerHTML = "";
    $("#workspaceResources").innerHTML = `<div class="empty">${esc(state.data.accessError || "没有权限")}</div>`;
    $("#batchBar").innerHTML = "";
    $("#tasks").innerHTML = "";
    return;
  }
  $("#statusText").textContent = `${state.data.selectedWorkspace?.name || "Workspace"} · ${state.data.summary.pendingReview} 条待审核 · ${state.data.summary.unassigned} 条未分配`;
  renderModeNotice();
  renderSelectors();
  renderMetrics();
  renderResources();
  renderBatchBar();
  renderTasks();
}

function renderAppError() {
  $("#statusText").textContent = state.appError || "请先登录 app.guamee.org";
  $("#modeNotice").innerHTML = `<strong>请先登录 app.guamee.org</strong> 当前页面需要 Cloudflare Access 身份。开发环境可使用 <code>?appMode=1&devEmail=owner@guamee.local</code>。`;
  $("#workspaceSelect").innerHTML = "";
  $("#managerSelect").innerHTML = "";
  $("#metrics").innerHTML = "";
  $("#workspaceResources").innerHTML = `<div class="empty">${esc(state.appError || "请先登录。")}</div>`;
  $("#batchBar").innerHTML = "";
  $("#tasks").innerHTML = "";
}

function renderSelectors() {
  $("#workspaceSelect").innerHTML = (state.data.workspaces || []).map((workspace) => `
    <option value="${attr(workspace.workspaceId)}" ${workspace.workspaceId === state.workspaceId ? "selected" : ""}>${esc(workspace.name)}</option>
  `).join("");
  $("#managerSelect").innerHTML = (state.data.managers || []).map((manager) => `
    <option value="${attr(manager.userId)}" ${manager.userId === state.managerUserId ? "selected" : ""}>${esc(manager.name)} (${esc(manager.role)})</option>
  `).join("");
  $("#workspaceSelect").disabled = state.appMode;
  $("#managerSelect").disabled = state.appMode;
}

function renderModeNotice() {
  const notice = $("#modeNotice");
  if (!notice) return;
  if (state.appMode) {
    notice.innerHTML = `<strong>真实工作区 · Workspace App Mode</strong> 当前用户：${esc(state.session?.email || "unknown")} · ${esc(state.workspace?.name || state.data?.selectedWorkspace?.name || "Workspace")}。这里会调用 /api/app/v1 保存审核、拒绝和反馈，并写入 audit log。`;
    return;
  }
  notice.innerHTML = state.demoMode
    ? `<strong>公开演示环境，仅可查看，不能保存或发布。</strong> 这里展示 workspace 管理端的信息架构。按钮会保留界面形态，但不会写入任务、不会连接真实 X 账号，也不会显示平台总后台。`
    : `<strong>管理端规则：</strong>这里只管理当前 workspace 的账号、任务审核、分配和反馈状态。默认控制 30 个以内账号，不显示平台总后台，不自动发推。`;
}

function renderMetrics() {
  const metrics = [
    ["任务", state.data.summary.totalTasks],
    ["待审核", state.data.summary.pendingReview],
    ["已批准", state.data.summary.approved],
    ["已拒绝", state.data.summary.rejected],
    ["未分配", state.data.summary.unassigned],
    ["不可批", state.data.summary.blocked],
    ["发布队列", state.data.summary.publishJobs],
    ["反馈", state.data.summary.feedback]
  ];
  $("#metrics").innerHTML = metrics.map(([label, value]) => `
    <div class="metric"><span>${esc(label)}</span><strong>${Number(value || 0)}</strong></div>
  `).join("");
}

function renderResources() {
  const accounts = state.data.accounts || [];
  const staff = state.data.staff || [];
  const accountLimit = Number(state.data.selectedWorkspace?.accountLimit || 30);
  $("#workspaceResources").innerHTML = `
    <div class="resource-list">
      <div class="resource-card">
        <strong>账号容量</strong>
        <span>${accounts.length}/${accountLimit} accounts in this workspace</span>
      </div>
      <div class="resource-card">
        <strong>可分配账号</strong>
        <span>${accounts.length ? accounts.map((account) => account.persona || account.accountId).join(" / ") : "none"}</span>
      </div>
      <div class="resource-card">
        <strong>执行人员</strong>
        <span>${staff.length ? staff.map((user) => user.name || user.userId).join(" / ") : "none"}</span>
      </div>
      <div class="resource-card">
        <strong>启用内容线</strong>
        <span>${(state.data.selectedWorkspace?.enabledLaneIds || []).join(" / ") || "none"}</span>
      </div>
    </div>
  `;
}

function renderTasks() {
  const tasks = filteredTasks();
  const visibleIds = new Set(tasks.map((task) => task.taskId));
  for (const taskId of [...state.selectedTaskIds]) {
    if (!visibleIds.has(taskId)) state.selectedTaskIds.delete(taskId);
  }
  renderBatchBar();
  $("#tasks").innerHTML = tasks.length
    ? tasks.map(renderTask).join("")
    : `<div class="empty">当前筛选下没有任务。</div>`;
}

function filteredTasks() {
  const tasks = state.data.tasks || [];
  if (state.status === "pending") return tasks.filter((task) => task.approvalStatus === "pending" || task.status === "pending_review");
  if (state.status === "approved") return tasks.filter((task) => task.approvalStatus === "approved");
  if (state.status === "rejected") return tasks.filter((task) => task.approvalStatus === "rejected");
  if (state.status === "unassigned") return tasks.filter((task) => !task.accountId || !task.assignedTo);
  if (state.status === "blocked") return tasks.filter((task) => task.blockReasons.length);
  return tasks;
}

function renderTask(task) {
  const length = task.tweetLength;
  const lengthClass = length.status === "over_limit" ? "bad" : length.status === "near_limit" || length.status === "watch" ? "warn" : "good";
  const cardClass = task.blockReasons.length ? " blocked" : task.canApprove ? " ready" : "";
  return `
    <article class="task-card${cardClass}">
      <div class="task-top">
        <div>
          <label class="task-check">
            <input type="checkbox" data-select-task data-task-id="${attr(task.taskId)}" ${state.selectedTaskIds.has(task.taskId) ? "checked" : ""} ${canBatchSelect(task) ? "" : "disabled"}>
            <div>
              <h3 class="task-title">${esc(task.toolName)}</h3>
              <span class="muted">${esc(task.laneId || "no lane")} · ${esc(task.accountName)} · ${esc(task.assignedToName)}</span>
            </div>
          </label>
        </div>
        ${task.toolUrl ? `<a class="button secondary" href="${attr(task.toolUrl)}" target="_blank" rel="noreferrer">打开来源</a>` : ""}
      </div>
      <div class="badges">
        ${badge(task.status, task.status === "draft" ? "warn" : task.status === "assigned" ? "good" : "")}
        ${badge(task.approvalStatus, task.approvalStatus === "rejected" ? "bad" : task.approvalStatus === "approved" ? "good" : "")}
        ${badge(`${length.weightedCharCount}/280`, lengthClass)}
        ${badge(task.variantType)}
        ${task.riskLevel ? badge(`risk ${task.riskLevel}`, task.riskLevel === "block" ? "bad" : task.riskLevel === "medium" ? "warn" : "good") : ""}
      </div>
      <div class="assignment-grid">
        <label class="field">
          <span>账号</span>
          <select data-field="account" data-task-id="${attr(task.taskId)}" ${task.canAssign ? "" : "disabled"}>
            ${accountOptions(task.accountId)}
          </select>
        </label>
        <label class="field">
          <span>员工</span>
          <select data-field="staff" data-task-id="${attr(task.taskId)}" ${task.canAssign ? "" : "disabled"}>
            ${staffOptions(task.assignedTo)}
          </select>
        </label>
      </div>
      <div class="copy-box">${esc(task.copyText)}</div>
      ${renderTaskDetail(task)}
      ${renderFeedbackForm(task)}
      ${task.blockReasons.length ? `<div class="badges">${task.blockReasons.map((reason) => badge(reason, "bad")).join("")}</div>` : ""}
      <div class="task-actions">
        <button class="button secondary" data-action="assign" data-task-id="${attr(task.taskId)}" ${task.canAssign && !state.appMode && !state.demoMode ? "" : "disabled"} type="button">保存分配</button>
        <button class="button" data-action="approve" data-task-id="${attr(task.taskId)}" ${task.canApprove && !state.demoMode ? "" : "disabled"} type="button">批准</button>
        <button class="button danger" data-action="reject" data-task-id="${attr(task.taskId)}" ${task.canReject && !state.demoMode ? "" : "disabled"} type="button">拒绝</button>
      </div>
    </article>
  `;
}

function renderFeedbackForm(task) {
  if (!state.appMode || !["posted", "feedback_due"].includes(task.status) && !task.postedUrl) return "";
  const metrics = task.metrics || {};
  const metricInput = (key, label) => `
    <label class="field">
      <span>${esc(label)}</span>
      <input data-feedback-metric="${attr(key)}" data-task-id="${attr(task.taskId)}" type="number" min="0" step="1" value="${attr(metrics[key] ?? 0)}">
    </label>
  `;
  return `<div class="feedback-form">
    <strong>反馈回填</strong>
    <div class="feedback-grid">
      ${metricInput("impressions", "Impressions")}
      ${metricInput("likes", "Likes")}
      ${metricInput("bookmarks", "Bookmarks")}
      ${metricInput("replies", "Replies")}
      ${metricInput("reposts", "Reposts")}
      ${metricInput("clicks", "Clicks")}
      ${metricInput("profileVisits", "Profile visits")}
    </div>
    <label class="field">
      <span>Notes</span>
      <input data-feedback-notes data-task-id="${attr(task.taskId)}" type="text" placeholder="可选：补充观察">
    </label>
    <button class="button secondary" data-feedback-save data-task-id="${attr(task.taskId)}" type="button">保存反馈</button>
  </div>`;
}

function renderTaskDetail(task) {
  const duplicateFlags = task.duplicateCheckResult?.flags ?? task.duplicateFlags ?? [];
  const riskFlags = task.riskFlags ?? [];
  return `<details class="task-detail">
    <summary>任务详情 / 风险原因</summary>
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
    </div>
    <div class="detail-block">
      <strong>Why can approve</strong>
      <ul>${(task.approvalReasons ?? []).map((item) => `<li>${esc(item)}</li>`).join("") || "<li>Needs fixes before approval.</li>"}</ul>
    </div>
    <div class="detail-block">
      <strong>Blocked / risky</strong>
      <ul>${[...(task.blockReasons ?? []), ...duplicateFlags.map((flag) => flag.message || flag.type), ...riskFlags.map((flag) => typeof flag === "string" ? flag : flag.message || flag.type)].map((item) => `<li>${esc(item)}</li>`).join("") || "<li>No blocking risk currently shown.</li>"}</ul>
    </div>
    <div class="detail-actions">
      <button class="button secondary" type="button" data-copy-detail="taskId" data-task-id="${attr(task.taskId)}">复制任务 ID</button>
      <button class="button secondary" type="button" data-copy-detail="copyText" data-task-id="${attr(task.taskId)}">复制文案</button>
    </div>
  </details>`;
}

function detailItem(label, value) {
  return `<div class="detail-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
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
    <label>
      <span>批量账号</span>
      <select id="batchAccountSelect">${accountOptions("")}</select>
    </label>
    <label>
      <span>批量员工</span>
      <select id="batchStaffSelect">${staffOptions("")}</select>
    </label>
    <button class="button secondary" data-batch-action="assign" ${selected.length ? "" : "disabled"} type="button">批量保存分配</button>
    <button class="button" data-batch-action="approve" ${selected.length ? "" : "disabled"} type="button">批量批准</button>
  </div>
  <div class="batch-reject">
    <label>
      <span>拒绝模板</span>
      <select id="rejectTemplateSelect">
        ${rejectTemplates.map((template) => `<option value="${attr(template.value)}">${esc(template.label)}</option>`).join("")}
      </select>
    </label>
    <input id="rejectReasonInput" type="text" placeholder="可自定义拒绝原因">
    <button class="button danger" data-batch-action="reject" ${selected.length ? "" : "disabled"} type="button">批量拒绝</button>
  </div>`;
}

function canBatchSelect(task) {
  if (state.appMode || state.demoMode) return false;
  return task.canAssign || task.canApprove || task.canReject;
}

async function applyBatch(action) {
  if (state.appMode) throw new Error("App API MVP 暂不支持批量操作。");
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
    ...accounts.map((account) => `
      <option value="${attr(account.accountId)}" ${account.accountId === selected ? "selected" : ""}>${esc(account.persona || account.accountId)}</option>
    `)
  ].join("");
}

function staffOptions(selected) {
  const staff = state.data.staff || [];
  return [
    `<option value="">选择员工</option>`,
    ...staff.map((user) => `
      <option value="${attr(user.userId)}" ${user.userId === selected ? "selected" : ""}>${esc(user.name || user.userId)}</option>
    `)
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

function badge(text, type = "") {
  return `<span class="badge ${type}">${esc(text)}</span>`;
}

async function apiGet(path) {
  const res = await fetch(path);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new Error(`${path} returned a static page`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || `GET ${path} failed`);
  return json.data;
}

async function readStaticDemo() {
  const res = await fetch(`/data/demo-manager-summary.json?t=${Date.now()}`);
  if (!res.ok) throw new Error("static manager demo is missing");
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || `POST ${path} failed`);
  return json.data;
}

function updateUrl() {
  const url = new URL(location.href);
  if (state.appMode) url.searchParams.set("appMode", "1");
  if (state.devEmail) url.searchParams.set("devEmail", state.devEmail);
  if (state.workspaceId) url.searchParams.set("workspaceId", state.workspaceId);
  if (state.managerUserId) url.searchParams.set("managerUserId", state.managerUserId);
  history.replaceState({}, "", url);
}

function appQuery() {
  const query = new URLSearchParams();
  if (state.devEmail) query.set("devEmail", state.devEmail);
  if (state.workspaceId) query.set("workspaceId", state.workspaceId);
  return query;
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
