import { collectDesktopFeedbackPayload, collectDesktopImportPayload, collectDesktopNetworkNotesPayload, collectDesktopSetupPayload, collectDesktopTaskPayload } from "./desktop-data-setup.js";
import { renderDesktopOnboarding } from "./desktop-onboarding.js";

const params = new URLSearchParams(location.search);
const desktopPort = Number(location.port || 0);
const isLocalDesktopBackend = ["127.0.0.1", "localhost"].includes(location.hostname)
  && desktopPort >= 5288
  && desktopPort <= 5399
  && params.get("appMode") === "1";
const state = {
  workspaceId: params.get("workspaceId") || "",
  managerUserId: params.get("managerUserId") || "",
  devEmail: params.get("devEmail") || "",
  appMode: params.get("appMode") === "1",
  desktopMode: params.get("desktop") === "1" || Boolean(window.aiCreatorOS?.desktop) || isLocalDesktopBackend,
  session: null,
  workspace: null,
  status: "all",
  accountFilters: {
    query: "",
    lane: "all",
    status: "all",
    connection: "all",
    health: "all",
    region: "all"
  },
  data: null,
  demoMode: false,
  appError: "",
  appErrorCode: "",
  appErrorDetails: {},
  desktopSetup: null,
  activeDesktopTab: "accounts",
  xOAuthStatus: null,
  taskDraftAccountId: "",
  selectedTaskIds: new Set(),
  selectedAccountIds: new Set(),
  selectedAccountId: "",
  accountTargets: new Map()
};

const $ = (selector) => document.querySelector(selector);
document.body.classList.toggle("desktop-control", state.desktopMode);

const rejectTemplates = [
  { value: "", label: "选择拒绝模板" },
  { value: "Too generic for this workspace. Needs a sharper niche pain point.", label: "太泛，不够垂直" },
  { value: "Duplicate or too similar to recent account content. Hold for a different angle.", label: "重复风险，换角度" },
  { value: "Not fresh enough for today. Better for watchlist or long-form research.", label: "不够新鲜" },
  { value: "Overly promotional. Rewrite with a more personal observation.", label: "广告味太重" },
  { value: "Needs source verification before staff can post it.", label: "来源需核验" }
];

$("#refreshButton").addEventListener("click", () => loadManager());
$("#accessLogoutButton").addEventListener("click", () => logoutFromAccess());
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
  const tabButton = event.target.closest("[data-desktop-tab]");
  if (tabButton) {
    state.activeDesktopTab = tabButton.dataset.desktopTab || "accounts";
    if (state.activeDesktopTab === "targets") await ensureDesktopTargetsLoaded();
    render();
    return;
  }

  const setupButton = event.target.closest("[data-desktop-setup]");
  if (setupButton) {
    try {
      await completeDesktopSetupFromUi(setupButton.dataset.desktopSetup);
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  const desktopTaskButton = event.target.closest("[data-desktop-task-action]");
  if (desktopTaskButton) {
    try {
      await handleDesktopTaskAction(desktopTaskButton.dataset.desktopTaskAction, desktopTaskButton.dataset.taskId || "");
    } catch (error) {
      toast(error.message);
    }
    return;
  }

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

  const accountButton = event.target.closest("[data-account-action]");
  if (accountButton) {
    try {
      await handleAccountAction(accountButton.dataset.accountAction, accountButton.dataset.accountId || "", accountButton);
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  const drawerClose = event.target.closest("[data-close-account-drawer], #accountDrawerBackdrop");
  if (drawerClose) {
    closeAccountDrawer();
    return;
  }

  const targetButton = event.target.closest("[data-target-status]");
  if (targetButton) {
    try {
      await updateTargetStatus(targetButton.dataset.accountId, targetButton.dataset.targetId, targetButton.dataset.targetStatus);
      toast("目标关系已更新");
    } catch (error) {
      toast(error.message);
    }
    return;
  }

  const button = event.target.closest("[data-action]");
  const feedbackButton = event.target.closest("[data-feedback-save]");
  const discordButton = event.target.closest("[data-discord-verify]");
  if (discordButton) {
    try {
      const query = appQuery();
      const suffix = query.toString() ? `?${query}` : "";
      const data = await apiGet(`/api/app/v1/auth/discord/start${suffix}`);
      location.href = data.authorizationUrl;
    } catch (error) {
      toast(error.message);
    }
    return;
  }

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
      toast(state.desktopMode ? "任务已确认" : "已批准，员工端可继续执行");
      return;
    }
    if (action === "reject") {
      const reason = prompt("拒绝原因（可选）：", currentRejectReason());
      if (reason === null) return;
      await updateTask(taskId, "reject", { reason: reason.trim() });
      toast(state.desktopMode ? "任务已拒绝" : "已拒绝，任务回到 draft");
    }
  } catch (error) {
    toast(error.message);
  }
});

document.addEventListener("change", (event) => {
  const inlineAccountField = event.target.closest("[data-account-inline-field]");
  if (inlineAccountField) {
    saveInlineAccountField(inlineAccountField).catch((error) => toast(error.message));
    return;
  }

  const input = event.target.closest("[data-select-task], [data-select-all]");
  const accountInput = event.target.closest("[data-select-account], [data-select-all-accounts], [data-account-filter]");
  const targetAccountInput = event.target.closest("[data-desktop-target-account]");
  if (!input && !accountInput && !targetAccountInput) return;
  if (targetAccountInput) {
    state.selectedAccountId = targetAccountInput.value || "";
    loadTargets(state.selectedAccountId).then(() => render()).catch((error) => toast(error.message));
    return;
  }
  if (accountInput) {
    handleAccountSelectionOrFilter(accountInput);
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
  } else {
    if (input.checked) state.selectedTaskIds.add(input.dataset.taskId);
    else state.selectedTaskIds.delete(input.dataset.taskId);
  }
  renderBatchBar();
});

document.addEventListener("input", (event) => {
  if (event.target.closest("[name=\"desktopTaskCopy\"]")) {
    updateDesktopTaskCounter();
  }
  const filter = event.target.closest("[data-account-filter]");
  if (!filter) return;
  handleAccountSelectionOrFilter(filter);
});

document.addEventListener("keydown", (event) => {
  const inlineCountry = event.target.closest("input[data-account-inline-field=\"country\"]");
  if (!inlineCountry || event.key !== "Enter") return;
  event.preventDefault();
  inlineCountry.blur();
  saveInlineAccountField(inlineCountry).catch((error) => toast(error.message));
});

await finishDiscordOAuthFromUrl();
await loadManager();

async function finishDiscordOAuthFromUrl() {
  if (!state.appMode || state.desktopMode) return;
  const code = params.get("code") || "";
  const oauthState = params.get("state") || "";
  if (!code || !oauthState) return;
  try {
    $("#statusText").textContent = "正在完成 Discord 验证...";
    const query = new URLSearchParams({ code, state: oauthState });
    await apiGet(`/api/app/v1/link/finish?${query}`);
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete("code");
    cleanUrl.searchParams.delete("state");
    cleanUrl.searchParams.set("appMode", "1");
    history.replaceState({}, "", cleanUrl);
    toast("Discord 验证已完成");
  } catch (error) {
    toast(error.message || "Discord 验证失败，请重试。");
  }
}

