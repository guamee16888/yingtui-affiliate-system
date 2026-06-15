import { createHash, randomBytes } from "node:crypto";
import { access, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDesktopAppDataDir, getDesktopSeedDataDir, repoRoot } from "../../desktop/app-config.mjs";
import { analyzeTweetLength, assertTweetLength } from "./tweet-length.mjs";
import { createAccountId, createCopyId, createLedgerId, createStableId, createTaskId, todayString, slugify } from "./ids.mjs";
import { parseCsv } from "./csv-feedback.mjs";
import { emptyCollection, CORE_COLLECTIONS, loadCollection, loadContentRules, saveCollection } from "./core-data.mjs";
import { readJson, resolveProjectPath, writeJsonAtomic } from "./file-store.mjs";
import { SOURCE_LANE_FILES } from "./source-lanes.mjs";
import { calculateEngagement, normalizeMetrics } from "./scoring.mjs";
import { calculateAccountHealth } from "./account-health-engine.mjs";

export const DESKTOP_STATE_PATH = "data/desktop-state.json";
export const DESKTOP_AUDIT_PATH = "data/audit-logs.json";
export const DESKTOP_X_OAUTH_PATH = "data/desktop-x-oauth.json";
export const DESKTOP_ALLOWED_IMPORT_FIELDS = new Set([
  "handle",
  "lane",
  "laneid",
  "contentlane",
  "country",
  "region",
  "language",
  "status",
  "publishmode",
  "dailypostlimit",
  "externallinklimit",
  "network",
  "networklabel",
  "networknote",
  "ip",
  "ipnote",
  "device",
  "devicenote",
  "countryregionnote",
  "sessionmode",
  "notes",
  "persona"
]);
export const DESKTOP_FORBIDDEN_IMPORT_FIELDS = new Set(["password", "cookie", "cookies", "proxy", "fingerprint", "token", "secret", "timezone"]);
const DESKTOP_NETWORK_NOTE_FIELDS = new Set(["accountid", "handle", "network", "networklabel", "networknote", "ip", "ipnote", "device", "devicenote", "countryregionnote", "notes"]);

export async function loadDesktopSetupStatus(options = {}) {
  const appDataDir = options.appDataDir || getDesktopAppDataDir(process.platform, process.env);
  const state = await readJson(DESKTOP_STATE_PATH, null);
  return {
    version: 1,
    appDataDir,
    dataDir: path.join(appDataDir, "data"),
    logsDir: path.join(appDataDir, "logs"),
    setupCompleted: Boolean(state?.setupCompleted),
    mode: state?.mode || "not_completed",
    workspaceId: state?.workspaceId || "workspace_default",
    workspaceName: state?.workspaceName || "",
    updatedAt: state?.updatedAt || "",
    desktopMode: process.env.AI_CREATOR_OS_DESKTOP === "1",
    storageMode: process.env.APP_STORAGE_MODE || "json"
  };
}

export async function loadDesktopXOAuthStatus() {
  const config = await readJson(DESKTOP_X_OAUTH_PATH, null);
  const safeStorage = await desktopSafeStorageStatus();
  return sanitizeXOAuthConfig(config, safeStorage);
}

export async function saveDesktopXOAuthConfig(input = {}, actor = { userId: "user_owner" }) {
  const existing = await readJson(DESKTOP_X_OAUTH_PATH, null);
  const now = new Date().toISOString();
  const clientId = String(input.clientId || existing?.clientId || "").trim();
  const clientSecret = String(input.clientSecret || "").trim() || existing?.clientSecretRef || "";
  const consumerKey = String(input.consumerKey || existing?.consumerKey || "").trim();
  const consumerSecret = String(input.consumerSecret || "").trim() || existing?.consumerSecretRef || "";
  const bearerToken = String(input.bearerToken || "").trim() || existing?.bearerTokenRef || "";
  const callbackUrl = String(input.callbackUrl || "").trim() || defaultXCallbackUrl();
  const scopes = normalizeScopes(input.scopes || existing?.scopes);
  if (!clientId) throw new Error("Client ID 不能为空。");
  if (!clientSecret) throw new Error("Client Secret 不能为空。");
  const config = {
    version: 1,
    provider: "x",
    clientId,
    clientSecretRef: clientSecret,
    consumerKey,
    consumerSecretRef: consumerSecret,
    bearerTokenRef: bearerToken,
    callbackUrl,
    scopes,
    tokenStorage: "local_app_data",
    tokenStorageLabel: "本地配置已保存，尚未写入 token",
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  await writeJsonAtomic(DESKTOP_X_OAUTH_PATH, config);
  await appendDesktopAudit({
    type: "desktop.x_oauth.config.save",
    workspaceId: "workspace_default",
    actorUserId: actor.userId,
    summary: "X API / OAuth desktop config saved.",
    metadata: { clientId: maskClientId(clientId), scopes }
  });
  return loadDesktopXOAuthStatus();
}

export async function clearDesktopXOAuthConfig(actor = { userId: "user_owner" }) {
  await writeJsonAtomic(DESKTOP_X_OAUTH_PATH, {
    version: 1,
    provider: "x",
    clientId: "",
    clientSecretRef: "",
    callbackUrl: defaultXCallbackUrl(),
    scopes: defaultXScopes(),
    tokenStorage: "not_configured",
    tokenStorageLabel: "未写入 token",
    clearedAt: new Date().toISOString()
  });
  await appendDesktopAudit({
    type: "desktop.x_oauth.config.clear",
    workspaceId: "workspace_default",
    actorUserId: actor.userId,
    summary: "X API / OAuth desktop config cleared."
  });
  return loadDesktopXOAuthStatus();
}

export async function revokeDesktopXOAuth(actor = { userId: "user_owner" }) {
  const existing = await readJson(DESKTOP_X_OAUTH_PATH, null);
  if (!existing?.clientId) return loadDesktopXOAuthStatus();
  const now = new Date().toISOString();
  await writeJsonAtomic(DESKTOP_X_OAUTH_PATH, {
    ...existing,
    pendingState: "",
    pendingVerifierRef: "",
    tokenRef: "",
    tokenStorage: "not_connected",
    tokenStorageLabel: "本地登录已退出，未写入 token",
    revokedAt: now,
    updatedAt: now
  });
  await appendDesktopAudit({
    type: "desktop.x_oauth.revoke",
    workspaceId: "workspace_default",
    actorUserId: actor.userId,
    summary: "X OAuth local token reference revoked."
  });
  return loadDesktopXOAuthStatus();
}

export async function startDesktopXOAuth() {
  const config = await readJson(DESKTOP_X_OAUTH_PATH, null);
  const status = await loadDesktopXOAuthStatus();
  if (!status.configured) throw new Error("请先在设置里配置 X API / OAuth。");
  const state = createStableId("x_oauth_state", [config.clientId, Date.now(), Math.random().toString(36).slice(2)]);
  const codeVerifier = base64Url(randomBytes(48));
  const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.callbackUrl || defaultXCallbackUrl(),
    scope: (config.scopes || defaultXScopes()).join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });
  await writeJsonAtomic(DESKTOP_X_OAUTH_PATH, {
    ...config,
    pendingState: state,
    pendingVerifierRef: codeVerifier,
    pendingStartedAt: new Date().toISOString()
  });
  await appendDesktopAudit({
    type: "desktop.x_oauth.start",
    workspaceId: "workspace_default",
    actorUserId: "user_owner",
    summary: "X OAuth authorization URL generated."
  });
  return {
    authorizationUrl: `https://twitter.com/i/oauth2/authorize?${params}`,
    callbackUrl: config.callbackUrl || defaultXCallbackUrl(),
    scopes: config.scopes || defaultXScopes()
  };
}

