import { createHash, randomBytes } from "node:crypto";
import { createAccountId, createStableId } from "../ids.mjs";
import { CORE_COLLECTIONS, loadCollection, saveCollection } from "../core-data.mjs";
import { readJson, writeJsonAtomic } from "../file-store.mjs";
import { normalizeDesktopAccount } from "./account-import.mjs";
import { DESKTOP_X_CREDENTIALS_PATH, DESKTOP_X_OAUTH_PATH } from "./constants.mjs";
import { appendDesktopAudit } from "./logging.mjs";
import { existingById, normalizeHandle, upsertCollection } from "./internal.mjs";
import {
  base64Url,
  defaultXCallbackUrl,
  defaultXScopes,
  desktopSafeStorageStatus,
  emptyCredentialStore,
  exchangeXOAuthCode,
  existingByAccountCredential,
  fetchXUserProfile,
  maskClientId,
  normalizeScopes,
  sanitizeXOAuthConfig,
  upsertCredentialStore
} from "./x-api.mjs";

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

  const [accounts, assignments, connections, credentials] = await Promise.all([
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadCollection(CORE_COLLECTIONS.assignments),
    loadCollection("data/x-connections.json"),
    readJson(DESKTOP_X_CREDENTIALS_PATH, emptyCredentialStore())
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
    writeJsonAtomic(DESKTOP_X_CREDENTIALS_PATH, upsertCredentialStore(credentials, {
      accountId,
      handle,
      externalUserId,
      accessTokenRef: token.access_token,
      refreshTokenRef: token.refresh_token || config.refreshTokenRef || "",
      tokenType: token.token_type || "bearer",
      tokenExpiresAt: expiresAt,
      scopes: config.scopes || defaultXScopes(),
      appId: "default",
      status: "connected",
      connectedAt: existingByAccountCredential(credentials, accountId)?.connectedAt || now,
      updatedAt: now
    }, now)),
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
