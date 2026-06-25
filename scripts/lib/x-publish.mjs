import { updateDotEnv } from "./env.mjs";

export function getXPublishStatus(env = process.env, now = new Date()) {
  const configured = Boolean(env.X_ACCESS_TOKEN);
  const refreshConfigured = Boolean(env.X_REFRESH_TOKEN);
  const expiresAt = env.X_ACCESS_TOKEN_EXPIRES_AT || null;
  const expiry = expiresAt ? new Date(expiresAt).getTime() : null;
  const expiresInMs = expiry && !Number.isNaN(expiry) ? expiry - now.getTime() : null;
  const expired = configured && expiresInMs !== null && expiresInMs <= 0;
  const refreshDue = shouldRefreshXToken(env, now);
  const publishReady = configured && (!expired || refreshConfigured);
  const health = !configured
    ? "missing_token"
    : expired && refreshConfigured
      ? "expired_refresh_ready"
      : expired
        ? "expired_no_refresh"
        : refreshDue
          ? "refresh_due"
          : "ready";

  return {
    configured,
    publishReady,
    mode: configured ? "oauth2_user_context" : "missing_token",
    refreshConfigured,
    expiresAt,
    expiresInMs,
    expired,
    refreshDue,
    health,
    note: xStatusNote({ configured, refreshConfigured, expired, refreshDue, health })
  };
}

export function getAccountXPublishStatus(accountId, env = process.env, now = new Date(), options = {}) {
  const scoped = scopedAccountEnv(env, accountId);
  const status = getXPublishStatus(scoped, now);
  const globalStatus = options.useGlobalFallback ? getXPublishStatus(env, now) : null;
  if (!status.publishReady && globalStatus?.publishReady) {
    return {
      ...globalStatus,
      accountId,
      envPrefix: accountEnvPrefix(accountId),
      usesGlobalToken: true
    };
  }
  return {
    ...status,
    accountId,
    envPrefix: accountEnvPrefix(accountId),
    usesGlobalToken: false
  };
}

export function accountEnvPrefix(accountId) {
  return `X_ACCOUNT_${sanitizeAccountId(accountId)}_`;
}