export async function finishDesktopXOAuthCallback(input = {}, options = {}) {
  const config = await readJson(DESKTOP_X_OAUTH_PATH, null);
  const fetchImpl = options.fetchImpl || fetch;
  if (input.error) throw new Error(`X OAuth 登录失败：${input.error}`);
  if (!config?.clientId) throw new Error("X API / OAuth 尚未配置。");
  if (!input.code) throw new Error("X OAuth callback 缺少 code。");
  if (!input.state || input.state !== config.pendingState) throw new Error("X OAuth state 不匹配，请重新连接。");
  if (!config.pendingVerifierRef) throw new Error("X OAuth verifier 缺失，请重新连接。");

  const token = await exchangeXOAuthCode({ code: input.code, config, codeVerifier: config.pendingVerifierRef, fetchImpl });
  const profile = await fetchXUserProfile({ accessToken: token.access_token, fetchImpl });
  const externalUserId = String(profile?.data?.id || "").trim();
  const username = String(profile?.data?.username || "").trim();
  const displayName = String(profile?.data?.name || username || "").trim();
  const handle = normalizeHandle(username);
  if (!handle) throw new Error("X OAuth 已登录，但未返回账号 username。");

  const now = new Date().toISOString();
  const workspaceId = "workspace_default";
  const accountId = createAccountId(handle);
  const connectionId = createStableId("xconn", [workspaceId, externalUserId || handle]);
  const expiresAt = token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : "";

  const [accounts, assignments, connections] = await Promise.all([
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadCollection(CORE_COLLECTIONS.assignments),
    loadCollection("data/x-connections.json")
  ]);
  const existingAccount = accounts.items.find((item) => item.accountId === accountId) || {};
  const officialAccount = normalizeDesktopAccount({
    ...existingAccount,
    accountId,
    workspaceId,
    handle,
    persona: displayName || handle,
    laneId: existingAccount.laneId || "ai_startups",
    timezone: "",
    language: existingAccount.language || "en",
    status: "active",
    accountType: "official",
    connectionStatus: "connected",
    oauthConnectionId: connectionId,
    notes: existingAccount.notes || "Connected through X OAuth in AI Creator OS Desktop."
  }, now);
  const connection = {
    connectionId,
    workspaceId,
    accountId,
    provider: "x",
    handle,
    externalUserId,
    status: "connected",
    tokenRef: "desktop-x-oauth",
    scopes: config.scopes || defaultXScopes(),
    connectedAt: existingById(connections.items, "connectionId", connectionId)?.connectedAt || now,
    updatedAt: now
  };
  const assignment = {
    assignmentId: createStableId("assign", [workspaceId, "user_owner", accountId]),
    workspaceId,
    userId: "user_owner",
    accountId,
    role: "manager",
    active: true,
    createdAt: existingById(assignments.items, "assignmentId", createStableId("assign", [workspaceId, "user_owner", accountId]))?.createdAt || now,
    updatedAt: now
  };

  await Promise.all([
    saveCollection(CORE_COLLECTIONS.xAccounts, upsertCollection(accounts, officialAccount, "accountId")),
    saveCollection(CORE_COLLECTIONS.assignments, upsertCollection(assignments, assignment, "assignmentId")),
    saveCollection("data/x-connections.json", upsertCollection(connections, connection, "connectionId")),
    writeJsonAtomic(DESKTOP_X_OAUTH_PATH, {
      ...config,
      pendingState: "",
      pendingVerifierRef: "",
      accessTokenRef: token.access_token,
      refreshTokenRef: token.refresh_token || config.refreshTokenRef || "",
      tokenType: token.token_type || "bearer",
      tokenExpiresAt: expiresAt,
      authorizedAccountId: accountId,
      authorizedHandle: handle,
      authorizedExternalUserId: externalUserId,
      oauthConnectionId: connectionId,
      tokenStorage: "connected",
      tokenStorageLabel: `已登录 ${handle}`,
      connectedAt: config.connectedAt || now,
      updatedAt: now
    })
  ]);
  await appendDesktopAudit({
    type: "desktop.x_oauth.callback",
    workspaceId: "workspace_default",
    actorUserId: "user_owner",
    targetId: accountId,
    summary: "X OAuth callback completed and official account connected.",
    metadata: { handle, accountId, connectionId }
  });
  return {
    ok: true,
    account: officialAccount,
    connection,
    message: `X OAuth 已完成，${handle} 已登录。`
  };
}

export async function completeDesktopSetup(input = {}, actor = { userId: "user_owner" }) {
  const mode = String(input.mode || "demo").trim();
  if (mode === "demo") {
    await resetDesktopDemoData({ markSetupComplete: true, actor });
    return loadDesktopSetupStatus();
  }
  if (mode === "restore") {
    await importDesktopBackup(input, actor);
    await writeDesktopState({ mode: "restored", workspaceId: input.workspaceId || "workspace_default", workspaceName: input.workspaceName || "Restored Workspace" });
    return loadDesktopSetupStatus();
  }

  await initializeEmptyDesktopData();
  const workspace = await createOrUpdateDesktopWorkspace({
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName || "My Workspace",
    defaultLanguage: input.defaultLanguage || "en",
    defaultCountry: input.defaultCountry || "",
    defaultDailyPostLimit: input.defaultDailyPostLimit || 10,
    enabledLaneIds: input.enabledLaneIds || input.defaultLanes || ["ai_startups", "indie_builders", "saas_founders", "crypto_builders"]
  }, actor);
  if (input.accountsText || input.csv) {
    await importDesktopAccounts({
      workspaceId: workspace.workspaceId,
      text: input.accountsText || "",
      csv: input.csv || "",
      defaultLane: input.defaultLane || workspace.enabledLaneIds?.[0] || "ai_startups",
      defaultLanguage: input.defaultLanguage || "en",
      defaultCountry: input.defaultCountry || "",
      defaultDailyPostLimit: input.defaultDailyPostLimit || 10
    }, actor);
  }
  await writeDesktopState({ mode: mode || "empty_workspace", workspaceId: workspace.workspaceId, workspaceName: workspace.name });
  await appendDesktopAudit({
    type: "desktop.setup.complete",
    workspaceId: workspace.workspaceId,
    actorUserId: actor.userId,
    summary: `Desktop setup completed in ${mode || "empty_workspace"} mode.`
  });
  return loadDesktopSetupStatus();
}

async function initializeEmptyDesktopData() {
  const collectionFiles = [
    ...Object.values(CORE_COLLECTIONS),
    SOURCE_LANE_FILES.workspaces,
    SOURCE_LANE_FILES.workspaceLanes,
    "data/publish-jobs.json",
    "data/publish-attempts.json",
    "data/x-connections.json"
  ];
  await Promise.all(collectionFiles.map((filePath) => saveCollection(filePath, emptyCollection())));
  await Promise.all([
    writeJsonAtomic("data/feedback.json", { version: 1, updatedAt: new Date().toISOString(), entries: [] }),
    writeJsonAtomic("data/relationship-targets.json", emptyCollection()),
    writeJsonAtomic(DESKTOP_AUDIT_PATH, emptyCollection())
  ]);
}

