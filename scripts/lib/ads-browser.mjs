import { readJson, writeJsonAtomic } from "./file-store.mjs";

export const DESKTOP_ADS_BROWSER_PATH = "data/desktop-ads-browser.json";

const DEFAULT_ADS_BROWSER_CONFIG = {
  version: 1,
  provider: "adspower",
  baseUrl: "http://local.adspower.net:50325",
  apiKeyRef: "",
  startPath: "/api/v1/browser/start",
  listPath: "/api/v1/user/list",
  updatedAt: ""
};

export async function loadDesktopAdsBrowserStatus() {
  const config = await readAdsBrowserConfig();
  return sanitizeAdsBrowserConfig(config);
}

export async function saveDesktopAdsBrowserConfig(input = {}) {
  const existing = await readAdsBrowserConfig();
  const now = new Date().toISOString();
  const baseUrl = normalizeBaseUrl(input.baseUrl || existing.baseUrl || DEFAULT_ADS_BROWSER_CONFIG.baseUrl);
  const apiKey = String(input.accessText || input.apiKey || "").trim() || existing.apiKeyRef || "";
  const config = {
    ...DEFAULT_ADS_BROWSER_CONFIG,
    ...existing,
    provider: "adspower",
    baseUrl,
    apiKeyRef: apiKey,
    startPath: normalizeApiPath(input.startPath || existing.startPath || DEFAULT_ADS_BROWSER_CONFIG.startPath),
    listPath: normalizeApiPath(input.listPath || existing.listPath || DEFAULT_ADS_BROWSER_CONFIG.listPath),
    updatedAt: now
  };
  await writeJsonAtomic(DESKTOP_ADS_BROWSER_PATH, config);
  return sanitizeAdsBrowserConfig(config);
}

export async function clearDesktopAdsBrowserConfig() {
  const config = {
    ...DEFAULT_ADS_BROWSER_CONFIG,
    baseUrl: "",
    apiKeyRef: "",
    updatedAt: new Date().toISOString()
  };
  await writeJsonAtomic(DESKTOP_ADS_BROWSER_PATH, config);
  return sanitizeAdsBrowserConfig(config);
}

export async function testDesktopAdsBrowserConfig(options = {}) {
  const config = await readAdsBrowserConfig();
  assertAdsBrowserConfigured(config);
  const fetchImpl = options.fetchImpl || fetch;
  const url = new URL(config.listPath || DEFAULT_ADS_BROWSER_CONFIG.listPath, config.baseUrl);
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "1");
  const response = await fetchImpl(url, { headers: adsHeaders(config) });
  const json = await readJsonResponse(response);
  const apiOk = adsApiOk(response, json);
  if (!apiOk) {
    throw new Error(`ADS 浏览器连接失败 (${response.status || "api"}): ${adsApiMessage(json)}`);
  }
  return {
    ok: true,
    provider: config.provider,
    baseUrl: config.baseUrl,
    status: response.status,
    message: adsApiMessage(json) || "ADS 浏览器连接正常"
  };
}

export async function openDesktopAdsBrowserProfile(input = {}, options = {}) {
  const config = await readAdsBrowserConfig();
  assertAdsBrowserConfigured(config);
  const profileId = String(input.adsProfileId || input.profileId || input.environmentId || "").trim();
  if (!profileId) throw new Error("请先给这个账号填写 ADS 环境 ID，或把工作环境切回默认浏览器。");

  const fetchImpl = options.fetchImpl || fetch;
  const url = new URL(config.startPath || DEFAULT_ADS_BROWSER_CONFIG.startPath, config.baseUrl);
  url.searchParams.set("user_id", profileId);
  url.searchParams.set("open_tabs", "1");
  url.searchParams.set("ip_tab", "0");

  const response = await fetchImpl(url, { headers: adsHeaders(config) });
  const json = await readJsonResponse(response);
  const apiOk = adsApiOk(response, json);
  if (!apiOk) {
    throw new Error(`ADS 环境打开失败 (${response.status || "api"}): ${adsApiMessage(json)}`);
  }
  return {
    ok: true,
    provider: config.provider,
    profileId,
    baseUrl: config.baseUrl,
    status: response.status,
    message: adsApiMessage(json) || "ADS 环境已打开",
    data: json?.data || null
  };
}

export function sanitizeAdsBrowserConfig(config = {}) {
  const baseUrl = String(config.baseUrl || "").trim();
  const apiKey = String(config.apiKeyRef || "").trim();
  return {
    configured: Boolean(baseUrl),
    provider: config.provider || "adspower",
    providerLabel: "ADS 浏览器",
    baseUrl,
    maskedAccess: maskSecret(apiKey),
    accessConfigured: Boolean(apiKey),
    startPath: config.startPath || DEFAULT_ADS_BROWSER_CONFIG.startPath,
    listPath: config.listPath || DEFAULT_ADS_BROWSER_CONFIG.listPath,
    updatedAt: config.updatedAt || ""
  };
}

async function readAdsBrowserConfig() {
  const config = await readJson(DESKTOP_ADS_BROWSER_PATH, null);
  return {
    ...DEFAULT_ADS_BROWSER_CONFIG,
    ...(config || {})
  };
}

function assertAdsBrowserConfigured(config) {
  if (!String(config.baseUrl || "").trim()) {
    throw new Error("请先在设置里配置 ADS 浏览器 API 地址。");
  }
}

function normalizeBaseUrl(value) {
  const text = String(value || "").trim().replace(/\/+$/, "");
  if (!text) return "";
  const parsed = new URL(text);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("ADS API 地址必须是 http(s) URL。");
  return parsed.toString().replace(/\/+$/, "");
}

function normalizeApiPath(value) {
  const text = String(value || "").trim();
  if (!text) return "/";
  return text.startsWith("/") ? text : `/${text}`;
}

function adsHeaders(config) {
  const headers = { accept: "application/json" };
  const apiKey = String(config.apiKeyRef || "").trim();
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  return headers;
}

async function readJsonResponse(response) {
  return response.json().catch(() => ({}));
}

function adsApiOk(response, json) {
  if (!response.ok) return false;
  if (json && Object.hasOwn(json, "code")) return Number(json.code) === 0;
  return true;
}

function adsApiMessage(json) {
  return String(json?.msg || json?.message || json?.error || "unknown").trim();
}

function maskSecret(value = "") {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 8) return "********";
  return `${text.slice(0, 4)}${"*".repeat(Math.min(12, text.length - 8))}${text.slice(-4)}`;
}