export function sanitizeAccountId(accountId) {
  return String(accountId ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function accountEnvUpdates(accountId, updates) {
  const prefix = accountEnvPrefix(accountId);
  return {
    [`${prefix}ACCESS_TOKEN`]: updates.X_ACCESS_TOKEN,
    [`${prefix}TOKEN_TYPE`]: updates.X_TOKEN_TYPE,
    ...(updates.X_REFRESH_TOKEN ? { [`${prefix}REFRESH_TOKEN`]: updates.X_REFRESH_TOKEN } : {}),
    ...(updates.X_ACCESS_TOKEN_EXPIRES_AT ? { [`${prefix}ACCESS_TOKEN_EXPIRES_AT`]: updates.X_ACCESS_TOKEN_EXPIRES_AT } : {})
  };
}

function xStatusNote({ configured, refreshConfigured, refreshDue, health }) {
  if (!configured) return "Set X_ACCESS_TOKEN to an OAuth 2.0 User Context token with tweet.write scope.";
  if (health === "expired_refresh_ready") return "X access token is expired, but refresh token is configured. Publishing will refresh before posting.";
  if (health === "expired_no_refresh") return "X access token is expired and no refresh token is configured. Run npm run x:auth again.";
  if (refreshDue && refreshConfigured) return "X access token is near expiry. Publishing will refresh before posting.";
  return "X publishing is configured. Every publish request still requires explicit confirmation.";
}

export function buildXPostPayload(text) {
  const normalized = String(text ?? "").trim();
  if (!normalized) throw new Error("Post text is required");
  if (normalized.length > 280) throw new Error(`Post text is ${normalized.length} characters. Keep it at 280 or less.`);
  return { text: normalized };
}

export async function publishToX({ text, confirmed, accountId = "", useGlobalTokenFallback = false }, env = process.env) {
  if (!confirmed) throw new Error("Manual confirmation is required before publishing to X.");
  const accessToken = await resolveXAccessToken(env, accountId, { useGlobalTokenFallback });
  if (!accessToken) {
    throw new Error(accountId
      ? `X token is missing for account ${accountId}. Run npm run x:auth -- --account ${accountId}.`
      : "X_ACCESS_TOKEN is missing. Set a real X OAuth 2.0 User Context access token with tweet.write scope.");
  }

  const payload = buildXPostPayload(text);
  const response = await fetch("https://api.x.com/2/tweets", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = body.detail || body.title || body.error || response.statusText;
    throw new Error(`X publish failed (${response.status}): ${detail}`);
  }

  const id = body.data?.id;
  return {
    id,
    text: body.data?.text ?? payload.text,
    url: id ? `https://x.com/i/web/status/${id}` : ""
  };
}

export function shouldRefreshXToken(env = process.env, now = new Date()) {
  if (!env.X_REFRESH_TOKEN || !env.X_ACCESS_TOKEN_EXPIRES_AT) return false;
  const expiresAt = new Date(env.X_ACCESS_TOKEN_EXPIRES_AT).getTime();
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt - now.getTime() < 120000;
}

export function resolveXAccessToken(env = process.env, accountId = "", options = {}) {
  const scoped = accountId ? scopedAccountEnv(env, accountId) : env;
  if (accountId && options.useGlobalTokenFallback && !getXPublishStatus(scoped).publishReady && getXPublishStatus(env).publishReady) {
    if (shouldRefreshXToken(env)) return refreshXAccessToken(env);
    return env.X_ACCESS_TOKEN || "";
  }
  if (shouldRefreshXToken(scoped)) return refreshXAccessToken(env, accountId);
  return scoped.X_ACCESS_TOKEN || "";
}

export async function refreshXAccessToken(env = process.env, accountId = "") {
  const scoped = accountId ? scopedAccountEnv(env, accountId) : env;
  if (!env.X_CLIENT_ID) throw new Error("X_CLIENT_ID is missing. Run npm run x:auth setup first.");
  if (!scoped.X_REFRESH_TOKEN) throw new Error(accountId
    ? `X refresh token is missing for account ${accountId}. Run npm run x:auth -- --account ${accountId}.`
    : "X_REFRESH_TOKEN is missing. Run npm run x:auth again.");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: scoped.X_REFRESH_TOKEN
  });
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  if (env.X_CLIENT_SECRET) {
    headers.authorization = `Basic ${Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString("base64")}`;
  } else {
    body.set("client_id", env.X_CLIENT_ID);
  }

  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers,
    body
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = json.error_description || json.detail || json.error || response.statusText;
    throw new Error(`X token refresh failed (${response.status}): ${detail}`);
  }
  if (!json.access_token) throw new Error("X token refresh succeeded but no access_token was returned.");

  const updates = {
    X_ACCESS_TOKEN: json.access_token,
    X_TOKEN_TYPE: json.token_type || scoped.X_TOKEN_TYPE || "bearer"
  };
  if (json.refresh_token) updates.X_REFRESH_TOKEN = json.refresh_token;
  if (json.expires_in) {
    updates.X_ACCESS_TOKEN_EXPIRES_AT = new Date(Date.now() + Number(json.expires_in) * 1000).toISOString();
  }
  const envUpdates = accountId ? accountEnvUpdates(accountId, updates) : updates;
  Object.assign(env, envUpdates);
  if (env === process.env) await updateDotEnv(envUpdates);
  return updates.X_ACCESS_TOKEN;
}

function scopedAccountEnv(env, accountId) {
  const prefix = accountEnvPrefix(accountId);
  return {
    X_CLIENT_ID: env.X_CLIENT_ID,
    X_CLIENT_SECRET: env.X_CLIENT_SECRET,
    X_ACCESS_TOKEN: env[`${prefix}ACCESS_TOKEN`] || "",
    X_TOKEN_TYPE: env[`${prefix}TOKEN_TYPE`] || "bearer",
    X_REFRESH_TOKEN: env[`${prefix}REFRESH_TOKEN`] || "",
    X_ACCESS_TOKEN_EXPIRES_AT: env[`${prefix}ACCESS_TOKEN_EXPIRES_AT`] || ""
  };
}