export async function createOrUpdateDesktopWorkspace(input = {}, actor = { userId: "user_owner" }) {
  const now = new Date().toISOString();
  const workspaceName = String(input.workspaceName || input.name || "My Workspace").trim();
  const workspaceId = String(input.workspaceId || `workspace_${slugify(workspaceName)}`).trim();
  const enabledLaneIds = normalizeLanes(input.enabledLaneIds);
  const workspaces = await loadCollection(SOURCE_LANE_FILES.workspaces);
  const users = await loadCollection(CORE_COLLECTIONS.users);
  const subscriptions = await readJson("data/subscriptions.json", { version: 1, updatedAt: "", items: [] });
  const workspace = {
    workspaceId,
    name: workspaceName,
    plan: "desktop",
    accountLimit: 30,
    managerUserIds: ["user_owner"],
    staffUserIds: ["user_owner"],
    enabledLaneIds,
    defaultLanguage: input.defaultLanguage || "en",
    defaultCountry: input.defaultCountry || "",
    defaultTimezone: input.defaultTimezone || "",
    defaultDailyPostLimit: Number(input.defaultDailyPostLimit || 10),
    publishMode: "manual",
    autoPublishEnabled: false,
    requiresFinalApproval: true,
    active: true,
    createdAt: existingById(workspaces.items, "workspaceId", workspaceId)?.createdAt || now,
    updatedAt: now
  };
  await saveCollection(SOURCE_LANE_FILES.workspaces, upsertCollection(workspaces, workspace, "workspaceId"));
  await saveCollection(CORE_COLLECTIONS.users, upsertCollection(users, {
    userId: "user_owner",
    email: "owner@guamee.local",
    name: "Owner",
    role: "manager",
    workspaceId,
    active: true
  }, "userId"));
  await writeJsonAtomic("data/subscriptions.json", {
    ...subscriptions,
    updatedAt: now,
    items: upsertItem(subscriptions.items || [], {
      workspaceId,
      plan: "desktop",
      status: "internal",
      requireDiscordVerification: false,
      maxAccounts: 30,
      maxSeats: 5,
      expiresAt: ""
    }, "workspaceId")
  });
  await appendDesktopAudit({
    type: "workspace.upsert",
    workspaceId,
    actorUserId: actor.userId,
    targetId: workspaceId,
    summary: "Desktop workspace saved."
  });
  return workspace;
}

export async function importDesktopAccounts(input = {}, actor = { userId: "user_owner" }) {
  const workspaceId = String(input.workspaceId || "workspace_default").trim();
  const parsed = parseDesktopAccountImport(input);
  const current = await loadCollection(CORE_COLLECTIONS.xAccounts);
  const assignments = await loadCollection(CORE_COLLECTIONS.assignments);
  const now = new Date().toISOString();
  const defaultLane = input.defaultLane || "ai_startups";
  const defaultLanguage = input.defaultLanguage || "en";
  const defaultCountry = String(input.defaultCountry || input.defaultRegion || "").trim();
  const defaultDailyPostLimit = Number(input.defaultDailyPostLimit || 10);
  const defaultExternalLinkLimit = Number(input.defaultExternalLinkLimit || 1);
  const imported = [];
  let items = [...current.items];
  let assignmentItems = [...assignments.items];

  for (const row of parsed.rows) {
    const account = normalizeDesktopAccount({
      ...row,
      workspaceId,
      laneId: row.laneId || row.lane || defaultLane,
      language: row.language || defaultLanguage,
      country: row.country || row.region || defaultCountry,
      countryManual: Boolean(row.country || row.region || defaultCountry),
      timezone: "",
      dailyPostLimit: row.dailyPostLimit || defaultDailyPostLimit,
      externalLinkLimit: row.externalLinkLimit || defaultExternalLinkLimit,
      status: row.status || "active",
      accountType: "demo",
      connectionStatus: "not_connected"
    }, now);
    items = upsertItem(items, account, "accountId");
    assignmentItems = upsertItem(assignmentItems, {
      assignmentId: createStableId("assign", [workspaceId, "user_owner", account.accountId]),
      workspaceId,
      userId: "user_owner",
      accountId: account.accountId,
      role: "manager",
      active: true,
      createdAt: now,
      updatedAt: now
    }, "assignmentId");
    imported.push(account);
  }

  await Promise.all([
    saveCollection(CORE_COLLECTIONS.xAccounts, { ...current, items }),
    saveCollection(CORE_COLLECTIONS.assignments, { ...assignments, items: assignmentItems })
  ]);
  await appendDesktopAudit({
    type: "account.import",
    workspaceId,
    actorUserId: actor.userId,
    summary: `Imported ${imported.length} desktop account(s).`,
    metadata: { ignoredFields: parsed.ignoredFields }
  });
  return {
    imported,
    count: imported.length,
    ignoredFields: parsed.ignoredFields,
    warning: parsed.ignoredFields.length ? "已忽略密码、cookie、代理、指纹、token、secret、timezone 等字段。" : ""
  };
}

export async function upsertDesktopAccount(input = {}, actor = { userId: "user_owner" }) {
  const result = await importDesktopAccounts({
    workspaceId: input.workspaceId || "workspace_default",
    rows: [input]
  }, actor);
  return { account: result.imported[0], ignoredFields: result.ignoredFields, warning: result.warning };
}

export async function updateDesktopAccountConfig(input = {}, actor = { userId: "user_owner" }) {
  const accountId = String(input.accountId || "").trim();
  if (!accountId) throw new Error("accountId is required");
  const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
  const current = accounts.items.find((item) => item.accountId === accountId);
  if (!current) throw new Error(`Unknown account: ${accountId}`);
  const country = String(input.country ?? current.country ?? "").trim();
  const updated = normalizeDesktopAccount({
    ...current,
    laneId: normalizeDesktopLaneId(input.laneId ?? current.laneId),
    country,
    countryManual: Boolean(country),
    language: String(input.language ?? current.language ?? "en").trim() || "en",
    networkLabel: input.networkLabel ?? input.networkNote ?? current.networkLabel ?? "",
    ipNote: input.ipNote ?? current.ipNote ?? "",
    deviceNote: input.deviceNote ?? current.deviceNote ?? "",
    countryRegionNote: input.countryRegionNote ?? current.countryRegionNote ?? "",
    sessionMode: input.sessionMode ?? current.sessionMode ?? "temp",
    notes: input.notes ?? current.notes ?? ""
  });
  await saveCollection(CORE_COLLECTIONS.xAccounts, {
    ...accounts,
    items: accounts.items.map((item) => item.accountId === accountId ? updated : item)
  });
  await appendDesktopAudit({
    type: "account.config.update",
    workspaceId: updated.workspaceId || "workspace_default",
    actorUserId: actor.userId,
    targetId: accountId,
    summary: "Desktop account config updated.",
    metadata: {
      laneId: updated.laneId,
      countrySet: Boolean(updated.country),
      networkNoteSet: Boolean(updated.networkLabel || updated.ipNote || updated.deviceNote || updated.countryRegionNote)
    }
  });
  return { account: updated };
}

