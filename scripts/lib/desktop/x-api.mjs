import { assertTweetLength } from "../tweet-length.mjs";

export function emptyCredentialStore() {
  return { version: 1, updatedAt: "", byAccountId: {} };
}

export function normalizeCredentialStore(store = {}) {
  return {
    version: Number(store.version || 1),
    updatedAt: store.updatedAt || "",
    byAccountId: store.byAccountId && typeof store.byAccountId === "object" ? store.byAccountId : {}
  };
}

export function existingByAccountCredential(store = {}, accountId = "") {
  return normalizeCredentialStore(store).byAccountId[String(accountId || "").trim()] || null;
}

export function upsertCredentialStore(store = {}, credential = {}, updatedAt = new Date().toISOString()) {
  const current = normalizeCredentialStore(store);
  const accountId = String(credential.accountId || "").trim();
  if (!accountId) return { ...current, updatedAt };
  return {
    ...current,
    updatedAt,
    byAccountId: {
      ...current.byAccountId,
      [accountId]: {
        ...(current.byAccountId[accountId] || {}),
        ...credential,
        accountId,
        updatedAt
      }
    }
  };
}

export function selectDesktopCredentialForAccount(accountId = "", store = {}, oauthConfig = {}) {
  const cleanAccountId = String(accountId || "").trim();
  const vaultCredential = existingByAccountCredential(store, cleanAccountId);
  if (vaultCredential?.accessTokenRef) return { source: "account_vault", credential: vaultCredential };
  if (oauthConfig?.authorizedAccountId === cleanAccountId && oauthConfig?.accessTokenRef) {
    return {
      source: "desktop_x_oauth",
      credential: {
        accountId: cleanAccountId,
        handle: oauthConfig.authorizedHandle || "",
        externalUserId: oauthConfig.authorizedExternalUserId || "",
        accessTokenRef: oauthConfig.accessTokenRef,
        refreshTokenRef: oauthConfig.refreshTokenRef || "",
        tokenType: oauthConfig.tokenType || "bearer",
        tokenExpiresAt: oauthConfig.tokenExpiresAt || "",
        scopes: oauthConfig.scopes || defaultXScopes(),
        appId: "default",
        status: "connected",
        connectedAt: oauthConfig.connectedAt || "",
        updatedAt: oauthConfig.updatedAt || ""
      }
    };
  }
  return null;
}

export async function ensureDesktopCredentialFresh({ credential, oauthConfig, fetchImpl, now }) {
  if (!desktopCredentialNeedsRefresh(credential, now)) return { credential, changed: false };
  const refreshed = await refreshDesktopCredential({ credential, oauthConfig, fetchImpl, now });
  return { credential: refreshed, changed: true };
}

export function desktopCredentialNeedsRefresh(credential = {}, now = new Date()) {
  const expiresAt = String(credential.tokenExpiresAt || "").trim();
  if (!expiresAt) return false;
  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) return false;
  return expiry - now.getTime() < 120000;
}

export async function refreshDesktopCredential({ credential, oauthConfig = {}, fetchImpl, now = new Date() }) {
  if (!credential.refreshTokenRef) throw new Error("X token 已过期，请重新连接该 X 账号。");
  if (!oauthConfig?.clientId) throw new Error("X API Client ID 缺失，请先在设置里保存 X API 配置。");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: credential.refreshTokenRef
  });
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  if (oauthConfig.clientSecretRef) {
    headers.authorization = `Basic ${Buffer.from(`${oauthConfig.clientId}:${oauthConfig.clientSecretRef}`).toString("base64")}`;
  } else {
    body.set("client_id", oauthConfig.clientId);
  }
  const response = await fetchImpl("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`X token 刷新失败 (${response.status})：${json.error_description || json.detail || json.error || response.statusText || "unknown error"}`);
  }
  if (!json.access_token) throw new Error("X token 刷新成功但没有返回 access_token。");
  const refreshedAt = now.toISOString();
  return {
    ...credential,
    accessTokenRef: json.access_token,
    refreshTokenRef: json.refresh_token || credential.refreshTokenRef || "",
    tokenType: json.token_type || credential.tokenType || "bearer",
    tokenExpiresAt: json.expires_in ? new Date(now.getTime() + Number(json.expires_in) * 1000).toISOString() : credential.tokenExpiresAt || "",
    status: "connected",
    updatedAt: refreshedAt
  };
}

export async function publishDesktopTweet(text, accessToken, fetchImpl) {
  const normalized = String(text || "").trim();
  if (!normalized) throw new Error("发布文案不能为空。");
  assertTweetLength(normalized);
  const response = await fetchImpl("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ text: normalized })
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = json.detail || json.title || json.error_description || json.error || response.statusText || "unknown error";
    if (response.status === 401) throw new Error(`X 发布失败 (401)：token 失效或权限不足，请重新连接该 X 账号。${detail}`);
    if (response.status === 403) throw new Error(`X 发布失败 (403)：当前账号或 X App 没有发布权限。${detail}`);
    if (response.status === 429) throw new Error(`X 发布失败 (429)：X API 频率限制，请稍后再试。${detail}`);
    throw new Error(`X 发布失败 (${response.status})：${detail}`);
  }
  const id = String(json?.data?.id || "").trim();
  return {
    id,
    text: json?.data?.text || normalized,
    url: id ? `https://x.com/i/web/status/${id}` : ""
  };
}

export function sanitizeXOAuthConfig(config, safeStorage) {
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

export async function exchangeXOAuthCode({ code, config, codeVerifier, fetchImpl }) {
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

export async function fetchXUserProfile({ accessToken, fetchImpl }) {
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

export async function desktopSafeStorageStatus() {
  try {
    const electron = await import("electron");
    return { available: Boolean(electron.safeStorage?.isEncryptionAvailable?.()) };
  } catch {
    return { available: false };
  }
}

export function defaultXCallbackUrl() {
  const port = process.env.AI_CREATOR_OS_DESKTOP_PORT || "5288";
  return `http://127.0.0.1:${port}/api/oauth/x/callback`;
}

export function defaultXScopes() {
  return ["tweet.read", "tweet.write", "users.read", "offline.access"];
}

export function normalizeScopes(value) {
  const scopes = Array.isArray(value) ? value : String(value || "").split(/[\s,]+/);
  const cleaned = scopes.map((item) => String(item || "").trim()).filter(Boolean);
  return cleaned.length ? [...new Set(cleaned)] : defaultXScopes();
}

export function maskSecret(value = "") {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "********";
  return `${text.slice(0, 4)}${"*".repeat(Math.min(12, text.length - 8))}${text.slice(-4)}`;
}

export function maskClientId(value = "") {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 10) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

export function base64Url(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
