import { randomBytes } from "node:crypto";
import { emptyCollection } from "./core-data.mjs";
import { readJson, writeJsonAtomic } from "./file-store.mjs";
import { createStableId } from "./ids.mjs";

const FINGERPRINT_COLLECTION_PATH = "data/fingerprints.json";

/**
 * 浏览器指纹配置
 */
export const FingerprintPresets = {
  // Chrome Windows
  CHROME_WINDOWS: "chrome_windows",
  // Chrome macOS
  CHROME_MAC: "chrome_mac",
  // Firefox Windows
  FIREFOX_WINDOWS: "firefox_windows",
  // Safari macOS
  SAFARI_MAC: "safari_mac",
  // Mobile Chrome
  MOBILE_CHROME: "mobile_chrome",
  // Mobile Safari
  MOBILE_SAFARI: "mobile_safari"
};

/**
 * 加载指纹配置列表
 */
export async function loadFingerprints(options = {}) {
  const collection = await readJson(FINGERPRINT_COLLECTION_PATH, emptyCollection());
  const workspaceId = options.workspaceId || "workspace_default";

  return {
    items: (collection.items || []).filter(item =>
      !workspaceId || (item.workspaceId || "workspace_default") === workspaceId
    ),
    updatedAt: collection.updatedAt || ""
  };
}

/**
 * 根据ID获取指纹配置
 */
export async function getFingerprintById(fingerprintId) {
  const collection = await readJson(FINGERPRINT_COLLECTION_PATH, emptyCollection());
  return (collection.items || []).find(item => item.fingerprintId === fingerprintId) || null;
}

/**
 * 生成随机指纹
 */
export function generateRandomFingerprint(options = {}) {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15"
  ];

  const screenResolutions = [
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 }
  ];

  const languages = ["en-US", "en-GB", "en"];
  const timezones = [-8, -5, 0, 1, 8]; // PST, EST, UTC, CET, CST

  const randomFromArray = arr => arr[Math.floor(Math.random() * arr.length)];

  const screen = options.screen || randomFromArray(screenResolutions);
  const language = options.language || randomFromArray(languages);
  const timezone = options.timezone !== undefined ? options.timezone : randomFromArray(timezones);

  return {
    userAgent: options.userAgent || randomFromArray(userAgents),
    screen: {
      width: screen.width,
      height: screen.height,
      colorDepth: 24,
      devicePixelRatio: 1
    },
    language,
    languages: [language],
    timezone,
    timezoneString: timezoneToOffsetString(timezone),
    platform: detectPlatform(options.userAgent || randomFromArray(userAgents)),
    hardwareConcurrency: options.hardwareConcurrency || [4, 8, 12][Math.floor(Math.random() * 3)],
    deviceMemory: options.deviceMemory || [4, 8, 16][Math.floor(Math.random() * 3)],
    webgl: {
      vendor: "Google Inc. (NVIDIA)",
      renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Direct3D11 vs_5_0 ps_5_0)"
    },
    canvas: randomBytes(32).toString('hex'),
    audioContext: randomBytes(16).toString('hex'),
    fonts: [
      "Arial", "Helvetica", "Times New Roman", "Courier New",
      "Verdana", "Georgia", "Palatino", "Garamond"
    ],
    plugins: [
      { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer" },
      { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai" }
    ],
    doNotTrack: options.doNotTrack || false,
    cookiesEnabled: true
  };
}

/**
 * 创建或更新指纹配置
 */
export async function upsertFingerprint(input = {}, actor = { userId: "user_owner" }) {
  const now = new Date().toISOString();
  const workspaceId = input.workspaceId || "workspace_default";

  const fingerprintId = input.fingerprintId || createStableId("fp", [workspaceId, Date.now()]);

  const collection = await readJson(FINGERPRINT_COLLECTION_PATH, emptyCollection());
  const existing = (collection.items || []).find(item => item.fingerprintId === fingerprintId);

  // 如果没有提供完整配置，生成随机指纹
  const fingerprintData = input.fingerprint || generateRandomFingerprint({
    userAgent: input.userAgent,
    language: input.language,
    timezone: input.timezone,
    screen: input.screen
  });

  const fingerprint = {
    fingerprintId,
    workspaceId,
    name: input.name || `Browser Profile ${fingerprintId.slice(0, 8)}`,
    preset: input.preset || "custom",

    // 浏览器指纹数据
    fingerprint: fingerprintData,

    // 元数据
    notes: input.notes || "",
    tags: input.tags || [],

    // 使用统计
    usageCount: input.usageCount || existing?.usageCount || 0,
    lastUsedAt: input.lastUsedAt || existing?.lastUsedAt || "",

    // 审计字段
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdBy: actor.userId
  };

  const items = (collection.items || []).filter(item => item.fingerprintId !== fingerprintId);
  items.push(fingerprint);

  await writeJsonAtomic(FINGERPRINT_COLLECTION_PATH, {
    ...collection,
    updatedAt: now,
    items
  });

  return { fingerprint };
}