export async function importDesktopNetworkNotes(input = {}, actor = { userId: "user_owner" }) {
  const workspaceId = String(input.workspaceId || "workspace_default").trim();
  const parsed = parseDesktopNetworkNotesImport(input);
  const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
  const scopedAccounts = accounts.items.filter((account) => (account.workspaceId || "workspace_default") === workspaceId);
  const byAccountId = new Map(scopedAccounts.map((account) => [account.accountId, account]));
  const byHandle = new Map(scopedAccounts.map((account) => [normalizeHandle(account.handle).toLowerCase(), account]));
  const positionalAccounts = scopedAccounts.filter((account) => account.status !== "archived");
  const patches = new Map();
  const skipped = [];
  let positionalIndex = 0;

  for (const row of parsed.rows) {
    const account = row.accountId
      ? byAccountId.get(row.accountId)
      : row.handle
        ? byHandle.get(normalizeHandle(row.handle).toLowerCase())
        : positionalAccounts[positionalIndex++];
    if (!account) {
      skipped.push({ accountId: row.accountId || "", handle: row.handle || "", reason: row.handle || row.accountId ? "not_found" : "no_account_for_row" });
      continue;
    }
    const patch = networkNotePatch(row);
    if (!Object.keys(patch).length) {
      skipped.push({ accountId: account.accountId, handle: account.handle || "", reason: "empty_update" });
      continue;
    }
    patches.set(account.accountId, { ...(patches.get(account.accountId) || {}), ...patch });
  }

  const now = new Date().toISOString();
  const items = accounts.items.map((account) => {
    const patch = patches.get(account.accountId);
    return patch ? { ...account, ...patch, updatedAt: now } : account;
  });
  if (patches.size) await saveCollection(CORE_COLLECTIONS.xAccounts, { ...accounts, items });
  await appendDesktopAudit({
    type: "account.network_notes.import",
    workspaceId,
    actorUserId: actor.userId,
    summary: `Imported network/IP notes for ${patches.size} desktop account(s).`,
    metadata: {
      updated: patches.size,
      skipped: skipped.length,
      ignoredFields: parsed.ignoredFields
    }
  });
  return {
    updatedCount: patches.size,
    skippedCount: skipped.length,
    ignoredFields: parsed.ignoredFields,
    skipped,
    warning: parsed.ignoredFields.length ? "已忽略密码、cookie、代理、指纹、token、secret、timezone 等字段。" : ""
  };
}

export async function archiveDesktopAccount(input = {}, actor = { userId: "user_owner" }) {
  const accountId = String(input.accountId || "").trim();
  if (!accountId) throw new Error("accountId is required");
  const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
  const account = accounts.items.find((item) => item.accountId === accountId);
  if (!account) throw new Error(`Unknown account: ${accountId}`);
  const archived = { ...account, status: "archived", active: false, updatedAt: new Date().toISOString() };
  await saveCollection(CORE_COLLECTIONS.xAccounts, {
    ...accounts,
    items: accounts.items.map((item) => item.accountId === accountId ? archived : item)
  });
  await appendDesktopAudit({
    type: "account.archive",
    workspaceId: archived.workspaceId || "workspace_default",
    actorUserId: actor.userId,
    targetId: accountId,
    summary: "Account archived instead of deleted."
  });
  return { account: archived };
}

export async function exportDesktopAccountsCsv(workspaceId = "workspace_default") {
  const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
  const rows = accounts.items
    .filter((account) => (account.workspaceId || "workspace_default") === workspaceId)
    .map((account) => [
      account.handle || "",
      account.laneId || account.contentLaneId || "",
      account.country || account.region || "",
      account.language || "",
      account.connectionStatus || "not_connected",
      account.status || "",
      account.publishMode || "",
      account.dailyPostLimit || "",
      account.externalLinkLimit || "",
      account.networkLabel || "",
      account.ipNote || "",
      account.sessionMode || "temp",
      account.notes || ""
    ]);
  return toCsv([["handle", "lane", "country", "language", "loginStatus", "status", "publishMode", "dailyPostLimit", "externalLinkLimit", "networkLabel", "ipNote", "sessionMode", "notes"], ...rows]);
}