async function loadManager() {
  if (state.desktopMode) {
    await loadDesktopManager();
    return;
  }
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

async function loadDesktopManager() {
  try {
    $("#statusText").textContent = "读取桌面本地数据...";
    state.desktopSetup = await apiGet("/api/desktop/setup");
    if (!state.desktopSetup.setupCompleted) {
      state.data = null;
      renderDesktopFirstRun();
      return;
    }
    const query = new URLSearchParams();
    state.workspaceId = state.workspaceId || state.desktopSetup.workspaceId || "workspace_default";
    state.managerUserId = state.managerUserId || "user_owner";
    query.set("workspaceId", state.workspaceId);
    query.set("managerUserId", state.managerUserId);
    const [summary, xOAuthStatus] = await Promise.all([
      apiGet(`/api/manager/summary?${query}`),
      apiGet("/api/desktop/x-oauth/status")
    ]);
    state.data = summary;
    state.xOAuthStatus = xOAuthStatus;
    if (state.activeDesktopTab === "targets") await ensureDesktopTargetsLoaded();
    state.demoMode = false;
    state.appError = "";
    updateUrl();
    render();
  } catch (error) {
    state.data = null;
    state.appError = error.message || "桌面本地后端连接失败。";
    renderDesktopError();
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
    state.appErrorCode = "";
    state.appErrorDetails = {};
    state.workspaceId = session.workspaceId || workspace.workspaceId || "";
    state.managerUserId = session.userId || "";
    updateUrl();
    render();
  } catch (error) {
    state.data = null;
    state.appError = error.message || "请先登录 app.guamee.org";
    state.appErrorCode = error.code || "";
    state.appErrorDetails = error.details || {};
    renderAppError();
  }
}

async function updateTask(taskId, action, extra = {}) {
  if (state.demoMode) throw new Error("公开 Demo 是演示模式，不会写入任务。");
  if (state.appMode && !state.desktopMode) {
    const query = appQuery();
    const suffix = query.toString() ? `?${query}` : "";
    const endpoint = action === "assign"
      ? "/api/app/v1/manager/tasks/assign"
      : action === "approve"
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
  if (!state.appMode && !state.desktopMode) throw new Error("反馈保存只在真实工作区或桌面模式启用。");
  const task = state.data?.tasks.find((item) => item.taskId === taskId);
  if (!task) throw new Error("任务不存在。");
  const payload = collectDesktopFeedbackPayload(document, taskId);
  if (state.desktopMode) {
    await apiPost("/api/desktop/feedback", payload);
    await loadDesktopManager();
    return;
  }
  const query = appQuery();
  const suffix = query.toString() ? `?${query}` : "";
  await apiPost(`/api/app/v1/manager/feedback${suffix}`, payload);
  await loadAppManager();
}

function render() {
  if (!state.data) return;
  if (state.desktopMode) ensureDesktopOverlay().innerHTML = "";
  if (state.desktopMode) {
    renderDesktopProduct();
    return;
  }
  renderAccessLogout();
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
  renderAccountVault();
  renderBatchBar();
  renderTasks();
}

function renderAppError() {
  $("#statusText").textContent = state.appError || "请先登录 app.guamee.org";
  renderAccessLogout();
  const isDiscordRequired = state.appErrorCode === "DISCORD_VERIFICATION_REQUIRED";
  $("#modeNotice").innerHTML = isDiscordRequired
    ? `<strong>需要 Discord 验证</strong> 当前 workspace 要求 Discord 群身份验证。完成后会回到管理端。`
    : `<strong>请先登录 app.guamee.org</strong> 当前页面需要 Cloudflare Access 身份。开发环境可使用 <code>?appMode=1&devEmail=owner@guamee.local</code>。`;
  $("#workspaceSelect").innerHTML = "";
  $("#managerSelect").innerHTML = "";
  $("#metrics").innerHTML = "";
  $("#workspaceResources").innerHTML = isDiscordRequired
    ? `<div class="empty">
        <strong>${esc(state.appError || "请先完成 Discord 验证。")}</strong>
        <p>请使用绑定到你 workspace 的 Discord 账号登录。验证通过后，后端会记录 Discord user id、guild 和 role，不保存 Discord token。</p>
        <button type="button" class="button primary" data-discord-verify>去 Discord 验证</button>
      </div>`
    : `<div class="empty">${esc(state.appError || "请先登录。")}</div>`;
  $("#batchBar").innerHTML = "";
  $("#tasks").innerHTML = "";
}

function renderDesktopFirstRun() {
  $("#statusText").textContent = "首次启动：请初始化本地账号工具箱";
  renderAccessLogout();
  $("#modeNotice").innerHTML = `<strong>桌面首次启动</strong> 数据会保存在本机应用目录：<code>${esc(state.desktopSetup?.appDataDir || "")}</code>`;
  $("#workspaceSelect").innerHTML = "";
  $("#managerSelect").innerHTML = "";
  $("#metrics").innerHTML = "";
  $("#workspaceResources").innerHTML = `<div class="empty">完成首次启动向导后，这里会显示账号资产库、任务和健康度。</div>`;
  $("#batchBar").innerHTML = "";
  $("#tasks").innerHTML = "";
  ensureDesktopOverlay().innerHTML = renderDesktopOnboarding(state.desktopSetup || {});
}

function renderDesktopError() {
  $("#statusText").textContent = state.appError || "桌面后端连接失败";
  $("#modeNotice").innerHTML = `<strong>桌面数据读取失败</strong> 数据保存失败时，请检查本地数据目录权限，或重启 AI Creator OS Desktop。`;
  $("#workspaceSelect").innerHTML = "";
  $("#managerSelect").innerHTML = "";
  $("#metrics").innerHTML = "";
  $("#workspaceResources").innerHTML = `<div class="empty">${esc(state.appError || "后端连接失败。")}</div>`;
  $("#batchBar").innerHTML = "";
  $("#tasks").innerHTML = "";
}

function renderDesktopProduct() {
  document.body.classList.add("desktop-product-reset");
  renderAccessLogout();
  renderSelectors();
  $("#workspaceSelect").closest("label").hidden = true;
  $("#managerSelect").closest("label").hidden = true;
  $("#statusFilter").hidden = true;
  const accounts = state.data.accounts || [];
  const tasks = state.data.tasks || [];
  const loggedInAccounts = accounts.filter((account) => accountLoginStatus(account) === "connected");
  const loggedOutAccounts = accounts.filter((account) => accountLoginStatus(account) !== "connected");
  const pendingFeedback = tasks
    .filter((task) => ["posted", "feedback_due"].includes(task.status || "") || task.postedUrl)
    .filter((task) => !task.metrics || !Object.keys(task.metrics).length);
  const riskyAccounts = accounts.filter((account) => ["risky", "paused"].includes(account.healthStatus || account.status || ""));
  $("#statusText").textContent = `AI Creator OS 桌面版 · ${accounts.length} 个账号 · ${pendingDesktopTasks().length} 条待确认`;
  $("#modeNotice").innerHTML = `
    <div class="desktop-product-note">
      <strong>多账号 X 运营工具箱</strong>
      <span>本地桌面工具箱：不保存账号密码、cookie，不管理代理或指纹，不自动关注、点赞、评论或发推。</span>
    </div>
    <nav class="desktop-tabs" aria-label="桌面版主导航">
      ${desktopTabButton("accounts", "账号库")}
      ${desktopTabButton("tasks", "任务")}
      ${desktopTabButton("targets", "目标关系")}
      ${desktopTabButton("feedback", "数据反馈")}
      ${desktopTabButton("settings", "设置")}
    </nav>
  `;
  $("#metrics").innerHTML = [
    ["账号总数", accounts.length],
    ["已登录", loggedInAccounts.length],
    ["未登录", loggedOutAccounts.length],
    ["待确认", pendingDesktopTasks().length],
    ["待反馈", pendingFeedback.length],
    ["风险账号", riskyAccounts.length]
  ].map(([label, value]) => `<div class="metric"><span>${esc(label)}</span><strong>${Number(value || 0)}</strong></div>`).join("");
  $("#workspaceResources").innerHTML = renderDesktopTabContent();
  $("#accountVault").innerHTML = "";
  $("#batchBar").innerHTML = "";
  $("#tasks").innerHTML = "";
  const taskPanel = document.querySelector(".task-panel");
  if (taskPanel) taskPanel.hidden = true;
  updateDesktopTaskCounter();
}

function desktopTabButton(id, label) {
  return `<button class="desktop-tab ${state.activeDesktopTab === id ? "active" : ""}" data-desktop-tab="${attr(id)}" type="button">${esc(label)}</button>`;
}

function renderDesktopTabContent() {
  if (state.activeDesktopTab === "tasks") return renderDesktopTasksTab();
  if (state.activeDesktopTab === "targets") return renderDesktopTargetsTab();
  if (state.activeDesktopTab === "feedback") return renderDesktopFeedbackTab();
  if (state.activeDesktopTab === "settings") return renderDesktopSettingsTab();
  return renderDesktopAccountsTab();
}

function renderDesktopAccountsTab() {
  const accounts = filteredAccounts();
  return `<section class="desktop-product-panel">
    <div class="desktop-section-head">
      <div>
        <h2>账号库</h2>
        <p class="muted">本地管理账号、内容线、国家、任务和反馈。手动添加的账号默认未登录。</p>
      </div>
      <div class="desktop-action-row">
        <button class="button" data-account-action="connect-x" type="button">连接 X 账号</button>
        <button class="button secondary" data-account-action="add-account" type="button">添加账号</button>
        <button class="button secondary" data-account-action="export-accounts" type="button">导出账号</button>
      </div>
    </div>
    <details class="desktop-import-compact">
      <summary>批量导入账号</summary>
      <div class="desktop-import-box">
        <div class="desktop-import-head">
          <strong>添加账号</strong>
          <span>当前只保存账号 handle、内容线、国家、语言和备注。不会保存密码、cookie、代理或指纹信息。</span>
        </div>
        <div class="desktop-import-grid">
          <label class="field"><span>默认内容线</span><select name="desktopImportLane">${contentLaneOptions("ai_startups")}</select></label>
          <label class="field"><span>语言</span><input name="desktopImportLanguage" type="text" value="en"></label>
          <label class="field"><span>国家</span><input name="desktopImportCountry" type="text" value="" placeholder="手动填写，例如：日本 / 美国 / 英国"></label>
          <label class="field"><span>每日上限</span><input name="desktopImportDailyLimit" type="number" min="1" max="100" value="10"></label>
        </div>
        <label class="field"><span>批量粘贴 handle</span><textarea name="desktopAccountImportText" rows="3" placeholder="@account_001&#10;@account_002"></textarea></label>
        <label class="field"><span>批量导入 CSV</span><textarea name="desktopAccountImportCsv" rows="3" placeholder="handle,lane,country,language,notes"></textarea></label>
        <div class="desktop-safety-note">网络/IP 只是人工备注，不接代理、不存 cookie/密码/指纹，也不会自动切换 IP。</div>
        <button class="button" data-account-action="import-accounts" type="button">批量导入账号</button>
      </div>
    </details>
    ${renderDesktopNetworkNotesImportDetails()}
    <div class="desktop-filter-bar">
      <input data-account-filter="query" type="search" placeholder="搜索 handle / 名称 / accountId" value="${attr(state.accountFilters.query)}">
      ${desktopFilterSelect("connection", "登录状态", accountOptionsFrom("connectionStatus"), labelConnection)}
      ${desktopFilterSelect("health", "健康状态", accountOptionsFrom("healthStatus"), labelHealth)}
      <button class="button secondary" data-account-action="reset-account-filters" type="button">重置筛选</button>
    </div>
    ${accounts.length ? renderDesktopAccountTable(accounts) : `<div class="empty">当前筛选下没有账号。</div>`}
  </section>`;
}

function renderDesktopNetworkNotesImportDetails() {
  return `<details class="desktop-import-compact" open>
    <summary>批量导入网络/IP备注（一次导入30个账号）</summary>
    <div class="desktop-import-box">
      <div class="desktop-import-head">
        <strong>只更新已有账号</strong>
        <span>网络/IP 是人工备注，用来记录每个账号常用网络和设备，不会自动切换代理或指纹。</span>
      </div>
      <label class="field">
        <span>CSV 粘贴</span>
        <textarea name="desktopNetworkNotesImportCsv" rows="5" placeholder="handle,networkNote,ipNote,deviceNote,countryRegionNote&#10;@account_01,日本住宅宽带,东京,Pixel 7,日本&#10;@account_02,美国 VPS,洛杉矶,备用手机,美国&#10;&#10;accountId,networkNote,ipNote,deviceNote,countryRegionNote&#10;xacc_xxx,日本住宅宽带,东京,Pixel 7,日本"></textarea>
      </label>
      <div class="desktop-safety-note">只匹配已存在的 handle 或 accountId；不会保存密码、cookie、代理、指纹等敏感字段，CSV 里出现这些字段会被忽略。</div>
      <button class="button" data-account-action="import-network-notes" type="button">导入网络/IP备注</button>
    </div>
  </details>`;
}

function desktopFilterSelect(key, label, options, labeler = (value) => value) {
  return `<label class="field"><span>${esc(label)}</span><select data-account-filter="${attr(key)}">
    <option value="all">全部</option>
    ${options.map((option) => `<option value="${attr(option)}" ${state.accountFilters[key] === option ? "selected" : ""}>${esc(labeler(option || "none"))}</option>`).join("")}
  </select></label>`;
}

function renderDesktopAccountTile(account) {
  const handle = account.handle || account.persona || account.accountId;
  const connection = labelConnection(accountLoginStatus(account));
  return `<article class="desktop-account-tile">
    <div class="desktop-account-title"><div><h3>${esc(handle)}</h3><span>${esc(account.persona || account.accountId)}</span></div>${badge(connection, accountLoginStatus(account) === "connected" ? "good" : "warn")}</div>
    <div class="desktop-account-facts">
      ${detailItem("登录状态", connection)}
      ${detailItem("内容线", labelLane(account.laneId || ""))}
      ${detailItem("国家", accountCountryLabel(account))}
      ${detailItem("网络/IP", accountNetworkLabel(account))}
      ${detailItem("今日任务", account.todayTasks ?? 0)}
      ${detailItem("待反馈", account.pendingFeedback ?? 0)}
      ${detailItem("健康分", `${account.healthScore ?? 0} · ${labelHealth(account.healthStatus || "watch")}`)}
    </div>
    <p class="muted small">临时工作窗只用于人工查看和人工操作，不会自动登录 X，也不会保存登录态；登录状态只由 X OAuth 或本地记录决定。</p>
    <div class="desktop-action-row">
      <button class="button secondary" data-account-action="incognito" data-account-id="${attr(account.accountId)}" type="button">打开临时窗</button>
      <button class="button secondary" data-account-action="detail" data-account-id="${attr(account.accountId)}" type="button">查看账号</button>
      <button class="button secondary" data-account-action="create-task" data-account-id="${attr(account.accountId)}" type="button">创建任务</button>
      <button class="button secondary" data-account-action="add-target" data-account-id="${attr(account.accountId)}" type="button">添加目标</button>
      <button class="button danger" data-account-action="archive" data-account-id="${attr(account.accountId)}" ${account.status === "archived" ? "disabled" : ""} type="button">归档账号</button>
    </div>
  </article>`;
}

function renderDesktopAccountTable(accounts) {
  return `<div class="desktop-account-table-wrap">
    <table class="desktop-account-table">
      <thead>
        <tr>
          <th class="index-col">序号</th>
          <th>账号</th>
          <th>登录状态</th>
          <th>内容线</th>
          <th>国家</th>
          <th>今日任务</th>
          <th>待反馈</th>
          <th>健康</th>
          <th>网络/IP</th>
          <th>备注</th>
          <th class="desktop-row-actions">操作</th>
        </tr>
      </thead>
      <tbody>
        ${accounts.map((account, index) => renderDesktopAccountTableRow(account, index)).join("")}
      </tbody>
    </table>
  </div>`;
}

function renderDesktopAccountTableRow(account, index) {
  const handle = account.handle || account.persona || account.accountId;
  const loginStatus = accountLoginStatus(account);
  const connection = labelConnection(loginStatus);
  const health = `${account.healthScore ?? 0} · ${labelHealth(account.healthStatus || "watch")}`;
  return `<tr>
    <td class="index-col">${index + 1}</td>
    <td><strong>${esc(handle)}</strong><small>${esc(account.persona || account.accountId)}</small></td>
    <td>${badge(connection, loginStatus === "connected" ? "good" : "warn")}</td>
    <td>
      <select class="inline-account-select" data-account-inline-field="laneId" data-account-id="${attr(account.accountId)}" aria-label="修改内容线">
        ${contentLaneOptions(account.laneId || "none")}
      </select>
    </td>
    <td>
      <input class="inline-account-input" data-account-inline-field="country" data-account-id="${attr(account.accountId)}" type="text" value="${attr(accountCountryValue(account))}" placeholder="-" aria-label="填写国家">
    </td>
    <td>${Number(account.todayTasks ?? 0)}</td>
    <td>${Number(account.pendingFeedback ?? 0)}</td>
    <td>${esc(health)}</td>
    <td>${esc(accountNetworkLabel(account))}</td>
    <td>${esc(account.notes || "无")}</td>
    <td class="desktop-row-actions">
      <button class="button secondary" data-account-action="incognito" data-account-id="${attr(account.accountId)}" type="button">临时窗</button>
      <button class="button secondary" data-account-action="detail" data-account-id="${attr(account.accountId)}" type="button">详情</button>
      <button class="button secondary" data-account-action="create-task" data-account-id="${attr(account.accountId)}" type="button">任务</button>
    </td>
  </tr>`;
}

function renderDesktopTasksTab() {
  const tasks = state.data.tasks || [];
  const selectedAccount = state.taskDraftAccountId || state.selectedAccountId || (state.data.accounts?.[0]?.accountId || "");
  const pending = pendingDesktopTasks();
  const confirmed = tasks.filter((task) => task.approvalStatus === "approved");
  const posted = tasks.filter((task) => ["posted", "feedback_due", "feedback_done"].includes(task.status || "") || task.postedUrl);
  const done = tasks.filter((task) => task.status === "feedback_done");
  return `<section class="desktop-product-panel">
    <div class="desktop-section-head"><div><h2>任务</h2><p class="muted">创建文案任务、复制文案、人工发布后回来标记和补反馈。不会自动发推。</p></div></div>
    <div class="desktop-mini-metrics">${detailItem("待确认", pending.length)}${detailItem("已确认", confirmed.length)}${detailItem("已发布", posted.length)}${detailItem("待反馈", posted.filter((task) => task.status !== "feedback_done").length)}${detailItem("已完成", done.length)}</div>
    <div class="desktop-create-task">
      <h3>创建任务</h3>
      <div class="desktop-import-grid">
        <label class="field"><span>选择账号</span><select name="desktopTaskAccount">${accountOptions(selectedAccount)}</select></label>
        <label class="field"><span>内容形式</span><select name="desktopTaskContentType"><option value="post">单条 X 文案</option><option value="thread">Thread 开头</option></select></label>
        <label class="field"><span>计划时间</span><input name="desktopTaskRecommendedAt" type="datetime-local"></label>
      </div>
      <label class="field"><span>文案</span><textarea name="desktopTaskCopy" rows="4" placeholder="输入不超过 280 字符的英文文案"></textarea></label>
      <div class="desktop-counter" id="desktopTaskCounter">0/280</div>
      <label class="field"><span>备注</span><input name="desktopTaskNotes" type="text" placeholder="可选"></label>
      <button class="button" data-account-action="create-task-form" type="button">保存任务</button>
    </div>
    <div class="desktop-task-list">${tasks.length ? tasks.map(renderDesktopTaskItem).join("") : `<div class="empty">暂无任务。先从账号库选择账号创建一条。</div>`}</div>
  </section>`;
}

function renderDesktopTaskItem(task) {
  const length = task.tweetLength || { weightedCharCount: task.weightedCharCount || 0 };
  const overLimit = Number(length.weightedCharCount || 0) > 280 || task.fitsTweetLimit === false;
  return `<article class="desktop-task-item">
    <div class="desktop-task-head"><div><strong>${esc(task.accountName || task.accountId || "未选择账号")}</strong><span>${esc(labelStatus(task.status || task.approvalStatus || "pending"))}</span></div>${badge(`${Number(length.weightedCharCount || 0)}/280`, overLimit ? "bad" : "good")}</div>
    <div class="copy-box">${esc(task.copyText || "")}</div>
    ${overLimit ? `<div class="desktop-safety-note danger-note">超过 280 字符，不能确认。</div>` : ""}
    <div class="desktop-action-row">
      <button class="button secondary" type="button" data-copy-detail="copyText" data-task-id="${attr(task.taskId)}">复制文案</button>
      <button class="button" data-action="approve" data-task-id="${attr(task.taskId)}" ${task.canApprove && !overLimit ? "" : "disabled"} type="button">确认</button>
      <button class="button danger" data-action="reject" data-task-id="${attr(task.taskId)}" ${task.canReject ? "" : "disabled"} type="button">拒绝</button>
      <button class="button secondary" data-desktop-task-action="mark-posted" data-task-id="${attr(task.taskId)}" ${["feedback_due", "feedback_done"].includes(task.status || "") ? "disabled" : ""} type="button">标记已发布</button>
      ${["posted", "feedback_due"].includes(task.status || "") || task.postedUrl ? `<button class="button secondary" data-desktop-tab="feedback" type="button">填写反馈</button>` : ""}
    </div>
  </article>`;
}

function renderDesktopTargetsTab() {
  const accounts = state.data.accounts || [];
  const selectedAccountId = state.selectedAccountId || accounts[0]?.accountId || "";
  const targets = state.accountTargets.get(selectedAccountId) || [];
  return `<section class="desktop-product-panel">
    <div class="desktop-section-head"><div><h2>目标关系</h2><p class="muted">目标关系只用于人工运营记录，不会自动关注。</p></div></div>
    <div class="desktop-create-task">
      <div class="desktop-import-grid">
        <label class="field"><span>选择账号</span><select data-desktop-target-account>${accountOptions(selectedAccountId)}</select></label>
        <label class="field"><span>目标 handle</span><input name="desktopTargetHandle" type="text" placeholder="@target"></label>
        <label class="field"><span>分类</span><select name="desktopTargetCategory"><option value="ai_founder">AI 创业者</option><option value="saas_founder">SaaS 创始人</option><option value="indie_builder">独立开发者</option><option value="crypto_builder">Crypto Builder</option><option value="blue_verified">蓝 V</option><option value="customer">客户</option><option value="competitor">竞品</option><option value="watch">观察</option></select></label>
      </div>
      <label class="field"><span>原因</span><input name="desktopTargetReason" type="text" placeholder="为什么要观察这个人"></label>
      <label class="field"><span>备注</span><input name="desktopTargetNotes" type="text" placeholder="可选"></label>
      <button class="button" data-account-action="add-target-form" type="button">添加目标</button>
    </div>
    <div class="desktop-task-list">${targets.length ? targets.map((target) => renderDesktopTargetItem(selectedAccountId, target)).join("") : `<div class="empty">当前账号暂无目标关系。</div>`}</div>
  </section>`;
}

function renderDesktopTargetItem(accountId, target) {
  const url = `https://x.com/${encodeURIComponent(String(target.targetHandle || "").replace(/^@/, ""))}`;
  return `<article class="desktop-task-item">
    <div class="desktop-task-head"><div><strong>${esc(target.targetHandle || "")}</strong><span>${esc(labelTargetCategory(target.category))} · ${esc(labelTargetStatus(target.status || "suggested"))}</span></div>${badge(labelTargetStatus(target.status || "suggested"))}</div>
    <p>${esc(target.reason || "无原因")}</p>
    <p class="muted">${esc(target.notes || "")}</p>
    <div class="desktop-action-row">
      <a class="button secondary" href="${attr(url)}" target="_blank" rel="noreferrer">打开主页</a>
      <button class="button secondary" data-target-status="opened" data-account-id="${attr(accountId)}" data-target-id="${attr(target.targetId)}" type="button">标记已打开</button>
      <button class="button secondary" data-target-status="followed_manually" data-account-id="${attr(accountId)}" data-target-id="${attr(target.targetId)}" type="button">标记已手动关注</button>
      <button class="button secondary" data-target-status="watch" data-account-id="${attr(accountId)}" data-target-id="${attr(target.targetId)}" type="button">加入观察</button>
      <button class="button secondary" data-target-status="ignored" data-account-id="${attr(accountId)}" data-target-id="${attr(target.targetId)}" type="button">忽略</button>
    </div>
  </article>`;
}

function renderDesktopFeedbackTab() {
  const tasks = (state.data.tasks || []).filter((task) => ["posted", "feedback_due", "feedback_done"].includes(task.status || "") || task.postedUrl);
  const debt = tasks.filter((task) => task.status !== "feedback_done");
  const riskyAccounts = (state.data.accounts || []).filter((account) => ["risky", "paused"].includes(account.healthStatus || account.status || ""));
  return `<section class="desktop-product-panel">
    <div class="desktop-section-head"><div><h2>数据反馈</h2><p class="muted">发完后补 impressions、likes、bookmarks、replies、reposts、clicks 和 profileVisits。</p></div></div>
    <div class="desktop-mini-metrics">${detailItem("未补数据", debt.length)}${detailItem("已补完", tasks.filter((task) => task.status === "feedback_done").length)}${detailItem("健康度变差", riskyAccounts.length)}</div>
    <div class="desktop-task-list">${tasks.length ? tasks.map(renderDesktopFeedbackItem).join("") : `<div class="empty">暂无已发布任务。标记已发布后，这里会出现反馈表单。</div>`}</div>
  </section>`;
}

function renderDesktopFeedbackItem(task) {
  const metrics = task.metrics || {};
  const metricInput = (key, label) => `<label class="field"><span>${esc(label)}</span><input data-feedback-metric="${attr(key)}" data-task-id="${attr(task.taskId)}" type="number" min="0" step="1" value="${attr(metrics[key] ?? 0)}"></label>`;
  return `<article class="desktop-task-item">
    <div class="desktop-task-head"><div><strong>${esc(task.accountName || task.accountId || "未选择账号")}</strong><span>${esc(labelStatus(task.status || ""))}</span></div>${badge(task.status === "feedback_done" ? "已反馈" : "待反馈", task.status === "feedback_done" ? "good" : "warn")}</div>
    <div class="copy-box">${esc(task.copyText || "")}</div>
    <div class="feedback-grid">${metricInput("impressions", "impressions")}${metricInput("likes", "likes")}${metricInput("bookmarks", "bookmarks")}${metricInput("replies", "replies")}${metricInput("reposts", "reposts")}${metricInput("clicks", "clicks")}${metricInput("profileVisits", "profileVisits")}</div>
    <label class="field"><span>备注</span><input data-feedback-notes data-task-id="${attr(task.taskId)}" type="text" placeholder="可选"></label>
    <button class="button" data-feedback-save data-task-id="${attr(task.taskId)}" type="button">保存反馈</button>
  </article>`;
}

function renderDesktopSettingsTab() {
  const status = state.xOAuthStatus || {};
  return `<section class="desktop-product-panel">
    <div class="desktop-section-head"><div><h2>设置</h2><p class="muted">本地数据、X API / OAuth 和安全边界。</p></div></div>
    <div class="desktop-settings-grid">
      <section class="desktop-setting-card"><h3>本地数据</h3>${detailItem("数据目录", state.desktopSetup?.dataDir || "未读取")}<div class="desktop-action-row"><button class="button secondary" data-account-action="open-data-dir" type="button">打开数据目录</button><button class="button secondary" data-account-action="export-backup" type="button">导出备份</button><button class="button secondary" data-account-action="import-backup" type="button">导入备份</button><button class="button danger" data-account-action="reset-demo" type="button">重置样例数据</button></div></section>
      <section class="desktop-setting-card"><h3>X API / OAuth 配置</h3><p class="muted">AI Creator OS 不保存 X 密码或 cookie。以后连接账号会使用 X 官方 OAuth；通过后用本地 tokenRef 维持 API 连接，不需要每次重新连接。</p>${detailItem("X API 状态", status.configured ? "已配置" : "未配置")}${detailItem("Client Secret", status.maskedClientSecret ? "已保存" : "未保存")}${detailItem("Token 存储", status.tokenStorageLabel || "未写入 token")}<label class="field"><span>Client ID</span><input name="xClientId" type="text" value="${attr(status.clientId || "")}"></label><label class="field"><span>Client Secret</span><input name="xClientSecret" type="password" placeholder="${attr(status.maskedClientSecret ? "已保存，重新填写可覆盖" : "未保存")}"></label><label class="field"><span>Callback URL</span><input name="xCallbackUrl" type="text" value="${attr(status.callbackUrl || defaultXCallbackUrl())}"></label><label class="field"><span>Scopes</span><input name="xScopes" type="text" value="${attr((status.scopes || ["tweet.read", "tweet.write", "users.read", "offline.access"]).join(" "))}"></label><div class="desktop-action-row"><button class="button" data-account-action="save-x-oauth-config" type="button">保存配置</button><button class="button secondary" data-account-action="test-x-oauth-config" type="button">测试配置</button><button class="button secondary" data-account-action="clear-x-oauth-config" type="button">清空配置</button></div></section>
      <section class="desktop-setting-card"><h3>桌面应用</h3>${detailItem("版本", "0.1.0")}${detailItem("默认端口", new URL(location.href).port || "5288")}${detailItem("日志目录", state.desktopSetup?.logsDir || "未读取")}<button class="button secondary" data-account-action="open-logs-dir" type="button">打开日志目录</button></section>
      <section class="desktop-setting-card"><h3>浏览器和网络说明</h3><p class="muted">临时窗口只用于人工查看网页，不会保存网页登录态。关闭后需要重新登录，这是正常行为。</p><p class="muted">如果你已经在 Chrome / Safari 登录了 X，可以用系统浏览器打开 X。AI Creator OS 不接管浏览器登录状态。</p><div class="desktop-action-row"><button class="button secondary" data-account-action="open-system-x" type="button">用系统浏览器打开 X</button></div></section>
      <section class="desktop-setting-card"><h3>安全说明</h3><ul class="desktop-safety-list"><li>不保存 X 密码。</li><li>不保存 cookie。</li><li>网络/IP 仅作为人工备注，不会切换代理、不会管理指纹、不会改变系统网络。</li><li>不做指纹浏览器。</li><li>不自动关注、点赞、评论或发推。</li></ul></section>
    </div>
  </section>`;
}

async function completeDesktopSetupFromUi(action) {
  if (!state.desktopMode) return;
  const payload = action === "demo"
    ? { mode: "demo" }
    : collectDesktopSetupPayload(ensureDesktopOverlay());
  if (payload.mode === "restore" && !payload.backupText) {
    throw new Error("请选择恢复模式时，需要粘贴 JSON 备份内容。");
  }
  await apiPost("/api/desktop/setup/complete", payload);
  ensureDesktopOverlay().innerHTML = "";
  toast("桌面本地数据已初始化");
  await loadDesktopManager();
}

function ensureDesktopOverlay() {
  let root = $("#desktopOverlay");
  if (!root) {
    root = document.createElement("div");
    root.id = "desktopOverlay";
    document.body.append(root);
  }
  return root;
}

function renderSelectors() {
  $("#workspaceSelect").innerHTML = (state.data.workspaces || []).map((workspace) => `
    <option value="${attr(workspace.workspaceId)}" ${workspace.workspaceId === state.workspaceId ? "selected" : ""}>${esc(workspace.name)}</option>
  `).join("");
  $("#managerSelect").innerHTML = (state.data.managers || []).map((manager) => `
    <option value="${attr(manager.userId)}" ${manager.userId === state.managerUserId ? "selected" : ""}>${esc(manager.name)} (${esc(manager.role)})</option>
  `).join("");
  $("#workspaceSelect").disabled = state.appMode && !state.desktopMode;
  $("#managerSelect").disabled = state.appMode && !state.desktopMode;
}

function renderModeNotice() {
  const notice = $("#modeNotice");
  if (!notice) return;
  if (state.desktopMode) {
    notice.innerHTML = `<strong>AI Creator OS Desktop</strong> 本地多账号内容运营工具箱。数据目录：<code>${esc(state.desktopSetup?.appDataDir || "appData")}</code>。这里不接 X API、不自动发布、不保存密码/cookie/代理/指纹。`;
    return;
  }
  if (state.appMode) {
    notice.innerHTML = `<strong>${state.desktopMode ? "桌面版 · " : ""}真实工作区 · Workspace App Mode</strong> 当前用户：${esc(state.session?.email || "unknown")} · ${esc(state.workspace?.name || state.data?.selectedWorkspace?.name || "Workspace")}。这里会调用 /api/app/v1 保存审核、拒绝、反馈和目标关系，并写入 audit log。无痕工作窗仅用于人工查看/人工操作，不保存浏览器登录态。`;
    return;
  }
  notice.innerHTML = state.demoMode
    ? `<strong>公开演示环境，仅可查看，不能保存或发布。</strong> 这里展示 workspace 管理端的信息架构。按钮会保留界面形态，但不会写入任务、不会连接真实 X 账号，也不会显示平台总后台。`
    : `<strong>管理端规则：</strong>这里只管理当前 workspace 的账号、任务审核、分配和反馈状态。默认控制 30 个以内账号，不显示平台总后台，不自动发推。`;
}

function renderAccessLogout() {
  const button = $("#accessLogoutButton");
  if (!button) return;
  button.hidden = !state.appMode || state.desktopMode;
}

function logoutFromAccess() {
  const logoutUrl = new URL("/cdn-cgi/access/logout", location.origin);
  location.href = logoutUrl.toString();
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
  if (state.desktopMode) {
    const lanes = state.data.selectedWorkspace?.enabledLaneIds || [];
    $("#workspaceResources").innerHTML = `
      <div class="desktop-exec-strip">
        <div class="desktop-exec-status">
          <strong>执行状态</strong>
          <span>${esc(accounts.length)}/${esc(accountLimit)} 账号 · ${esc(staff.length)} 执行人员 · 本地 JSON</span>
        </div>
        <div class="desktop-lane-checks">
          ${lanes.map((lane) => `<label><input type="checkbox" checked disabled> ${esc(lane)}</label>`).join("") || `<span class="muted">暂无启用内容线</span>`}
        </div>
      </div>
    `;
    return;
  }
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
      ${state.desktopMode ? renderDesktopSettingsCards() : ""}
    </div>
  `;
}

function renderDesktopSettingsCards() {
  return `
    <div class="resource-card desktop-settings-card">
      <strong>桌面数据目录</strong>
      <span>${esc(state.desktopSetup?.appDataDir || "appData")}</span>
    </div>
    <div class="resource-card desktop-settings-card">
      <strong>运行模式</strong>
      <span>本地模式 · ${esc(state.desktopSetup?.storageMode || "json")} · port ${esc(new URL(location.href).port || "5288")}</span>
    </div>
    <div class="desktop-settings-actions">
      <button class="button secondary" data-account-action="open-data-dir" type="button">打开数据目录</button>
      <button class="button secondary" data-account-action="open-logs-dir" type="button">打开日志目录</button>
      <button class="button secondary" data-account-action="export-backup" type="button">导出备份</button>
      <button class="button secondary" data-account-action="import-backup" type="button">导入备份</button>
      <button class="button danger" data-account-action="reset-demo" type="button">重置样例数据</button>
    </div>
  `;
}

function renderAccountVault() {
  const root = $("#accountVault");
  if (!root) return;
  const accounts = filteredAccounts();
  const allSelectable = accounts.length > 0 && accounts.every((account) => state.selectedAccountIds.has(account.accountId));
  const desktopTools = state.desktopMode
    ? `<div class="desktop-import-box">
        <div class="desktop-import-head">
          <strong>添加 / 导入账号</strong>
        <span>只保存 handle、内容线、国家、语言和备注。</span>
        </div>
        <div class="desktop-import-grid">
          <label class="field">
            <span>默认内容线</span>
            <select name="desktopImportLane">
              ${contentLaneOptions("ai_startups")}
            </select>
          </label>
          <label class="field">
            <span>语言</span>
            <input name="desktopImportLanguage" type="text" value="en">
          </label>
          <label class="field">
            <span>国家</span>
            <input name="desktopImportCountry" type="text" value="">
          </label>
          <label class="field">
            <span>每日上限</span>
            <input name="desktopImportDailyLimit" type="number" min="1" max="100" value="10">
          </label>
        </div>
        <label class="field">
          <span>批量粘贴 handle</span>
          <textarea name="desktopAccountImportText" rows="3" placeholder="@account_001&#10;@account_002"></textarea>
        </label>
        <label class="field">
          <span>CSV</span>
          <textarea name="desktopAccountImportCsv" rows="3" placeholder="handle,lane,country,language,notes"></textarea>
        </label>
        <div class="desktop-safety-note">AI Creator OS 不保存账号密码、cookie、代理或指纹信息。CSV 里出现这些字段会被忽略。</div>
        <div class="desktop-inline-actions">
          <button class="button" data-account-action="import-accounts" type="button">导入账号</button>
          <button class="button secondary" data-account-action="add-account" type="button">手动添加账号</button>
          <button class="button secondary" data-account-action="export-accounts" type="button">导出账号</button>
        </div>
      </div>`
    : "";
  if (state.desktopMode) {
    root.innerHTML = renderDesktopAccountConsole({ accounts, allSelectable, desktopTools });
    return;
  }
  root.innerHTML = `
    <div class="vault-head">
      <div>
        <h2>账号资产库</h2>
        <p class="muted">单账号工作窗、任务、反馈、健康度和关系目标。</p>
      </div>
      <div class="vault-tools">${state.desktopMode ? badge("本地工具箱", "good") : ""}</div>
    </div>
    ${desktopTools}
    <div class="vault-filters">
      <input data-account-filter="query" type="search" placeholder="搜索 handle / persona" value="${attr(state.accountFilters.query)}">
      ${filterSelect("lane", "内容线", accountOptionsFrom("laneId"))}
      ${filterSelect("status", "账号状态", accountOptionsFrom("status"))}
      ${filterSelect("connection", "登录状态", accountOptionsFrom("connectionStatus"), labelConnection)}
      ${filterSelect("health", "健康状态", accountOptionsFrom("healthStatus"))}
      ${filterSelect("region", "国家", accountRegionOptions())}
    </div>
    <div class="account-bulk">
      <label class="batch-select-all">
        <input type="checkbox" data-select-all-accounts ${allSelectable ? "checked" : ""} ${accounts.length ? "" : "disabled"}>
        <span>已选 ${esc(state.selectedAccountIds.size)} / ${esc(accounts.length)}</span>
      </label>
      <span class="muted">账号批量导入、筛选和导出可用；任务批量处理在右侧审核队列完成。</span>
    </div>
    <div class="account-grid">
      ${accounts.length ? accounts.map(renderAccountCard).join("") : `<div class="empty">当前筛选下没有账号。</div>`}
    </div>
  `;
}

function renderDesktopAccountConsole({ accounts, allSelectable, desktopTools }) {
  return `
    <div class="desktop-console-head">
      <div>
        <h2>账号控制台</h2>
        <p class="muted">像表格软件一样管理账号、状态、任务和人工工作窗。</p>
      </div>
      <div class="desktop-console-actions">
        ${badge("本地工具箱", "good")}
        <button class="button secondary" data-account-action="export-accounts" type="button">导出账号</button>
      </div>
    </div>
    <details class="desktop-import-compact">
      <summary>添加 / 批量导入账号</summary>
      ${desktopTools}
    </details>
    ${state.desktopMode ? renderDesktopNetworkNotesImportDetails() : ""}
    <details class="desktop-import-compact desktop-local-tools">
      <summary>本地数据 / 备份工具</summary>
      <div class="desktop-settings-actions">
        <button class="button secondary" data-account-action="open-data-dir" type="button">打开数据目录</button>
        <button class="button secondary" data-account-action="open-logs-dir" type="button">打开日志目录</button>
        <button class="button secondary" data-account-action="export-backup" type="button">导出备份</button>
        <button class="button secondary" data-account-action="import-backup" type="button">导入备份</button>
        <button class="button danger" data-account-action="reset-demo" type="button">重置样例数据</button>
      </div>
    </details>
    <div class="desktop-filter-bar">
      <input data-account-filter="query" type="search" placeholder="搜索 handle / persona / accountId" value="${attr(state.accountFilters.query)}">
      ${filterSelect("connection", "登录状态", accountOptionsFrom("connectionStatus"), labelConnection)}
      ${filterSelect("health", "健康状态", accountOptionsFrom("healthStatus"))}
    </div>
    <div class="desktop-table-toolbar">
      <label class="desktop-checkline">
        <input type="checkbox" data-select-all-accounts ${allSelectable ? "checked" : ""} ${accounts.length ? "" : "disabled"}>
        <span>已选 ${esc(state.selectedAccountIds.size)} / ${esc(accounts.length)}</span>
      </label>
      <button class="button secondary" data-account-action="reset-account-filters" type="button">重置筛选</button>
      <span class="muted">批量写入请用上方导入；任务处理在“任务”里完成。</span>
    </div>
    <div class="desktop-account-table-wrap">
      <table class="desktop-account-table">
        <thead>
          <tr>
            <th class="check-col">运行</th>
            <th class="index-col">序号</th>
            <th>X 账号</th>
            <th>内容线</th>
            <th>登录状态</th>
            <th>健康</th>
            <th>今日任务</th>
            <th>已发</th>
            <th>待反馈</th>
            <th>7日发布</th>
            <th>外链</th>
            <th>国家</th>
            <th>网络/IP</th>
            <th>语言</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${accounts.length ? accounts.map(renderDesktopAccountRow).join("") : `<tr><td colspan="15" class="desktop-empty-cell">当前筛选下没有账号。</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderDesktopAccountRow(account, index) {
  const healthStatus = account.healthStatus || "unknown";
  const healthScore = account.healthScore ?? 0;
  const healthType = healthStatus === "healthy" ? "good" : healthStatus === "watch" ? "warn" : "bad";
  const connectionStatus = accountLoginStatus(account);
  const connectionType = connectionStatus === "connected" ? "good" : "warn";
  return `<tr class="${account.status === "archived" ? "is-archived" : ""}">
    <td class="check-col">
      <input type="checkbox" data-select-account data-account-id="${attr(account.accountId)}" ${state.selectedAccountIds.has(account.accountId) ? "checked" : ""}>
    </td>
    <td class="index-col">${esc(index + 1)}</td>
    <td title="${attr(account.accountId)}">
      <strong>${esc(account.handle || account.persona || account.accountId)}</strong>
      <small>${esc(account.persona || account.accountId)}</small>
    </td>
    <td>
      <select class="inline-account-select" data-account-inline-field="laneId" data-account-id="${attr(account.accountId)}" aria-label="修改内容线">
        ${contentLaneOptions(account.laneId || "none")}
      </select>
    </td>
    <td>${badge(labelConnection(connectionStatus), connectionType)}</td>
    <td>${badge(`${healthScore} · ${labelHealth(healthStatus)}`, healthType)}</td>
    <td>${esc(account.todayTasks ?? 0)}</td>
    <td>${esc(account.todayPublished ?? 0)}</td>
    <td>${esc(account.pendingFeedback ?? 0)}</td>
    <td>${esc(account.sevenDayPosts ?? 0)}</td>
    <td>${esc(account.sevenDayExternalLinks ?? 0)}</td>
    <td>
      <input class="inline-account-input" data-account-inline-field="country" data-account-id="${attr(account.accountId)}" type="text" value="${attr(accountCountryValue(account))}" placeholder="-" aria-label="填写国家">
    </td>
    <td>${esc(accountNetworkLabel(account))}</td>
    <td>${esc(account.language || "en")}</td>
    <td class="desktop-row-actions">
      <button class="button secondary" data-account-action="incognito" data-account-id="${attr(account.accountId)}" type="button">临时窗</button>
      <button class="button secondary" data-account-action="create-task" data-account-id="${attr(account.accountId)}" type="button">任务</button>
      <button class="button secondary" data-account-action="detail" data-account-id="${attr(account.accountId)}" type="button">详情</button>
    </td>
  </tr>`;
}

function renderAccountCard(account) {
  const handle = account.handle || "";
  const xLabel = handle || account.persona || account.accountId;
  return `<article class="account-card">
    <div class="account-card-top">
      <label class="task-check">
        <input type="checkbox" data-select-account data-account-id="${attr(account.accountId)}" ${state.selectedAccountIds.has(account.accountId) ? "checked" : ""}>
        <div>
          <h3>${esc(handle || account.persona || account.accountId)}</h3>
          <span class="muted">${esc(account.workspace)} · ${esc(account.laneId || "no lane")}</span>
        </div>
      </label>
      ${badge(`${account.healthScore}`, account.healthStatus === "healthy" ? "good" : account.healthStatus === "watch" ? "warn" : "bad")}
    </div>
    <div class="badges">
      ${badge(labelConnection(accountLoginStatus(account)), accountLoginStatus(account) === "connected" ? "good" : "warn")}
      ${badge(account.publishMode || "manual")}
      ${badge(labelHealth(account.healthStatus), account.healthStatus === "healthy" ? "good" : account.healthStatus === "watch" ? "warn" : "bad")}
    </div>
    <div class="account-facts">
      ${detailItem("国家", accountCountryLabel(account))}
      ${detailItem("network/IP", accountNetworkLabel(account))}
      ${detailItem("language", account.language || "en")}
      ${detailItem("dailyPostLimit", account.dailyPostLimit)}
      ${detailItem("externalLinkLimit", account.externalLinkLimit)}
      ${detailItem("今日任务", account.todayTasks)}
      ${detailItem("今日已发布", account.todayPublished)}
      ${detailItem("待反馈", account.pendingFeedback)}
      ${detailItem("7 日发布", account.sevenDayPosts)}
      ${detailItem("7 日外链", account.sevenDayExternalLinks)}
    </div>
    <div class="risk-line">${(account.riskFlags || []).length ? account.riskFlags.map((flag) => badge(flag, "warn")).join("") : badge("no risk flags", "good")}</div>
    <div class="account-actions">
      <button class="button" data-account-action="incognito" data-account-id="${attr(account.accountId)}" ${state.desktopMode ? "" : "disabled title=\"请在桌面 App 中打开\""} type="button">${state.desktopMode ? "打开临时窗" : "请在桌面 App 中打开"}</button>
      <button class="button secondary" data-account-action="create-task" data-account-id="${attr(account.accountId)}" ${state.desktopMode ? "" : "disabled"} type="button">创建任务</button>
      <button class="button secondary" data-account-action="add-target" data-account-id="${attr(account.accountId)}" ${state.appMode || state.desktopMode ? "" : "disabled"} type="button">添加目标</button>
      <button class="button secondary" data-account-action="detail" data-account-id="${attr(account.accountId)}" type="button">查看详情</button>
      <button class="button secondary" data-account-action="tasks" data-account-id="${attr(account.accountId)}" type="button">查看任务</button>
      <button class="button secondary" data-account-action="posts" data-account-id="${attr(account.accountId)}" type="button">查看发布记录</button>
      <button class="button secondary" data-account-action="feedback" data-account-id="${attr(account.accountId)}" type="button">查看反馈</button>
      <button class="button secondary" data-account-action="targets" data-account-id="${attr(account.accountId)}" type="button">目标关系</button>
      <button class="button danger" data-account-action="archive" data-account-id="${attr(account.accountId)}" ${state.desktopMode && account.status !== "archived" ? "" : "disabled"} type="button">归档</button>
    </div>
    <div class="oauth-actions">
      <button class="button secondary" disabled type="button">${account.connectionStatus === "connected" ? "重新连接 X 账号" : "连接 X 账号"}</button>
      <button class="button secondary" disabled type="button">断开连接</button>
    </div>
  </article>`;
}

function filteredAccounts() {
  const filters = state.accountFilters;
  const query = filters.query.trim().toLowerCase();
  return (state.data.accounts || [])
    .filter((account) => !query || [account.handle, account.persona, account.accountId].some((value) => String(value || "").toLowerCase().includes(query)))
    .filter((account) => filters.lane === "all" || (account.laneId || "") === filters.lane)
    .filter((account) => filters.status === "all" || (account.status || "") === filters.status)
    .filter((account) => filters.connection === "all" || (account.connectionStatus || "") === filters.connection)
    .filter((account) => filters.health === "all" || (account.healthStatus || "") === filters.health)
    .filter((account) => filters.region === "all" || accountRegionValue(account) === filters.region);
}

function handleAccountSelectionOrFilter(input) {
  if (input.dataset.selectAccount !== undefined) {
    if (input.checked) state.selectedAccountIds.add(input.dataset.accountId);
    else state.selectedAccountIds.delete(input.dataset.accountId);
    if (state.desktopMode) render();
    else renderAccountVault();
    return;
  }
  if (input.dataset.selectAllAccounts !== undefined) {
    for (const account of filteredAccounts()) {
      if (input.checked) state.selectedAccountIds.add(account.accountId);
      else state.selectedAccountIds.delete(account.accountId);
    }
    if (state.desktopMode) render();
    else renderAccountVault();
    return;
  }
  const key = input.dataset.accountFilter;
  if (key && Object.hasOwn(state.accountFilters, key)) {
    state.accountFilters[key] = input.value;
    if (state.desktopMode) render();
    else renderAccountVault();
  }
}

async function handleAccountAction(action, accountId, sourceElement = null) {
  if (action === "connect-x") {
    try {
      const data = await apiGet("/api/oauth/x/start");
      const url = data.authorizationUrl;
      if (url && state.desktopMode && window.aiCreatorOS?.openExternalUrl) {
        await window.aiCreatorOS.openExternalUrl(url);
        toast("已在系统浏览器打开 X 登录页，可复用已登录账号");
      } else if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        toast("已打开 X 官方登录页面");
      }
    } catch (error) {
      toast(error.message || "请先在设置里配置 X API / OAuth。");
      state.activeDesktopTab = "settings";
      render();
    }
    return;
  }
  if (action === "save-x-oauth-config") {
    const payload = collectXOAuthConfigPayload();
    state.xOAuthStatus = await apiPost("/api/desktop/x-oauth/config", payload);
    toast("X API / OAuth 配置已保存");
    render();
    return;
  }
  if (action === "clear-x-oauth-config") {
    if (!confirm("确认清空本地 X API / OAuth 配置？")) return;
    state.xOAuthStatus = await apiPost("/api/desktop/x-oauth/clear", {});
    toast("X API / OAuth 配置已清空");
    render();
    return;
  }
  if (action === "test-x-oauth-config") {
    state.xOAuthStatus = await apiGet("/api/desktop/x-oauth/status");
    toast(state.xOAuthStatus.configured ? "X API / OAuth 配置完整" : "请先在设置里配置 X API / OAuth。");
    render();
    return;
  }
  if (action === "open-system-x") {
    const account = accountId ? findAccount(accountId) : null;
    const url = account?.handle ? `https://x.com/${encodeURIComponent(account.handle.replace(/^@/, ""))}` : "https://x.com/home";
    if (state.desktopMode && window.aiCreatorOS?.openExternalUrl) {
      await window.aiCreatorOS.openExternalUrl(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    toast("已用系统浏览器打开 X。AI Creator OS 不保存网页登录态。");
    return;
  }
  if (action === "create-task-form") {
    await createDesktopTaskFromForm();
    return;
  }
  if (action === "add-target-form") {
    await addRelationshipTargetFromForm();
    return;
  }
  if (action === "open-data-dir") {
    if (!window.aiCreatorOS?.openDataDirectory) throw new Error("需要桌面版。");
    await window.aiCreatorOS.openDataDirectory();
    toast("已打开数据目录");
    return;
  }
  if (action === "open-logs-dir") {
    if (!window.aiCreatorOS?.openLogsDirectory) throw new Error("需要桌面版。");
    await window.aiCreatorOS.openLogsDirectory();
    toast("已打开日志目录");
    return;
  }
  if (action === "export-backup") {
    if (!window.aiCreatorOS?.exportBackup) throw new Error("需要桌面版。");
    const result = await window.aiCreatorOS.exportBackup();
    toast(`备份已导出：${result.path}`);
    return;
  }
  if (action === "import-backup") {
    const backupText = prompt("粘贴 AI Creator OS Desktop JSON 备份内容：", "");
    if (!backupText) return;
    await apiPost("/api/desktop/backup/import", { backupText, workspaceId: state.workspaceId });
    toast("备份已导入");
    await loadDesktopManager();
    return;
  }
  if (action === "reset-demo") {
    if (!confirm("确认重置为样例数据？当前本地数据会被覆盖，系统会先保留 JSON 备份。")) return;
    await apiPost("/api/desktop/demo/reset", {});
    toast("样例数据已重置");
    await loadDesktopManager();
    return;
  }
  if (action === "import-accounts") {
    const root = sourceElement?.closest(".desktop-import-box") || document;
    const payload = collectDesktopImportPayload(root, state.workspaceId || "workspace_default");
    const result = await apiPost("/api/desktop/accounts/import", payload);
    toast(result.warning || `已导入 ${result.count} 个账号`);
    await loadDesktopManager();
    return;
  }
  if (action === "import-network-notes") {
    const root = sourceElement?.closest(".desktop-import-box") || document;
    const payload = collectDesktopNetworkNotesPayload(root, state.workspaceId || "workspace_default");
    if (!payload.csv) throw new Error("请先粘贴网络/IP备注 CSV。");
    const result = await apiPost("/api/desktop/accounts/network-notes/import", payload);
    const ignored = result.ignoredFields?.length ? `，已忽略字段：${result.ignoredFields.join(", ")}` : "";
    toast(`已更新 ${result.updatedCount} 个账号，跳过 ${result.skippedCount} 个${ignored}`);
    await loadDesktopManager();
    return;
  }
  if (action === "add-account") {
    const handle = prompt("添加账号 handle，例如 @my_account：", "@");
    if (!handle || handle === "@") return;
    const laneId = laneFromChoice(prompt("选择内容线：1 AI 创业圈 / 2 独立开发者圈 / 3 SaaS 创始人圈 / 4 Crypto 圈 / 5 未分类", "1"));
    const country = prompt("国家（可留空，手动填写，例如：日本 / 美国 / 英国）：", "") || "";
    const notes = prompt("备注（可选）：", "") || "";
    await apiPost("/api/desktop/accounts/upsert", {
      workspaceId: state.workspaceId || "workspace_default",
      handle,
      laneId,
      country,
      notes,
      accountType: "demo",
      connectionStatus: "not_connected"
    });
    toast("账号已添加，默认未登录");
    await loadDesktopManager();
    return;
  }
  if (action === "export-accounts") {
    const query = new URLSearchParams({ workspaceId: state.workspaceId || "workspace_default" });
    const result = await apiGet(`/api/desktop/accounts/export?${query}`);
    await downloadText("ai-creator-os-accounts.csv", result.csv || "");
    toast("账号 CSV 已导出");
    return;
  }
  if (action === "reset-account-filters") {
    state.accountFilters = {
      query: "",
      lane: "all",
      status: "all",
      connection: "all",
      health: "all",
      region: "all"
    };
    state.selectedAccountIds.clear();
    render();
    toast("账号筛选已重置");
    return;
  }
  const account = findAccount(accountId);
  if (!account) throw new Error("账号不存在。");
  if (action === "incognito") {
    await openTemporaryAccountWindow(account);
    toast("已打开临时工作窗");
    return;
  }
  if (action === "copy-handle") {
    await navigator.clipboard.writeText(account.handle || "");
    toast("已复制 handle");
    return;
  }
  if (action === "save-account-config") {
    const payload = collectAccountConfigPayload(account.accountId);
    await apiPost("/api/desktop/accounts/update", payload);
    toast("账号配置已保存");
    await loadDesktopManager();
    await openAccountDrawer(account.accountId, "config");
    return;
  }
  if (action === "add-target") {
    state.selectedAccountId = account.accountId;
    state.activeDesktopTab = "targets";
    await ensureDesktopTargetsLoaded();
    render();
    return;
  }
  if (action === "create-task") {
    state.taskDraftAccountId = account.accountId;
    state.selectedAccountId = account.accountId;
    state.activeDesktopTab = "tasks";
    render();
    return;
  }
  if (action === "archive") {
    if (!confirm(`确认归档 ${account.handle || account.accountId}？归档不是硬删除。`)) return;
    await apiPost("/api/desktop/accounts/delete", { accountId: account.accountId });
    toast("账号已归档");
    await loadDesktopManager();
    return;
  }
  await openAccountDrawer(accountId, action);
}

async function openTemporaryAccountWindow(account) {
  const payload = {
    workspaceId: state.workspaceId || account.workspaceId,
    accountId: account.accountId,
    handle: account.handle,
    mode: "electron"
  };
  if (window.aiCreatorOS?.openIncognitoAccountWindow) {
    return window.aiCreatorOS.openIncognitoAccountWindow(payload);
  }
  return apiPost("/api/desktop/accounts/incognito", payload);
}

async function createDesktopTaskForAccount(account) {
  const copyText = prompt(`为 ${account.handle || account.accountId} 创建任务文案（必须不超过 280 weighted chars）：`, "");
  if (!copyText) return;
  const notes = prompt("任务备注（可选）：", "") || "";
  await apiPost("/api/desktop/tasks/create", {
    workspaceId: state.workspaceId || account.workspaceId || "workspace_default",
    accountId: account.accountId,
    assignedTo: state.managerUserId || "user_owner",
    copyText,
    notes
  });
  toast("任务已创建，已进入待审核");
  await loadDesktopManager();
}

async function createDesktopTaskFromForm() {
  const accountId = document.querySelector("[name=\"desktopTaskAccount\"]")?.value || "";
  const copyText = document.querySelector("[name=\"desktopTaskCopy\"]")?.value?.trim() || "";
  const notes = document.querySelector("[name=\"desktopTaskNotes\"]")?.value?.trim() || "";
  const contentType = document.querySelector("[name=\"desktopTaskContentType\"]")?.value || "post";
  const recommendedAt = document.querySelector("[name=\"desktopTaskRecommendedAt\"]")?.value || "";
  if ([...copyText].length > 280) throw new Error("文案超过 280 字符，请先缩短。");
  await apiPost("/api/desktop/tasks/create", {
    workspaceId: state.workspaceId || "workspace_default",
    accountId,
    assignedTo: state.managerUserId || "user_owner",
    copyText,
    contentType,
    recommendedAt,
    notes
  });
  toast("任务已保存，等待确认");
  await loadDesktopManager();
}

async function addRelationshipTargetFromForm() {
  const accountId = document.querySelector("[data-desktop-target-account]")?.value || state.selectedAccountId || "";
  const account = findAccount(accountId);
  if (!account) throw new Error("请先选择账号。");
  const targetHandle = document.querySelector("[name=\"desktopTargetHandle\"]")?.value || "";
  const category = document.querySelector("[name=\"desktopTargetCategory\"]")?.value || "watch";
  const reason = document.querySelector("[name=\"desktopTargetReason\"]")?.value || "";
  const notes = document.querySelector("[name=\"desktopTargetNotes\"]")?.value || "";
  await apiPost("/api/desktop/targets/import", {
    workspaceId: state.workspaceId || account.workspaceId || "workspace_default",
    accountId,
    targetHandle,
    category,
    reason,
    notes,
    status: "suggested"
  });
  state.selectedAccountId = accountId;
  await loadTargets(accountId);
  toast("目标已添加");
  render();
}

function collectXOAuthConfigPayload() {
  return {
    clientId: document.querySelector("[name=\"xClientId\"]")?.value?.trim() || "",
    clientSecret: document.querySelector("[name=\"xClientSecret\"]")?.value || "",
    callbackUrl: document.querySelector("[name=\"xCallbackUrl\"]")?.value?.trim() || "",
    scopes: document.querySelector("[name=\"xScopes\"]")?.value?.trim() || ""
  };
}

function collectAccountConfigPayload(accountId) {
  return {
    accountId,
    laneId: document.querySelector(`[name="accountLaneId"][data-account-id="${CSS.escape(accountId)}"]`)?.value || "none",
    country: document.querySelector(`[name="accountCountry"][data-account-id="${CSS.escape(accountId)}"]`)?.value?.trim() || "",
    language: document.querySelector(`[name="accountLanguage"][data-account-id="${CSS.escape(accountId)}"]`)?.value?.trim() || "en",
    networkLabel: document.querySelector(`[name="accountNetworkLabel"][data-account-id="${CSS.escape(accountId)}"]`)?.value?.trim() || "",
    ipNote: document.querySelector(`[name="accountIpNote"][data-account-id="${CSS.escape(accountId)}"]`)?.value?.trim() || "",
    deviceNote: document.querySelector(`[name="accountDeviceNote"][data-account-id="${CSS.escape(accountId)}"]`)?.value?.trim() || "",
    countryRegionNote: document.querySelector(`[name="accountCountryRegionNote"][data-account-id="${CSS.escape(accountId)}"]`)?.value?.trim() || "",
    notes: document.querySelector(`[name="accountNotes"][data-account-id="${CSS.escape(accountId)}"]`)?.value?.trim() || ""
  };
}

async function saveInlineAccountField(input) {
  const accountId = input.dataset.accountId || "";
  const field = input.dataset.accountInlineField || "";
  const account = findAccount(accountId);
  if (!account) throw new Error("账号不存在。");
  if (input.dataset.saving === "1") return;
  const value = String(input.value || "").trim();
  if (field === "laneId" && value === (account.laneId || "none")) return;
  if (field === "country" && value === accountCountryValue(account)) return;
  if (!["laneId", "country"].includes(field)) return;
  input.dataset.saving = "1";
  input.disabled = true;
  try {
    await apiPost("/api/desktop/accounts/update", {
      accountId,
      [field]: value
    });
    toast(field === "laneId" ? "内容线已保存" : "国家已保存");
    await loadDesktopManager();
  } finally {
    input.disabled = false;
    delete input.dataset.saving;
  }
}

function updateDesktopTaskCounter() {
  const counter = $("#desktopTaskCounter");
  if (!counter) return;
  const text = document.querySelector("[name=\"desktopTaskCopy\"]")?.value || "";
  const count = [...text].length;
  counter.textContent = `${count}/280`;
  counter.classList.toggle("bad", count > 280);
}

async function openAccountDrawer(accountId, section = "detail") {
  const account = findAccount(accountId);
  if (!account) return;
  state.selectedAccountId = accountId;
  if (state.appMode || state.desktopMode) await loadTargets(accountId);
  const drawer = $("#accountDrawer");
  const backdrop = $("#accountDrawerBackdrop");
  drawer.hidden = false;
  backdrop.hidden = false;
  drawer.innerHTML = renderAccountDrawer(account, section);
}

function closeAccountDrawer() {
  $("#accountDrawer").hidden = true;
  $("#accountDrawerBackdrop").hidden = true;
  state.selectedAccountId = "";
}

function renderAccountDrawer(account, section) {
  const tasks = (state.data.tasks || []).filter((task) => task.accountId === account.accountId);
  const targets = state.accountTargets.get(account.accountId) || [];
  const posted = tasks.filter((task) => task.postedAt || task.postedUrl || ["posted", "feedback_due"].includes(task.status));
  const feedbackRows = tasks.filter((task) => task.metrics && Object.keys(task.metrics).length);
  const xUrl = account.handle ? `https://x.com/${encodeURIComponent(account.handle.replace(/^@/, ""))}` : "https://x.com/home";
  return `<div class="drawer-head">
    <div>
      <p class="eyebrow">账号详情</p>
      <h2>${esc(account.handle || account.persona || account.accountId)}</h2>
      <p class="muted">${esc(account.accountId)}</p>
    </div>
    <button class="button secondary" data-close-account-drawer type="button">关闭</button>
  </div>
  <div class="drawer-actions">
    <button class="button" data-account-action="incognito" data-account-id="${attr(account.accountId)}" ${state.desktopMode ? "" : "disabled"} type="button">打开临时窗</button>
    <button class="button secondary" data-account-action="open-system-x" data-account-id="${attr(account.accountId)}" type="button">用系统浏览器打开 X</button>
    <button class="button secondary" data-account-action="create-task" data-account-id="${attr(account.accountId)}" ${state.desktopMode ? "" : "disabled"} type="button">创建任务</button>
    <button class="button secondary" data-account-action="add-target" data-account-id="${attr(account.accountId)}" ${state.appMode || state.desktopMode ? "" : "disabled"} type="button">添加目标关系</button>
    <button class="button secondary" data-account-action="copy-handle" data-account-id="${attr(account.accountId)}" type="button">复制 handle</button>
    <button class="button secondary" data-account-action="export-accounts" data-account-id="${attr(account.accountId)}" ${state.desktopMode ? "" : "disabled"} type="button">导出账号数据</button>
    <button class="button danger" data-account-action="archive" data-account-id="${attr(account.accountId)}" ${state.desktopMode && account.status !== "archived" ? "" : "disabled"} type="button">归档账号</button>
  </div>
  <section class="drawer-section">
    <h3>基础信息</h3>
    <div class="detail-grid">
      ${detailItem("handle", account.handle || "none")}
      ${detailItem("accountId", account.accountId)}
      ${detailItem("内容线", labelLane(account.laneId || ""))}
      ${detailItem("国家", accountCountryLabel(account))}
      ${detailItem("网络/IP", accountNetworkLabel(account))}
      ${detailItem("窗口会话", labelSessionMode(account.sessionMode))}
      ${detailItem("语言", account.language || "en")}
      ${detailItem("登录状态", labelConnection(accountLoginStatus(account)))}
      ${detailItem("发布方式", "手动")}
    </div>
  </section>
  <section class="drawer-section ${section === "config" ? "focused" : ""}">
    <h3>账号配置</h3>
    <div class="desktop-import-grid">
      <label class="field"><span>修改内容线</span><select name="accountLaneId" data-account-id="${attr(account.accountId)}">${contentLaneOptions(account.laneId || "none")}</select></label>
      <label class="field"><span>国家</span><input name="accountCountry" data-account-id="${attr(account.accountId)}" type="text" value="${attr(accountCountryValue(account))}" placeholder="手动填写，例如：日本 / 美国 / 英国"></label>
      <label class="field"><span>语言</span><input name="accountLanguage" data-account-id="${attr(account.accountId)}" type="text" value="${attr(account.language || "en")}"></label>
    </div>
    <h3>网络/IP 配置</h3>
    <p class="muted">这里只做人工备注，不切换代理、不保存代理账号密码、不管理指纹、不改变系统网络。</p>
    <div class="desktop-import-grid">
      <label class="field"><span>网络备注</span><input name="accountNetworkLabel" data-account-id="${attr(account.accountId)}" type="text" value="${attr(account.networkLabel || "")}" placeholder="例如：日本住宅宽带 / 美国 VPS / 自用网络"></label>
      <label class="field"><span>IP 归属备注</span><input name="accountIpNote" data-account-id="${attr(account.accountId)}" type="text" value="${attr(account.ipNote || "")}" placeholder="例如：东京 / 洛杉矶 / 家庭网络"></label>
      <label class="field"><span>设备备注</span><input name="accountDeviceNote" data-account-id="${attr(account.accountId)}" type="text" value="${attr(account.deviceNote || "")}" placeholder="例如：MacBook / 备用手机 / 自用设备"></label>
      <label class="field"><span>国家/地区备注</span><input name="accountCountryRegionNote" data-account-id="${attr(account.accountId)}" type="text" value="${attr(account.countryRegionNote || "")}" placeholder="例如：日本 / 美国 / 英国"></label>
    </div>
    <label class="field"><span>备注</span><textarea name="accountNotes" data-account-id="${attr(account.accountId)}" rows="3">${esc(account.notes || "")}</textarea></label>
    <div class="desktop-action-row">
      <button class="button" data-account-action="save-account-config" data-account-id="${attr(account.accountId)}" type="button">保存账号配置</button>
      <button class="button secondary" data-account-action="connect-x" data-account-id="${attr(account.accountId)}" type="button">${accountLoginStatus(account) === "connected" ? "重新连接 X 账号" : "连接 X 账号"}</button>
    </div>
  </section>
  <section class="drawer-section ${section === "tasks" ? "focused" : ""}">
    <h3>今日任务</h3>
    ${tasks.length ? tasks.slice(0, 12).map((task) => `<div class="mini-row"><strong>${esc(task.taskId)}</strong><span>${esc(task.copyText || task.toolName || "")}</span><span>${esc(labelStatus(task.approvalStatus))} / ${esc(labelStatus(task.status))} / ${esc(task.metrics ? "已反馈" : "待反馈")}</span></div>`).join("") : `<div class="empty">暂无任务。</div>`}
  </section>
  <section class="drawer-section ${section === "posts" ? "focused" : ""}">
    <h3>发布历史</h3>
    ${posted.length ? posted.slice(0, 12).map((task) => `<div class="mini-row"><strong>${esc(task.postedAt || "no date")}</strong><span>${esc(task.postedUrl || "no url")}</span><span>${esc(task.variantType || "post")} · links ${(task.externalLinks || []).length} · impressions ${Number(task.metrics?.impressions || 0)}</span></div>`).join("") : `<div class="empty">暂无发布记录。</div>`}
  </section>
  <section class="drawer-section ${section === "feedback" ? "focused" : ""}">
    <h3>反馈历史</h3>
    ${feedbackRows.length ? feedbackRows.slice(0, 12).map((task) => `<div class="mini-row"><strong>${esc(task.taskId)}</strong><span>impressions ${Number(task.metrics?.impressions || 0)} · likes ${Number(task.metrics?.likes || 0)} · bookmarks ${Number(task.metrics?.bookmarks || 0)}</span><span>replies ${Number(task.metrics?.replies || 0)} · clicks ${Number(task.metrics?.clicks || 0)} · profile ${Number(task.metrics?.profileVisits || 0)}</span></div>`).join("") : `<div class="empty">暂无反馈。</div>`}
  </section>
  <section class="drawer-section">
    <h3>健康度解释</h3>
    <div class="detail-grid">
      ${detailItem("healthScore", account.healthScore)}
      ${detailItem("healthStatus", account.healthStatus)}
    </div>
    <ul>${(account.healthExplanations || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
  </section>
  <section class="drawer-section ${section === "targets" ? "focused" : ""}">
    <div class="section-head">
      <h3>目标关系</h3>
      <button class="button secondary" data-account-action="add-target" data-account-id="${attr(account.accountId)}" ${state.appMode || state.desktopMode ? "" : "disabled"} type="button">添加目标</button>
    </div>
    ${targets.length ? targets.map((target) => renderTargetRow(account, target)).join("") : `<div class="empty">暂无目标关系。</div>`}
  </section>`;
}

function renderTargetRow(account, target) {
  const url = `https://x.com/${encodeURIComponent(String(target.targetHandle || "").replace(/^@/, ""))}`;
  return `<div class="target-row">
    <div>
      <strong>${esc(target.targetHandle)}</strong>
      <span>${esc(labelTargetCategory(target.category))} · ${esc(target.reason || "无原因")}</span>
      <small>${esc(target.notes || "")}</small>
    </div>
    <div class="target-actions">
      <a class="button secondary" href="${attr(url)}" target="_blank" rel="noreferrer">打开 X 主页</a>
      <button class="button secondary" data-target-status="opened" data-account-id="${attr(account.accountId)}" data-target-id="${attr(target.targetId)}" type="button">标记已打开</button>
      <button class="button secondary" data-target-status="followed_manually" data-account-id="${attr(account.accountId)}" data-target-id="${attr(target.targetId)}" type="button">标记已手动关注</button>
      <button class="button secondary" data-target-status="watch" data-account-id="${attr(account.accountId)}" data-target-id="${attr(target.targetId)}" type="button">加入观察</button>
      <button class="button secondary" data-target-status="ignored" data-account-id="${attr(account.accountId)}" data-target-id="${attr(target.targetId)}" type="button">忽略</button>
    </div>
  </div>`;
}

async function loadTargets(accountId) {
  if (state.desktopMode) {
    const query = new URLSearchParams({ workspaceId: state.workspaceId || "workspace_default" });
    const data = await apiGet(`/api/desktop/accounts/${encodeURIComponent(accountId)}/targets?${query}`);
    state.accountTargets.set(accountId, data.items || []);
    return;
  }
  const query = appQuery();
  const suffix = query.toString() ? `?${query}` : "";
  const data = await apiGet(`/api/app/v1/manager/accounts/${encodeURIComponent(accountId)}/targets${suffix}`);
  state.accountTargets.set(accountId, data.items || []);
}

async function updateTargetStatus(accountId, targetId, status) {
  if (state.desktopMode) {
    await apiPost("/api/desktop/targets/status", {
      workspaceId: state.workspaceId || "workspace_default",
      accountId,
      targetId,
      status
    });
    await loadTargets(accountId);
    if (state.activeDesktopTab === "targets") render();
    else openAccountDrawer(accountId, "targets");
    return;
  }
  const query = appQuery();
  const suffix = query.toString() ? `?${query}` : "";
  await apiPost(`/api/app/v1/manager/accounts/${encodeURIComponent(accountId)}/targets/status${suffix}`, { targetId, status });
  await loadTargets(accountId);
  openAccountDrawer(accountId, "targets");
}

async function addRelationshipTarget(account) {
  if (!state.appMode && !state.desktopMode) throw new Error("目标关系写入只在真实工作区或桌面模式启用。");
  const targetHandle = prompt("目标 X handle，例如 @target：", "@");
  if (!targetHandle || targetHandle === "@") return;
  const category = prompt("分类：ai_founder / saas_founder / indie_builder / crypto_builder / blue_verified / customer / competitor / watch", "watch");
  if (category === null) return;
  const reason = prompt("推荐原因或备注：", "") ?? "";
  if (state.desktopMode) {
    await apiPost("/api/desktop/targets/import", {
      workspaceId: state.workspaceId || account.workspaceId || "workspace_default",
      accountId: account.accountId,
      targetHandle,
      category: category || "watch",
      reason,
      status: "suggested"
    });
    await loadTargets(account.accountId);
    await openAccountDrawer(account.accountId, "targets");
    toast("目标关系已添加");
    return;
  }
  const query = appQuery();
  const suffix = query.toString() ? `?${query}` : "";
  await apiPost(`/api/app/v1/manager/accounts/${encodeURIComponent(account.accountId)}/targets/upsert${suffix}`, {
    targetHandle,
    category: category || "watch",
    reason,
    status: "suggested"
  });
  await loadTargets(account.accountId);
  await openAccountDrawer(account.accountId, "targets");
  toast("目标关系已添加");
}

async function ensureDesktopTargetsLoaded() {
  const accountId = state.selectedAccountId || state.data?.accounts?.[0]?.accountId || "";
  if (!accountId) return;
  state.selectedAccountId = accountId;
  if (!state.accountTargets.has(accountId)) await loadTargets(accountId);
}

function findAccount(accountId) {
  return (state.data.accounts || []).find((account) => account.accountId === accountId);
}

function filterSelect(key, label, options, labeler = (value) => value) {
  return `<label class="field"><span>${esc(label)}</span><select data-account-filter="${attr(key)}">
    <option value="all">全部</option>
    ${options.map((option) => `<option value="${attr(option)}" ${state.accountFilters[key] === option ? "selected" : ""}>${esc(labeler(option || "none"))}</option>`).join("")}
  </select></label>`;
}

function accountOptionsFrom(key) {
  return unique((state.data.accounts || []).map((account) => account[key] || "").filter(Boolean));
}

function accountRegionOptions() {
  return unique((state.data.accounts || []).map(accountCountryValue).filter(Boolean));
}

function accountRegionValue(account) {
  return accountCountryValue(account);
}

function accountCountryLabel(account = {}) {
  return accountCountryValue(account) || "-";
}

function accountCountryValue(account = {}) {
  const country = String(account.country || account.region || "").trim();
  if (!country) return "";
  if (isAutoDefaultCountry(country) && !account.countryManual) return "";
  return country;
}

function isAutoDefaultCountry(value = "") {
  return ["US", "UK", "EU", "HK", "SG", "JP"].includes(String(value || "").trim().toUpperCase());
}

function accountNetworkLabel(account = {}) {
  const parts = [
    account.networkLabel || "",
    account.ipNote || "",
    account.deviceNote || "",
    account.countryRegionNote || ""
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : "未设置";
}

function labelSessionMode(value = "") {
  const labels = {
    temp: "临时窗口",
    manual: "手动固定",
    fixed_note: "固定网络备注"
  };
  return labels[value] || labels.temp;
}

function unique(items) {
  return [...new Set(items)].sort((a, b) => String(a).localeCompare(String(b)));
}

function contentLaneOptions(selected = "") {
  return [
    ["ai_startups", "AI 创业圈"],
    ["indie_builders", "独立开发者圈"],
    ["saas_founders", "SaaS 创始人圈"],
    ["crypto_builders", "Crypto 圈"],
    ["custom", "自定义"],
    ["none", "未分类"]
  ].map(([value, label]) => `<option value="${attr(value)}" ${selected === value ? "selected" : ""}>${esc(label)}</option>`).join("");
}

function laneFromChoice(value = "") {
  const clean = String(value || "").trim();
  const choices = {
    "1": "ai_startups",
    "2": "indie_builders",
    "3": "saas_founders",
    "4": "crypto_builders",
    "5": "none"
  };
  return choices[clean] || (["ai_startups", "indie_builders", "saas_founders", "crypto_builders", "custom", "none"].includes(clean) ? clean : "none");
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
        ${badge(labelStatus(task.status), task.status === "draft" ? "warn" : task.status === "assigned" ? "good" : "")}
        ${badge(labelStatus(task.approvalStatus), task.approvalStatus === "rejected" ? "bad" : task.approvalStatus === "approved" ? "good" : "")}
        ${badge(`${length.weightedCharCount}/280`, lengthClass)}
        ${badge(labelVariantType(task.variantType))}
        ${task.riskLevel ? badge(labelRiskLevel(task.riskLevel), task.riskLevel === "block" ? "bad" : task.riskLevel === "medium" ? "warn" : "good") : ""}
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
        <button class="button secondary" data-action="assign" data-task-id="${attr(task.taskId)}" ${task.canAssign && !state.demoMode ? "" : "disabled"} type="button">保存分配</button>
        <button class="button" data-action="approve" data-task-id="${attr(task.taskId)}" ${task.canApprove && !state.demoMode ? "" : "disabled"} type="button">批准</button>
        <button class="button danger" data-action="reject" data-task-id="${attr(task.taskId)}" ${task.canReject && !state.demoMode ? "" : "disabled"} type="button">拒绝</button>
        ${state.desktopMode ? `<button class="button secondary" data-desktop-task-action="mark-posted" data-task-id="${attr(task.taskId)}" ${["feedback_due", "feedback_done", "skipped"].includes(task.status) ? "disabled" : ""} type="button">标记已发布</button>` : ""}
      </div>
    </article>
  `;
}

function renderFeedbackForm(task) {
  if ((!state.appMode && !state.desktopMode) || !["posted", "feedback_due"].includes(task.status) && !task.postedUrl) return "";
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

async function handleDesktopTaskAction(action, taskId) {
  if (!state.desktopMode) throw new Error("需要桌面版。");
  const task = state.data?.tasks.find((item) => item.taskId === taskId);
  if (!task) throw new Error("任务不存在。");
  if (action === "mark-posted") {
    const postedUrl = prompt("粘贴人工发布后的 X 链接（可留空稍后补）：", task.postedUrl || "");
    if (postedUrl === null) return;
    await apiPost("/api/desktop/tasks/posted", {
      taskId,
      postedUrl,
      notes: "Marked posted manually from Desktop manager."
    });
    toast("已标记发布，后续请补反馈数据");
    await loadDesktopManager();
  }
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
  if (state.demoMode) return false;
  return task.canAssign || task.canApprove || task.canReject;
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
  if (action === "assign") {
    const assignment = batchAssignment();
    if (!assignment.accountId && !assignment.assignedTo) throw new Error("请选择批量账号或员工。");
    Object.assign(payload, assignment);
  }
  if (action === "approve") {
    Object.assign(payload, compactAssignment(batchAssignment()));
  }
  if (action === "reject") payload.reason = currentRejectReason() || "Rejected in batch manager review.";
  if (state.appMode && !state.desktopMode) {
    const query = appQuery();
    const suffix = query.toString() ? `?${query}` : "";
    const json = await apiPost(`/api/app/v1/manager/tasks/batch${suffix}`, payload);
    state.selectedTaskIds.clear();
    await loadAppManager();
    const failed = json.failed?.length ?? 0;
    toast(failed ? `批量完成，失败 ${failed} 条` : `批量${batchActionLabel(action)}完成`);
    return;
  }
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

function compactAssignment(assignment) {
  return Object.fromEntries(Object.entries(assignment).filter(([, value]) => Boolean(value)));
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
  const accounts = (state.data.accounts || []).filter((account) => account.status === "active" || account.accountId === selected);
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
  const task = state.data?.tasks.find((item) => item.taskId === taskId);
  return {
    accountId: fieldValue(taskId, "account") || task?.accountId || "",
    assignedTo: fieldValue(taskId, "staff") || task?.assignedTo || state.managerUserId || "user_owner"
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

function pendingDesktopTasks() {
  return (state.data.tasks || []).filter((task) => task.approvalStatus === "pending" || task.status === "pending_review");
}

function desktopAccountKind(account = {}) {
  return account.accountType === "official" ? "official" : "demo";
}

function labelStatus(value = "") {
  const labels = {
    pending_review: "待确认",
    pending: "待处理",
    draft: "待确认",
    approved: "已确认",
    assigned: "已确认",
    rejected: "已拒绝",
    posted: "已发布",
    feedback_due: "待反馈",
    feedback_done: "已反馈",
    skipped: "已跳过",
    active: "正常",
    archived: "已归档",
    paused: "已暂停"
  };
  return labels[value] || value || "未设置";
}

function labelConnection(value = "") {
  const labels = {
    connected: "已登录",
    not_connected: "未登录",
    expired: "登录过期",
    revoked: "已退出",
    error: "登录异常"
  };
  return labels[value] || value || "未登录";
}

function accountLoginStatus(account = {}) {
  const status = account.connectionStatus || account.oauthStatus || "not_connected";
  if (["connected", "expired", "revoked", "error"].includes(status)) return status;
  return "not_connected";
}

function labelHealth(value = "") {
  const labels = {
    healthy: "正常",
    watch: "观察",
    risky: "风险",
    paused: "已暂停",
    unknown: "未知"
  };
  return labels[value] || value || "观察";
}

function labelVariantType(value = "") {
  const labels = {
    shortPost: "短文案",
    casualPost: "日常文案",
    contrarianAngle: "反常识角度",
    painPointHook: "痛点开头",
    threadOpening: "长推开头"
  };
  return labels[value] || value || "文案";
}

function labelRiskLevel(value = "") {
  const labels = {
    low: "风险低",
    medium: "风险中",
    high: "风险高",
    block: "不可发布"
  };
  return labels[value] || value || "风险低";
}

function defaultXCallbackUrl() {
  const port = new URL(location.href).port || "5288";
  return `http://127.0.0.1:${port}/api/oauth/x/callback`;
}

function labelLane(value = "") {
  const labels = {
    ai_startups: "AI 创业圈",
    indie_builders: "独立开发者圈",
    saas_founders: "SaaS 创始人圈",
    crypto_builders: "Crypto 圈",
    custom: "自定义",
    none: "未分类"
  };
  return labels[value] || "未分类";
}

function labelTargetCategory(value = "") {
  const labels = {
    ai_founder: "AI 创业者",
    saas_founder: "SaaS 创始人",
    indie_builder: "独立开发者",
    crypto_builder: "Crypto Builder",
    blue_verified: "蓝 V",
    customer: "客户",
    competitor: "竞品",
    watch: "观察"
  };
  return labels[value] || value || "观察";
}

function labelTargetStatus(value = "") {
  const labels = {
    suggested: "待处理",
    opened: "已打开",
    followed_manually: "已手动关注",
    watch: "观察",
    ignored: "已忽略"
  };
  return labels[value] || value || "待处理";
}

async function apiGet(path) {
  const res = await fetch(path);
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new Error(`${path} returned a static page`);
  const json = await res.json();
  if (!json.ok) throw apiError(json, `GET ${path} failed`);
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
  if (!json.ok) throw apiError(json, `POST ${path} failed`);
  return json.data;
}

function apiError(json, fallback) {
  const error = new Error(json.error || fallback);
  error.code = json.code || "";
  error.details = json.details || {};
  return error;
}

function updateUrl() {
  const url = new URL(location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  if (state.appMode) url.searchParams.set("appMode", "1");
  if (state.desktopMode) url.searchParams.set("desktop", "1");
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

async function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  try {
    if (navigator.clipboard) await navigator.clipboard.writeText(text);
  } catch {
    // Download is the source of truth; clipboard copy is a convenience only.
  }
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