/**
 * 删除指纹配置
 */
export async function deleteFingerprint(fingerprintId, actor = { userId: "user_owner" }) {
  void actor;
  const collection = await readJson(FINGERPRINT_COLLECTION_PATH, emptyCollection());
  const items = (collection.items || []).filter(item => item.fingerprintId !== fingerprintId);

  if (items.length === (collection.items || []).length) {
    throw new Error(`指纹配置不存在: ${fingerprintId}`);
  }

  await writeJsonAtomic(FINGERPRINT_COLLECTION_PATH, {
    ...collection,
    updatedAt: new Date().toISOString(),
    items
  });

  return { deleted: true, fingerprintId };
}

/**
 * 应用指纹到 Electron BrowserWindow
 * 注意：不修改 partition，固定窗口始终用 persist:aicos:<workspaceId>:<accountId>
 * 只提供可选的 User-Agent 和语言参数
 */
export function applyFingerprintToWindow(fingerprint) {
  if (!fingerprint || !fingerprint.fingerprint) {
    return {};
  }

  const fp = fingerprint.fingerprint;

  return {
    webPreferences: {
      // 设置 User-Agent
      userAgent: fp.userAgent,

      // 设置语言
      additionalBrowserArgs: [
        `--lang=${fp.language}`,
        `--timezone-offset=${fp.timezone || 0}`
      ].join(' ')
    }
  };
}

/**
 * 获取 Electron session 配置
 * 注意：不再为指纹创建独立 partition
 * 固定窗口的 partition 始终是 persist:aicos:<workspaceId>:<accountId>
 * 此函数仅返回可选的 BrowserWindow 参数，不包含 partition
 */
export function getFingerprintBrowserOptions(fingerprint) {
  if (!fingerprint || !fingerprint.fingerprint) {
    return {};
  }

  const fp = fingerprint.fingerprint;
  const options = {};

  if (fp.userAgent) {
    options.userAgent = fp.userAgent;
  }

  if (fp.language || fp.timezone !== undefined) {
    const args = [];
    if (fp.language) args.push(`--lang=${fp.language}`);
    if (fp.timezone !== undefined) args.push(`--timezone-offset=${fp.timezone}`);
    options.additionalBrowserArgs = args.join(' ');
  }

  return options;
}

/**
 * 辅助函数：时区转偏移字符串
 */
function timezoneToOffsetString(timezone) {
  const hours = Math.abs(timezone);
  const sign = timezone >= 0 ? "+" : "-";
  return `UTC${sign}${String(hours).padStart(2, "0")}:00`;
}

/**
 * 辅助函数：检测平台
 */
function detectPlatform(userAgent) {
  if (/Windows/.test(userAgent)) return "Win32";
  if (/Mac/.test(userAgent)) return "MacIntel";
  if (/Linux/.test(userAgent)) return "Linux x86_64";
  return "Win32";
}

/**
 * 导出指纹配置
 */
export async function exportFingerprintsCsv(workspaceId = "workspace_default") {
  const { items } = await loadFingerprints({ workspaceId });

  const rows = items.map(fp => [
    fp.name || "",
    fp.preset || "custom",
    fp.fingerprint?.userAgent || "",
    fp.fingerprint?.language || "",
    fp.fingerprint?.timezone || "",
    fp.fingerprint?.screen?.width || "",
    fp.fingerprint?.screen?.height || "",
    fp.fingerprint?.platform || "",
    fp.notes || ""
  ]);

  const headers = [
    "name", "preset", "userAgent", "language", "timezone",
    "screenWidth", "screenHeight", "platform", "notes"
  ];

  return [headers, ...rows].map(row => row.map(cell => csvCell(cell)).join(",")).join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}