export async function createDesktopTask(input = {}, actor = { userId: "user_owner" }) {
  const workspaceId = String(input.workspaceId || "workspace_default").trim();
  const accountId = String(input.accountId || "").trim();
  const copyText = String(input.copyText || input.text || "").trim();
  if (!accountId) throw new Error("选择账号后再创建任务。");
  if (!copyText) throw new Error("请输入任务文案。");
  const length = assertTweetLength(copyText);
  const now = new Date();
  const today = todayString();
  const topicId = createStableId("topic", [workspaceId, accountId, copyText.slice(0, 80)]);
  const copyId = createCopyId(topicId, input.variantType || "desktop_manual", copyText);
  const taskId = input.taskId || createTaskId(today, accountId, copyId);
  const tasks = await loadCollection(CORE_COLLECTIONS.postTasks);
  const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
  const account = accounts.items.find((item) => item.accountId === accountId);
  if (!account) throw new Error(`账号不存在：${accountId}`);
  const task = {
    taskId,
    workspaceId,
    date: today,
    accountId,
    assignedTo: input.assignedTo || actor.userId || "user_owner",
    managerUserId: actor.userId || "user_owner",
    toolId: input.toolId || createStableId("tool", [workspaceId, accountId, "desktop_manual"]),
    toolName: input.toolName || "Desktop manual task",
    toolUrl: input.toolUrl || "",
    topicId,
    copyId,
    variantType: input.variantType || "desktop_manual",
    copyText,
    contentType: input.contentType || "post",
    hasLink: Boolean(input.hasLink),
    recommendedAt: input.recommendedAt || "",
    notes: input.notes || "",
    laneId: input.laneId || account.laneId || "",
    status: "pending_review",
    approvalStatus: "pending",
    publishMode: "manual",
    weightedCharCount: length.weightedCharCount,
    fitsTweetLimit: length.fitsXPost,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  await saveCollection(CORE_COLLECTIONS.postTasks, upsertCollection(tasks, task, "taskId"));
  await appendDesktopAudit({
    type: "task.create",
    workspaceId,
    actorUserId: actor.userId,
    targetId: taskId,
    summary: "Desktop manual task created.",
    metadata: { accountId, weightedCharCount: length.weightedCharCount }
  });
  return { task };
}

export async function markDesktopTaskPosted(input = {}, actor = { userId: "user_owner" }) {
  const taskId = String(input.taskId || "").trim();
  const postedUrl = String(input.postedUrl || "").trim();
  if (!taskId) throw new Error("taskId is required");
  const tasks = await loadCollection(CORE_COLLECTIONS.postTasks);
  const ledger = await loadCollection(CORE_COLLECTIONS.postLedger);
  const task = tasks.items.find((item) => item.taskId === taskId);
  if (!task) throw new Error(`任务不存在：${taskId}`);
  assertTweetLength(task.copyText || "");
  const now = new Date().toISOString();
  const nextTask = {
    ...task,
    status: "feedback_due",
    approvalStatus: task.approvalStatus === "pending" ? "approved" : task.approvalStatus,
    postedUrl,
    postedAt: input.postedAt || now,
    feedbackDueAt: input.feedbackDueAt || now,
    updatedAt: now,
    notes: appendNote(task.notes, input.notes || "Marked posted manually in Desktop.")
  };
  const ledgerEntry = {
    ledgerId: createLedgerId(taskId, postedUrl || now),
    workspaceId: nextTask.workspaceId || "workspace_default",
    taskId,
    accountId: nextTask.accountId || "",
    copyId: nextTask.copyId || "",
    toolId: nextTask.toolId || "",
    copyText: nextTask.copyText || "",
    postedUrl,
    postedAt: nextTask.postedAt,
    publishMode: "manual",
    actorUserId: actor.userId || "",
    createdAt: now,
    updatedAt: now
  };
  await Promise.all([
    saveCollection(CORE_COLLECTIONS.postTasks, { ...tasks, items: tasks.items.map((item) => item.taskId === taskId ? nextTask : item) }),
    saveCollection(CORE_COLLECTIONS.postLedger, upsertCollection(ledger, ledgerEntry, "ledgerId"))
  ]);
  await appendDesktopAudit({
    type: "task.mark_posted",
    workspaceId: nextTask.workspaceId || "workspace_default",
    actorUserId: actor.userId,
    targetId: taskId,
    summary: "Task marked posted manually in Desktop."
  });
  return { task: nextTask, ledger: ledgerEntry };
}

export async function saveDesktopFeedback(input = {}, actor = { userId: "user_owner" }) {
  const taskId = String(input.taskId || "").trim();
  if (!taskId) throw new Error("taskId is required");
  const tasks = await loadCollection(CORE_COLLECTIONS.postTasks);
  const feedback = await readJson("data/feedback.json", { version: 1, updatedAt: "", entries: [] });
  const task = tasks.items.find((item) => item.taskId === taskId);
  if (!task) throw new Error(`任务不存在：${taskId}`);
  for (const [key, value] of Object.entries(input.metrics || {})) {
    if (Number(value) < 0) throw new Error(`${key} must be a non-negative number`);
  }
  const metrics = normalizeMetrics(input.metrics || {});
  const engagement = calculateEngagement(metrics);
  const now = new Date().toISOString();
  const entry = {
    id: input.feedbackId || createStableId("feedback", [task.workspaceId || "workspace_default", taskId]),
    workspaceId: task.workspaceId || "workspace_default",
    taskId,
    accountId: task.accountId || "",
    toolId: task.toolId || "",
    copyId: task.copyId || "",
    copyText: task.copyText || "",
    posted: true,
    postedUrl: task.postedUrl || "",
    postedAt: task.postedAt || "",
    metrics,
    notes: input.notes || "",
    engagementScore: engagement.engagementScore,
    engagementRate: finiteNumber(engagement.engagementRate),
    clickRate: finiteNumber(engagement.clickRate),
    saveRate: finiteNumber(engagement.saveRate),
    replyRate: finiteNumber(engagement.replyRate),
    createdAt: feedback.entries?.find((item) => item.id === input.feedbackId)?.createdAt || now,
    updatedAt: now
  };
  const nextTask = {
    ...task,
    status: "feedback_done",
    metrics,
    feedbackSavedAt: now,
    updatedAt: now,
    notes: appendNote(task.notes, input.notes ? `Feedback: ${input.notes}` : "")
  };
  await Promise.all([
    writeJsonAtomic("data/feedback.json", {
      ...feedback,
      updatedAt: now,
      entries: upsertItem(feedback.entries || [], entry, "id")
    }),
    saveCollection(CORE_COLLECTIONS.postTasks, { ...tasks, items: tasks.items.map((item) => item.taskId === taskId ? nextTask : item) })
  ]);
  await updateDesktopAccountHealth(entry.workspaceId, entry.accountId);
  await appendDesktopAudit({
    type: "feedback.save",
    workspaceId: entry.workspaceId,
    actorUserId: actor.userId,
    targetId: entry.id,
    summary: "Desktop feedback saved.",
    metadata: { metricKeys: Object.keys(metrics) }
  });
  return { feedback: entry, task: nextTask };
}

export async function loadDesktopRelationshipTargets(input = {}) {
  const workspaceId = String(input.workspaceId || "workspace_default").trim();
  const accountId = String(input.accountId || "").trim();
  const current = await readJson("data/relationship-targets.json", emptyCollection());
  return {
    items: (current.items || [])
      .filter((target) => (target.workspaceId || "workspace_default") === workspaceId)
      .filter((target) => !accountId || target.accountId === accountId)
  };
}

export async function addDesktopRelationshipTargets(input = {}, actor = { userId: "user_owner" }) {
  const workspaceId = String(input.workspaceId || "workspace_default").trim();
  const accountId = String(input.accountId || "").trim();
  if (!accountId) throw new Error("accountId is required");
  const handles = parseHandles(input.targetHandle || input.handles || input.text || "");
  if (!handles.length) throw new Error("请输入目标 handle。");
  const current = await readJson("data/relationship-targets.json", emptyCollection());
  const now = new Date().toISOString();
  let items = current.items || [];
  const saved = [];
  for (const handle of handles) {
    const item = {
      targetId: createStableId("target", [workspaceId, accountId, handle]),
      workspaceId,
      accountId,
      targetHandle: normalizeHandle(handle),
      category: input.category || "watch",
      reason: input.reason || "",
      status: input.status || "suggested",
      notes: input.notes || "",
      createdAt: existingById(items, "targetId", createStableId("target", [workspaceId, accountId, handle]))?.createdAt || now,
      updatedAt: now
    };
    items = upsertItem(items, item, "targetId");
    saved.push(item);
  }
  await writeJsonAtomic("data/relationship-targets.json", { ...current, updatedAt: now, items });
  await appendDesktopAudit({
    type: "relationship_target.add",
    workspaceId,
    actorUserId: actor.userId,
    targetId: accountId,
    summary: `Added ${saved.length} relationship target(s).`
  });
  return { items: saved };
}

export async function updateDesktopRelationshipTargetStatus(input = {}, actor = { userId: "user_owner" }) {
  const workspaceId = String(input.workspaceId || "workspace_default").trim();
  const accountId = String(input.accountId || "").trim();
  const targetId = String(input.targetId || "").trim();
  const status = String(input.status || "").trim();
  if (!accountId) throw new Error("accountId is required");
  if (!targetId) throw new Error("targetId is required");
  if (!["suggested", "opened", "followed_manually", "ignored", "watch"].includes(status)) {
    throw new Error("Unsupported target status.");
  }
  const current = await readJson("data/relationship-targets.json", emptyCollection());
  const now = new Date().toISOString();
  let found = null;
  const items = (current.items || []).map((target) => {
    if ((target.workspaceId || "workspace_default") !== workspaceId || target.accountId !== accountId || target.targetId !== targetId) {
      return target;
    }
    found = { ...target, status, updatedAt: now };
    return found;
  });
  if (!found) throw new Error(`目标关系不存在：${targetId}`);
  await writeJsonAtomic("data/relationship-targets.json", { ...current, updatedAt: now, items });
  await appendDesktopAudit({
    type: status === "followed_manually" ? "relationship_target.followed_manually" : "relationship_target.status",
    workspaceId,
    actorUserId: actor.userId,
    targetId,
    summary: `Relationship target marked as ${status}.`,
    metadata: { accountId, status }
  });
  return { item: found };
}

export async function recordDesktopWindowOpen(input = {}, actor = { userId: "user_owner" }) {
  await appendDesktopAudit({
    type: "desktop.window.open_incognito",
    workspaceId: input.workspaceId || "workspace_default",
    actorUserId: actor.userId,
    targetId: input.accountId || "",
    summary: "Incognito account window opened.",
    metadata: {
      accountId: input.accountId || "",
      handle: input.handle || "",
      url: input.url || ""
    }
  });
  return { ok: true };
}

export async function resetDesktopDemoData({ markSetupComplete = true, actor = { userId: "user_owner" } } = {}) {
  const seedDir = getDesktopSeedDataDir(repoRoot);
  const targetDir = resolveProjectPath("data");
  await mkdir(targetDir, { recursive: true });
  await cp(seedDir, targetDir, { recursive: true, force: true });
  if (markSetupComplete) {
    await writeDesktopState({ mode: "demo", workspaceId: "workspace_default", workspaceName: "AI Creator OS 样例账号库" });
  }
  await appendDesktopAudit({
    type: "desktop.demo.reset",
    workspaceId: "workspace_default",
    actorUserId: actor.userId,
    summary: "Desktop demo data reset."
  });
  return loadDesktopSetupStatus();
}

export async function exportDesktopBackupPackage(options = {}) {
  const appDataDir = options.appDataDir || process.env.AI_CREATOR_OS_DATA_DIR || getDesktopAppDataDir();
  const backupDir = options.outputDir || path.join(appDataDir, "backups");
  await mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = options.outputPath || path.join(backupDir, `ai-creator-os-backup-${stamp}.json`);
  const files = {};
  for (const file of await listRuntimeJsonFiles()) {
    files[file] = await readJson(file, null);
  }
  const payload = {
    version: 1,
    product: "AI Creator OS Desktop",
    exportedAt: new Date().toISOString(),
    appDataDir,
    files
  };
  await writeFile(backupPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await appendDesktopAudit({
    type: "desktop.backup.export",
    workspaceId: "workspace_default",
    actorUserId: "user_owner",
    targetId: backupPath,
    summary: "Desktop backup exported."
  });
  return { path: backupPath, files: Object.keys(files).length };
}

export async function importDesktopBackup(input = {}, actor = { userId: "user_owner" }) {
  const payload = typeof input.backupText === "string" && input.backupText.trim()
    ? JSON.parse(input.backupText)
    : input.backup;
  if (!payload || payload.version !== 1 || !payload.files || typeof payload.files !== "object") {
    throw new Error("备份格式无效。");
  }
  const restored = [];
  for (const [file, data] of Object.entries(payload.files)) {
    if (!/^data\/[a-z0-9_./-]+\.json$/i.test(file)) continue;
    await writeJsonAtomic(file, data);
    restored.push(file);
  }
  await appendDesktopAudit({
    type: "desktop.backup.import",
    workspaceId: input.workspaceId || "workspace_default",
    actorUserId: actor.userId,
    summary: `Desktop backup imported (${restored.length} files).`
  });
  return { restored };
}

async function updateDesktopAccountHealth(workspaceId, accountId) {
  if (!accountId) return null;
  const [accounts, tasks, ledger, feedback, accountHealth, contentRules] = await Promise.all([
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadCollection(CORE_COLLECTIONS.postTasks),
    loadCollection(CORE_COLLECTIONS.postLedger),
    readJson("data/feedback.json", { entries: [] }),
    loadCollection(CORE_COLLECTIONS.accountHealth),
    loadContentRules()
  ]);
  const account = accounts.items.find((item) => item.accountId === accountId);
  if (!account) return null;
  const health = calculateAccountHealth({
    account,
    tasks: tasks.items.filter((task) => task.accountId === accountId && (task.workspaceId || "workspace_default") === workspaceId),
    ledger: ledger.items.filter((item) => item.accountId === accountId && (item.workspaceId || "workspace_default") === workspaceId),
    feedback: (feedback.entries || []).filter((item) => item.accountId === accountId && (item.workspaceId || "workspace_default") === workspaceId),
    contentRules
  });
  const now = new Date().toISOString();
  const item = {
    healthId: createStableId("health", [workspaceId, accountId]),
    workspaceId,
    accountId,
    ...health,
    updatedAt: now
  };
  await saveCollection(CORE_COLLECTIONS.accountHealth, upsertCollection(accountHealth, item, "healthId"));
  return item;
}

export async function appendDesktopLog(event = {}) {
  const appDataDir = process.env.AI_CREATOR_OS_DATA_DIR || getDesktopAppDataDir();
  const logsDir = path.join(appDataDir, "logs");
  await mkdir(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `${new Date().toISOString().slice(0, 10)}.log`);
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    type: event.type || "desktop.event",
    summary: sanitizeLogText(event.summary || ""),
    metadata: sanitizeLogObject(event.metadata || {})
  });
  await writeFile(logPath, `${line}\n`, { flag: "a" });
  return { path: logPath };
}

