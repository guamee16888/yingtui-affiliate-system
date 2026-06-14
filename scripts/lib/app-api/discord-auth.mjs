import { AppApiError } from "./response.mjs";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export function discordConfig(env = {}) {
  return {
    clientId: env.DISCORD_CLIENT_ID || "",
    clientSecret: env.DISCORD_CLIENT_SECRET || "",
    redirectUri: env.DISCORD_REDIRECT_URI || "",
    requiredGuildId: env.DISCORD_REQUIRED_GUILD_ID || "",
    requiredRoleIds: splitCsv(env.DISCORD_REQUIRED_ROLE_IDS || ""),
    botToken: env.DISCORD_BOT_TOKEN || "",
    stateSecret: env.DISCORD_STATE_SECRET || env.CF_ACCESS_AUD || ""
  };
}

export async function createDiscordAuthorizationUrl({ env, url, context }) {
  const config = discordConfig(env);
  if (!config.clientId) {
    throw new AppApiError("DISCORD_CONFIG_MISSING", "Discord client id 未配置。", 500);
  }
  const redirectUri = config.redirectUri || defaultRedirectUri(url);
  const state = await signState({
    userId: context.userId,
    workspaceId: context.workspaceId,
    issuedAt: Date.now()
  }, config.stateSecret);
  const authUrl = new URL("https://discord.com/oauth2/authorize");
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopeForConfig(config));
  authUrl.searchParams.set("state", state);
  return authUrl.toString();
}

export async function verifyDiscordCallback({ env, url, context, storage, fetchImpl = fetch }) {
  const config = discordConfig(env);
  if (!config.clientId || !config.clientSecret) {
    throw new AppApiError("DISCORD_CONFIG_MISSING", "Discord OAuth 未配置完整。", 500);
  }
  const code = url.searchParams.get("code") || "";
  const rawState = url.searchParams.get("state") || "";
  if (!code || !rawState) throw new AppApiError("DISCORD_CALLBACK_INVALID", "Discord callback 缺少 code 或 state。", 400);

  const state = await verifyState(rawState, config.stateSecret);
  if (state.userId !== context.userId || state.workspaceId !== context.workspaceId) {
    throw new AppApiError("DISCORD_STATE_MISMATCH", "Discord state 与当前登录用户不匹配。", 403);
  }

  const redirectUri = config.redirectUri || defaultRedirectUri(url);
  const token = await exchangeDiscordCode({ code, redirectUri, config, fetchImpl });
  const user = await fetchDiscordUser({ accessToken: token.access_token, fetchImpl });
  const entitlement = await storage.getWorkspaceEntitlement?.(context.workspaceId);
  const requiredGuildId = entitlement?.requiredDiscordGuildId || config.requiredGuildId;
  const requiredRoleIds = entitlement?.requiredDiscordRoleIds?.length ? entitlement.requiredDiscordRoleIds : config.requiredRoleIds;
  const member = requiredGuildId
    ? await fetchDiscordMember({ accessToken: token.access_token, botToken: config.botToken, guildId: requiredGuildId, userId: user.id, fetchImpl })
    : { guildId: "", roles: [] };
  if (requiredGuildId && !member) {
    throw new AppApiError("DISCORD_GUILD_REQUIRED", "Discord 账号不在指定群内。", 403, { requiredGuildId });
  }
  const roles = member?.roles || [];
  if (requiredRoleIds.length && !requiredRoleIds.some((roleId) => roles.includes(roleId))) {
    throw new AppApiError("DISCORD_ROLE_REQUIRED", "Discord 账号缺少指定身份组。", 403, { requiredRoleIds });
  }

  const identity = await storage.upsertUserIdentity({
    userId: context.userId,
    provider: "discord",
    providerUserId: user.id,
    username: discordUsername(user),
    guildId: requiredGuildId || "",
    roleIds: roles,
    status: "verified",
    verifiedAt: new Date().toISOString()
  }, { workspaceId: context.workspaceId, userId: context.userId, role: context.role });
  return { identity, user, member };
}

