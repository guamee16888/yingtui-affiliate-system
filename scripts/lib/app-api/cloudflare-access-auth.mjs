import { AppApiError } from "./response.mjs";

const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";
const ACCESS_CERTS_PATH = "/cdn-cgi/access/certs";

export function isStrictAppEnv(env = process.env) {
  const appEnv = String(env.APP_ENV || env.NODE_ENV || "").trim().toLowerCase();
  return appEnv === "staging" || appEnv === "production";
}

export async function getCloudflareAccessPayload(request, options = {}) {
  if (options.accessJwtPayload) return normalizePayload(options.accessJwtPayload);

  const token = headerValue(request, ACCESS_JWT_HEADER);
  if (!token) throw new AppApiError("UNAUTHENTICATED", "请先登录。", 401);

  const env = options.env || process.env;
  const teamDomain = String(env.CF_ACCESS_TEAM_DOMAIN || "").trim();
  const expectedAud = String(env.CF_ACCESS_AUD || "").trim();
  if (!teamDomain || !expectedAud) {
    throw new AppApiError("ACCESS_CONFIG_MISSING", "Cloudflare Access 配置缺失。", 500);
  }

  const { header, payload, signingInput, signature } = decodeJwt(token);
  if (header.alg !== "RS256") {
    throw new AppApiError("ACCESS_JWT_INVALID", "Access JWT 算法不受支持。", 401);
  }
  assertJwtClaims(payload, expectedAud, options.now || Date.now());

  const jwk = await fetchAccessJwk({ teamDomain, kid: header.kid, fetchImpl: options.fetchImpl || fetch });
  const key = await subtle().importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const verified = await subtle().verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    new TextEncoder().encode(signingInput)
  );
  if (!verified) throw new AppApiError("ACCESS_JWT_INVALID", "Access JWT 验证失败。", 401);

  return normalizePayload(payload);
}

export function decodeJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new AppApiError("ACCESS_JWT_INVALID", "Access JWT 格式无效。", 401);
  try {
    return {
      header: JSON.parse(bytesToText(base64UrlToBytes(parts[0]))),
      payload: JSON.parse(bytesToText(base64UrlToBytes(parts[1]))),
      signingInput: `${parts[0]}.${parts[1]}`,
      signature: base64UrlToBytes(parts[2])
    };
  } catch {
    throw new AppApiError("ACCESS_JWT_INVALID", "Access JWT 解析失败。", 401);
  }
}

export function assertJwtClaims(payload, expectedAud, nowMs = Date.now()) {
  const now = Math.floor(nowMs / 1000);
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud].filter(Boolean);
  if (!aud.includes(expectedAud)) throw new AppApiError("ACCESS_JWT_INVALID", "Access JWT audience 不匹配。", 401);
  if (payload.exp && Number(payload.exp) <= now) throw new AppApiError("ACCESS_JWT_EXPIRED", "Access 登录已过期。", 401);
  if (payload.nbf && Number(payload.nbf) > now) throw new AppApiError("ACCESS_JWT_INVALID", "Access JWT 尚未生效。", 401);
}

async function fetchAccessJwk({ teamDomain, kid, fetchImpl }) {
  const url = accessCertsUrl(teamDomain);
  const response = await fetchImpl(url, { headers: { "user-agent": "ai-creator-os-access-jwt" } });
  if (!response?.ok) throw new AppApiError("ACCESS_CERTS_UNAVAILABLE", "无法读取 Cloudflare Access 证书。", 502);
  const jwks = await response.json();
  const key = (jwks.keys || []).find((item) => !kid || item.kid === kid);
  if (!key) throw new AppApiError("ACCESS_CERTS_UNAVAILABLE", "找不到匹配的 Access 证书。", 502);
  return key;
}

function normalizePayload(payload) {
  const email = String(payload.email || payload.sub || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new AppApiError("ACCESS_EMAIL_MISSING", "Access 登录信息缺少邮箱。", 401);
  }
  return { ...payload, email };
}

function accessCertsUrl(teamDomain) {
  const normalized = String(teamDomain || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return `https://${normalized}${ACCESS_CERTS_PATH}`;
}

function headerValue(request, headerName) {
  if (!request?.headers) return "";
  if (typeof request.headers.get === "function") return request.headers.get(headerName) || "";
  return request.headers[headerName] || request.headers[headerName.toLowerCase()] || "";
}

function base64UrlToBytes(value) {
  const padded = String(value || "").replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function bytesToText(bytes) {
  return new TextDecoder().decode(bytes);
}

function subtle() {
  if (!globalThis.crypto?.subtle) throw new AppApiError("ACCESS_CRYPTO_UNAVAILABLE", "当前运行环境不支持 Access JWT 验证。", 500);
  return globalThis.crypto.subtle;
}