export async function appendDesktopAudit(event = {}) {
  const current = await readJson(DESKTOP_AUDIT_PATH, emptyCollection());
  const now = new Date().toISOString();
  const item = {
    auditId: event.auditId || createStableId("audit", [event.type || "event", event.workspaceId || "", event.targetId || "", now]),
    createdAt: event.createdAt || now,
    ...event
  };
  await writeJsonAtomic(DESKTOP_AUDIT_PATH, {
    ...current,
    updatedAt: now,
    items: [...(current.items || []), item]
  });
  await appendDesktopLog({ type: item.type, summary: item.summary, metadata: item.metadata });
  return item;
}

export function parseDesktopAccountImport(input = {}) {
  const rows = [];
  const ignored = new Set();
  if (Array.isArray(input.rows)) {
    for (const row of input.rows) rows.push(normalizeImportRow(row, ignored));
  }
  for (const handle of parseHandles(input.text || input.handles || "")) {
    rows.push({ handle });
  }
  if (input.csv) {
    const parsed = parseCsv(input.csv);
    if (parsed.length) {
      const headers = parsed[0].map(normalizeFieldName);
      for (const header of headers) {
        if (DESKTOP_FORBIDDEN_IMPORT_FIELDS.has(header)) ignored.add(header);
      }
      for (const row of parsed.slice(1)) {
        const item = {};
        headers.forEach((header, index) => {
          const value = row[index] || "";
          if (!value) return;
          if (DESKTOP_FORBIDDEN_IMPORT_FIELDS.has(header)) return;
          if (!DESKTOP_ALLOWED_IMPORT_FIELDS.has(header)) return;
          item[fieldAlias(header)] = value;
        });
        if (item.handle) rows.push(item);
      }
    }
  }
  const uniqueRows = [];
  const seen = new Set();
  for (const row of rows.map((item) => normalizeImportRow(item, ignored)).filter((item) => item.handle)) {
    const key = normalizeHandle(row.handle).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRows.push(row);
  }
  return { rows: uniqueRows, ignoredFields: [...ignored] };
}

export function parseDesktopNetworkNotesImport(input = {}) {
  const rows = [];
  const ignored = new Set();
  if (Array.isArray(input.rows)) {
    for (const row of input.rows) rows.push(normalizeNetworkNoteRow(row, ignored));
  }
  const pasted = String(input.csv || input.text || "").trim();
  if (pasted) {
    const parsed = parseFlexibleNetworkTable(pasted);
    if (parsed.length) {
      const headers = parsed[0].map((header) => normalizeNetworkNoteFieldName(header, ignored));
      const hasHeader = headers.filter(Boolean).length >= 2;
      const dataRows = hasHeader ? parsed.slice(1) : parsed;
      const fallbackFields = ["handle", "networkLabel", "ipNote", "deviceNote", "countryRegionNote", "notes"];
      for (const row of dataRows) {
        const item = {};
        const fields = hasHeader ? headers : fallbackFields;
        fields.forEach((field, index) => {
          const value = String(row[index] || "").trim();
          if (!field || !value) return;
          item[field] = value;
        });
        rows.push(normalizeNetworkNoteRow(item, ignored));
      }
    }
  }
  const uniqueRows = [];
  const seen = new Set();
  for (const row of rows.filter((item) => hasNetworkNoteUpdate(item) && (item.accountId || item.handle || item.proxyAddress || item.ipNote))) {
    const key = row.accountId ? `id:${row.accountId}` : row.handle ? `handle:${normalizeHandle(row.handle).toLowerCase()}` : "";
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    uniqueRows.push(row);
  }
  return { rows: uniqueRows, ignoredFields: [...ignored] };
}