async function exchangeDiscordCode({ code, redirectUri, config, fetchImpl }) {
  const body = new URLSearchParams();
  body.set("client_id", config.clientId);
  body.set("client_secret", config.clientSecret);
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);
  const response = await fetchImpl(`${DISCORD_API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new AppApiError("DISCORD_TOKEN_EXCHANGE_FAILED", "Discord 授权失败。", 502, { status: response.status });
  return data;
}

async function fetchDiscordUser({ accessToken, fetchImpl }) {
  const response = await fetchImpl(`${DISCORD_API_BASE}/users/@me`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw new AppApiError("DISCORD_USER_FETCH_FAILED", "无法读取 Discord 用户。", 502, { status: response.status });
  return data;
}

async function fetchDiscordMember({ accessToken, botToken, guildId, userId, fetchImpl }) {
  const bearer = await fetchImpl(`${DISCORD_API_BASE}/users/@me/guilds/${guildId}/member`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (bearer.ok) {
    const data = await bearer.json().catch(() => ({}));
    return { guildId, roles: Array.isArray(data.roles) ? data.roles : [] };
  }
  if (!botToken) return null;
  const bot = await fetchImpl(`${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}`, {
    headers: { authorization: `Bot ${botToken}` }
  });
  if (!bot.ok) return null;
  const data = await bot.json().catch(() => ({}));
  return { guildId, roles: Array.isArray(data.roles) ? data.roles : [] };
}

async function signState(payload, secret) {
  if (!secret) throw new AppApiError("DISCORD_STATE_SECRET_MISSING", "Discord state secret 未配置。", 500);
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmac(encoded, secret);
  return `${encoded}.${signature}`;
}

async function verifyState(value, secret) {
  if (!secret) throw new AppApiError("DISCORD_STATE_SECRET_MISSING", "Discord state secret 未配置。", 500);
  const [encoded, signature] = String(value || "").split(".");
  if (!encoded || !signature) throw new AppApiError("DISCORD_STATE_INVALID", "Discord state 无效。", 400);
  const expected = await hmac(encoded, secret);
  if (!timingSafeEqual(signature, expected)) throw new AppApiError("DISCORD_STATE_INVALID", "Discord state 校验失败。", 400);
  const payload = JSON.parse(base64UrlDecode(encoded));
  if (!payload.issuedAt || Date.now() - Number(payload.issuedAt) > STATE_MAX_AGE_MS) {
    throw new AppApiError("DISCORD_STATE_EXPIRED", "Discord state 已过期，请重新验证。", 400);
  }
  return payload;
}

async function hmac(value, secret) {
  const key = await cryptoSubtle().importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await cryptoSubtle().sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function cryptoSubtle() {
  if (!globalThis.crypto?.subtle) throw new AppApiError("DISCORD_CRYPTO_UNAVAILABLE", "当前运行环境不支持 Discord state 加密。", 500);
  return globalThis.crypto.subtle;
}

function defaultRedirectUri(url) {
  return `${url.origin}/api/app/v1/auth/discord/callback`;
}

function scopeForConfig(config) {
  if (!config.requiredGuildId || config.botToken) return "identify";
  return "identify guilds.members.read";
}

export function peekDiscordStateWorkspaceId(value) {
  const [encoded] = String(value || "").split(".");
  if (!encoded) return "";
  try {
    const payload = JSON.parse(base64UrlDecode(encoded));
    return String(payload.workspaceId || "").trim();
  } catch {
    return "";
  }
}

function splitCsv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function discordUsername(user) {
  if (user.global_name) return user.global_name;
  if (user.username && user.discriminator && user.discriminator !== "0") return `${user.username}#${user.discriminator}`;
  return user.username || user.id;
}

function base64UrlEncode(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}
