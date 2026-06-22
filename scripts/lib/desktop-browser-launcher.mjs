export const DESKTOP_INCOGNITO_NOTICE = "临时工作窗：仅用于人工查看/人工操作，不保存浏览器登录态。";
export const DESKTOP_PERSISTENT_NOTICE = "固定账号窗口：保留本机浏览器登录态；系统不读取、不导入、不导出 cookie。";

export function buildIncognitoAccountWindowConfig({
  workspaceId = "workspace_default",
  accountId = "",
  handle = "",
  url = "",
  mode = "electron",
  timestamp = Date.now()
} = {}) {
  const safeHandle = normalizeHandle(handle);
  const targetUrl = normalizeTargetUrl({ handle: safeHandle, url });
  const partition = `temp:${sanitize(workspaceId)}:${sanitize(accountId || safeHandle || "account")}:${timestamp}`;

  return {
    mode,
    workspaceId,
    accountId,
    handle: safeHandle,
    url: targetUrl,
    title: `AI Creator OS - ${safeHandle || "@account"} 临时工作窗`,
    notice: DESKTOP_INCOGNITO_NOTICE,
    browserWindowOptions: {
      width: 1180,
      height: 820,
      title: `AI Creator OS - ${safeHandle || "@account"} 临时工作窗`,
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    }
  };
}

export function buildPersistentAccountWindowConfig({
  workspaceId = "workspace_default",
  accountId = "",
  handle = "",
  url = "",
  mode = "electron"
} = {}) {
  const safeHandle = normalizeHandle(handle);
  const targetUrl = normalizeTargetUrl({ handle: safeHandle, url });
  const stableAccountKey = sanitize(accountId || safeHandle || "account");
  const partition = `persist:aicos:${sanitize(workspaceId)}:${stableAccountKey}`;

  return {
    mode,
    workspaceId,
    accountId,
    handle: safeHandle,
    url: targetUrl,
    title: `AI Creator OS - ${safeHandle || "@account"} 固定账号窗口`,
    notice: DESKTOP_PERSISTENT_NOTICE,
    browserWindowOptions: {
      width: 1180,
      height: 820,
      title: `AI Creator OS - ${safeHandle || "@account"} 固定账号窗口`,
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    }
  };
}

export function normalizeTargetUrl({ handle = "", url = "" } = {}) {
  if (url) {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Only http(s) URLs can be opened.");
    return parsed.toString();
  }
  const clean = normalizeHandle(handle).replace(/^@/, "");
  return clean ? `https://x.com/${encodeURIComponent(clean)}` : "https://x.com/home";
}

export function normalizeHandle(handle = "") {
  const value = String(handle || "").trim();
  if (!value) return "";
  return value.startsWith("@") ? value : `@${value}`;
}

function sanitize(value) {
  return String(value || "default").replace(/[^a-z0-9_.:-]+/gi, "_").slice(0, 80) || "default";
}