function normalizeDesktopAccount(input = {}, now = new Date().toISOString()) {
  const handle = normalizeHandle(input.handle);
  const accountId = input.accountId || createAccountId(handle);
  const official = input.accountType === "official" && Boolean(input.oauthConnectionId);
  const country = String(input.country ?? input.region ?? "").trim();
  return {
    accountId,
    workspaceId: input.workspaceId || "workspace_default",
    handle,
    persona: input.persona || handle || accountId,
    laneId: normalizeDesktopLaneId(input.laneId || input.lane || "ai_startups"),
    country,
    countryManual: Boolean(input.countryManual || country),
    region: "",
    timezone: "",
    language: input.language || "en",
    status: input.status || "active",
    active: input.status === "archived" ? false : input.active !== false,
    publishMode: input.publishMode || "manual",
    accountType: official ? "official" : "demo",
    dailyPostLimit: Number(input.dailyPostLimit || 10),
    externalLinkLimit: Number(input.externalLinkLimit || 1),
    networkLabel: String(input.networkLabel || input.network || "").trim(),
    ipNote: String(input.ipNote || input.ip || "").trim(),
    deviceNote: String(input.deviceNote || input.device || "").trim(),
    countryRegionNote: String(input.countryRegionNote || "").trim(),
    sessionMode: normalizeSessionMode(input.sessionMode),
    notes: input.notes || "",
    connectionStatus: official ? (input.connectionStatus || "connected") : "not_connected",
    oauthConnectionId: official ? input.oauthConnectionId : "",
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

function normalizeImportRow(row = {}, ignored = new Set()) {
  const item = {};
  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeFieldName(key);
    if (DESKTOP_FORBIDDEN_IMPORT_FIELDS.has(normalized)) {
      ignored.add(normalized);
      continue;
    }
    if (!DESKTOP_ALLOWED_IMPORT_FIELDS.has(normalized)) continue;
    item[fieldAlias(normalized)] = String(value || "").trim();
  }
  if (item.handle) item.handle = normalizeHandle(item.handle);
  return item;
}

function normalizeNetworkNoteRow(row = {}, ignored = new Set()) {
  const item = {};
  for (const [key, value] of Object.entries(row)) {
    const field = normalizeNetworkNoteFieldName(key, ignored);
    if (!field) continue;
    item[field] = String(value || "").trim();
  }
  if (item.handle) item.handle = normalizeHandle(item.handle);
  return item;
}

function normalizeNetworkNoteFieldName(value, ignored = new Set()) {
  const raw = String(value || "").trim();
  const normalized = normalizeFieldName(raw);
  const rawCompact = raw.toLowerCase().replace(/\s+/g, "");
  if (normalized === "proxyaddress" || normalized === "ipaddress" || rawCompact === "proxyaddress" || rawCompact === "ipaddress" || rawCompact === "代理地址" || rawCompact === "ip地址") return "proxyAddress";
  if (normalized === "proxyport" || normalized === "port" || rawCompact === "端口") return "proxyPort";
  if (normalized === "proxylastchecked" || normalized === "lastchecked" || rawCompact === "lastchecked" || rawCompact === "最后检查" || rawCompact === "检测时间") return "proxyLastChecked";
  if (normalized === "proxystatus" || normalized === "status" || rawCompact === "状态") return "proxyStatus";
  if (normalized === "proxycity" || normalized === "city" || rawCompact === "城市") return "proxyCity";
  if (normalized === "proxycountry" || normalized === "country" || rawCompact === "国家") return "proxyCountry";
  if (normalized === "username" || rawCompact === "用户名" || rawCompact === "账号名") {
    ignored.add("username");
    return "";
  }
  const forbidden = forbiddenImportFieldName(raw, normalized);
  if (forbidden) {
    ignored.add(forbidden);
    return "";
  }
  if (normalized === "accountid" || rawCompact === "账号id" || rawCompact === "账号编号") return "accountId";
  if (normalized === "handle" || rawCompact === "账号" || rawCompact === "x账号" || rawCompact === "推特账号") return "handle";
  if (["network", "networklabel", "networknote"].includes(normalized) || rawCompact === "网络" || rawCompact === "网络备注" || rawCompact === "网络ip") return "networkLabel";
  if (["ip", "ipnote"].includes(normalized) || rawCompact === "ip备注" || rawCompact === "ip归属" || rawCompact === "ip归属备注") return "ipNote";
  if (["device", "devicenote"].includes(normalized) || rawCompact === "设备" || rawCompact === "设备备注" || rawCompact === "手机") return "deviceNote";
  if (normalized === "countryregionnote" || rawCompact === "地区" || rawCompact === "国家地区" || rawCompact === "国家/地区" || rawCompact === "国家地区备注") return "countryRegionNote";
  if (normalized === "notes" || rawCompact === "备注") return "notes";
  return DESKTOP_NETWORK_NOTE_FIELDS.has(normalized) ? fieldAlias(normalized) : "";
}

function forbiddenImportFieldName(raw, normalized) {
  if (DESKTOP_FORBIDDEN_IMPORT_FIELDS.has(normalized)) return normalized;
  const compact = String(raw || "").toLowerCase().replace(/\s+/g, "");
  if (/密码|口令/.test(compact)) return "password";
  if (/cookie/.test(compact)) return "cookie";
  if (/代理|proxy/.test(compact)) return "proxy";
  if (/指纹|fingerprint/.test(compact)) return "fingerprint";
  if (/token/.test(compact)) return "token";
  if (/secret|密钥/.test(compact)) return "secret";
  if (/timezone|时区/.test(compact)) return "timezone";
  return "";
}

function networkNotePatch(row = {}) {
  const patch = {};
  for (const field of ["networkLabel", "ipNote", "deviceNote", "countryRegionNote", "notes"]) {
    if (String(row[field] || "").trim()) patch[field] = String(row[field]).trim();
  }
  const proxyAddress = String(row.proxyAddress || "").trim();
  const proxyPort = String(row.proxyPort || "").trim();
  if (proxyAddress && !patch.ipNote) patch.ipNote = proxyPort ? `${proxyAddress}:${proxyPort}` : proxyAddress;
  const location = [row.proxyCountry, row.proxyCity].map((item) => String(item || "").trim()).filter(Boolean).join(" / ");
  if (location && !patch.countryRegionNote) patch.countryRegionNote = location;
  const proxyNotes = [
    row.proxyStatus ? `状态: ${row.proxyStatus}` : "",
    row.proxyLastChecked ? `检查: ${row.proxyLastChecked}` : ""
  ].filter(Boolean).join("；");
  if (proxyNotes && !patch.notes) patch.notes = proxyNotes;
  return patch;
}

function hasNetworkNoteUpdate(row = {}) {
  return ["networkLabel", "ipNote", "deviceNote", "countryRegionNote", "notes", "proxyAddress", "proxyPort", "proxyCountry", "proxyCity", "proxyStatus", "proxyLastChecked"]
    .some((field) => String(row[field] || "").trim());
}

function parseFlexibleNetworkTable(pasted) {
  const text = String(pasted || "").trim();
  if (!text) return [];
  if (text.includes("\t")) {
    return text.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split("\t").map((cell) => cell.trim()));
  }
  return parseCsv(text);
}

function normalizeFieldName(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function fieldAlias(field) {
  if (["lane", "laneid", "contentlane"].includes(field)) return "laneId";
  if (field === "country") return "country";
  if (field === "region") return "country";
  if (field === "publishmode") return "publishMode";
  if (field === "dailypostlimit") return "dailyPostLimit";
  if (field === "externallinklimit") return "externalLinkLimit";
  if (["network", "networklabel", "networknote"].includes(field)) return "networkLabel";
  if (["ip", "ipnote"].includes(field)) return "ipNote";
  if (["device", "devicenote"].includes(field)) return "deviceNote";
  if (field === "countryregionnote") return "countryRegionNote";
  if (field === "sessionmode") return "sessionMode";
  return field;
}

function normalizeDesktopLaneId(value) {
  const lane = String(value || "").trim();
  const aliases = {
    ai: "ai_startups",
    ai_startup: "ai_startups",
    indie: "indie_builders",
    saas: "saas_founders",
    crypto: "crypto_builders",
    uncategorized: "none",
    unclassified: "none"
  };
  const normalized = aliases[lane] || lane;
  return ["ai_startups", "indie_builders", "saas_founders", "crypto_builders", "custom", "none"].includes(normalized)
    ? normalized
    : "none";
}

function normalizeSessionMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return ["temp", "manual", "fixed_note"].includes(mode) ? mode : "temp";
}

function parseHandles(value) {
  return String(value || "")
    .split(/\r?\n|,|，/)
    .map((item) => normalizeHandle(item))
    .filter((item) => item && item !== "@");
}

function normalizeHandle(value) {
  const clean = String(value || "").trim().replace(/^https?:\/\/(?:x|twitter)\.com\//i, "").replace(/[/?#].*$/, "").replace(/^@/, "");
  if (!clean) return "";
  return `@${clean.replace(/[^A-Za-z0-9_]/g, "").slice(0, 30)}`;
}

function normalizeLanes(value) {
  const lanes = Array.isArray(value) ? value : String(value || "").split(/[,，\s]+/);
  const cleaned = lanes.map((lane) => String(lane || "").trim()).filter(Boolean);
  return cleaned.length ? cleaned : ["ai_startups", "indie_builders", "saas_founders", "crypto_builders"];
}

async function writeDesktopState(input = {}) {
  const now = new Date().toISOString();
  await writeJsonAtomic(DESKTOP_STATE_PATH, {
    version: 1,
    setupCompleted: true,
    mode: input.mode || "demo",
    workspaceId: input.workspaceId || "workspace_default",
    workspaceName: input.workspaceName || "",
    updatedAt: now
  });
}

async function listRuntimeJsonFiles() {
  const paths = [
    DESKTOP_STATE_PATH,
    DESKTOP_AUDIT_PATH,
    "data/workspaces.json",
    "data/users.json",
    "data/x-accounts.json",
    "data/assignments.json",
    "data/post-tasks.json",
    "data/post-ledger.json",
    "data/feedback.json",
    "data/relationship-targets.json",
    "data/account-health.json",
    "data/content-lanes.json",
    "data/workspace-lanes.json",
    "data/tools.json",
    "data/topics.json",
    "data/copy-library.json",
    "data/publish-settings.json",
    "data/publish-jobs.json",
    "data/publish-attempts.json",
    "data/x-connections.json",
    "data/subscriptions.json",
    "data/user-identities.json"
  ];
  const existing = [];
  for (const filePath of paths) {
    try {
      await access(resolveProjectPath(filePath));
      existing.push(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return existing;
}

function upsertCollection(collection, item, idField) {
  return {
    ...collection,
    updatedAt: new Date().toISOString(),
    items: upsertItem(collection.items || [], item, idField)
  };
}

function upsertItem(items = [], item, idField) {
  const index = items.findIndex((current) => current[idField] === item[idField]);
  if (index >= 0) {
    const existing = items[index];
    return items.map((current, currentIndex) => currentIndex === index
      ? { ...existing, ...item, createdAt: existing.createdAt || item.createdAt }
      : current);
  }
  return [...items, item];
}

function existingById(items = [], idField, id) {
  return items.find((item) => item[idField] === id) || null;
}

function appendNote(existing, note) {
  return [existing, note].filter(Boolean).join("\n").trim();
}

function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function sanitizeXOAuthConfig(config, safeStorage) {
  const clientId = String(config?.clientId || "").trim();
  const secret = String(config?.clientSecretRef || "").trim();
  const connected = config?.tokenStorage === "connected";
  return {
    configured: Boolean(clientId && secret),
    clientId,
    maskedClientId: maskClientId(clientId),
    maskedClientSecret: maskSecret(secret),
    maskedConsumerKey: maskClientId(config?.consumerKey || ""),
    consumerKeyConfigured: Boolean(config?.consumerKey && config?.consumerSecretRef),
    bearerTokenConfigured: Boolean(config?.bearerTokenRef),
    callbackUrl: config?.callbackUrl || defaultXCallbackUrl(),
    scopes: Array.isArray(config?.scopes) && config.scopes.length ? config.scopes : defaultXScopes(),
    tokenStorage: config?.tokenStorage || "not_configured",
    tokenStorageLabel: connected ? `已登录 ${config?.authorizedHandle || ""}`.trim() : (safeStorage.available ? "本地加密可用，尚未写入 token" : (config?.tokenStorageLabel || "未写入 token")),
    authorizedAccountId: config?.authorizedAccountId || "",
    authorizedHandle: config?.authorizedHandle || "",
    tokenExpiresAt: config?.tokenExpiresAt || "",
    safeStorageAvailable: safeStorage.available
  };
}

async function exchangeXOAuthCode({ code, config, codeVerifier, fetchImpl }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.callbackUrl || defaultXCallbackUrl(),
    code_verifier: codeVerifier
  });
  const response = await fetchImpl("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecretRef}`).toString("base64")}`
    },
    body
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`X token exchange failed (${response.status}): ${json.error_description || json.error || "unknown error"}`);
  }
  if (!json.access_token) throw new Error("X token exchange succeeded but no access_token was returned.");
  return json;
}

async function fetchXUserProfile({ accessToken, fetchImpl }) {
  const response = await fetchImpl("https://api.x.com/2/users/me", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`X user profile failed (${response.status}): ${json.detail || json.title || json.error || "unknown error"}`);
  }
  if (!json?.data?.username) throw new Error("X user profile response did not include username.");
  return json;
}

async function desktopSafeStorageStatus() {
  try {
    const electron = await import("electron");
    return { available: Boolean(electron.safeStorage?.isEncryptionAvailable?.()) };
  } catch {
    return { available: false };
  }
}

function defaultXCallbackUrl() {
  const port = process.env.AI_CREATOR_OS_DESKTOP_PORT || "5288";
  return `http://127.0.0.1:${port}/api/oauth/x/callback`;
}

function defaultXScopes() {
  return ["tweet.read", "tweet.write", "users.read", "offline.access"];
}

function normalizeScopes(value) {
  const scopes = Array.isArray(value) ? value : String(value || "").split(/[\s,]+/);
  const cleaned = scopes.map((item) => String(item || "").trim()).filter(Boolean);
  return cleaned.length ? [...new Set(cleaned)] : defaultXScopes();
}

function maskSecret(value = "") {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "********";
  return `${text.slice(0, 4)}${"*".repeat(Math.min(12, text.length - 8))}${text.slice(-4)}`;
}

function maskClientId(value = "") {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 10) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function base64Url(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function sanitizeLogText(value) {
  return String(value || "").replace(/(token|secret|password|cookie|api[_-]?key)[^,\s]*/gi, "[redacted]");
}

function sanitizeLogObject(value) {
  const result = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (/(token|secret|password|cookie|api[_-]?key)/i.test(key)) continue;
    result[key] = typeof item === "string" ? sanitizeLogText(item) : item;
  }
  return result;
}
