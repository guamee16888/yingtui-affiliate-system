import {
  addDesktopRelationshipTargets,
  archiveDesktopAccount,
  clearDesktopXOAuthConfig,
  completeDesktopSetup,
  createDesktopTask,
  ensureDesktopAccountSlots,
  exportDesktopBackupPackage,
  importDesktopAccounts,
  importDesktopNetworkNotes,
  importDesktopBackup,
  markDesktopTaskPosted,
  publishDesktopTaskToX,
  resetDesktopDemoData,
  saveDesktopXOAuthConfig,
  saveDesktopFeedback,
  updateDesktopAccountConfig,
  updateDesktopRelationshipTargetStatus,
  upsertDesktopAccount
} from "../storage/interface.mjs";
import {
  clearDesktopAdsBrowserConfig,
  openDesktopAdsBrowserProfile,
  saveDesktopAdsBrowserConfig,
  testDesktopAdsBrowserConfig
} from "../ads-browser.mjs";
import {
  deleteFingerprint,
  upsertFingerprint
} from "../fingerprint-manager.mjs";
import {
  deleteProxy,
  importProxies,
  testProxy,
  upsertProxy
} from "../proxy-manager.mjs";

export function handleDesktopApiPost(pathname, body, { desktopRuntimeHandlers = {} } = {}) {
  const actor = { userId: body.actorUserId || body.managerUserId || "user_owner" };
  if (pathname === "/api/desktop/accounts/incognito") {
    if (typeof desktopRuntimeHandlers.openIncognitoAccountWindow !== "function") {
      throw new Error("请从 /Applications/AI Creator OS.app 打开临时窗。浏览器里的普通开发后端不能拉起本地工作窗。");
    }
    return desktopRuntimeHandlers.openIncognitoAccountWindow(body);
  }
  if (pathname === "/api/desktop/accounts/persistent-window") {
    if (typeof desktopRuntimeHandlers.openPersistentAccountWindow !== "function") {
      throw new Error("请从 /Applications/AI Creator OS.app 打开固定账号窗口。浏览器里的普通开发后端不能拉起本地工作窗。");
    }
    return desktopRuntimeHandlers.openPersistentAccountWindow(body);
  }
  if (pathname === "/api/desktop/setup/complete") return completeDesktopSetup(body, actor);
  if (pathname === "/api/desktop/x-oauth/config") return saveDesktopXOAuthConfig(body, actor);
  if (pathname === "/api/desktop/x-oauth/clear") return clearDesktopXOAuthConfig(actor);
  if (pathname === "/api/desktop/ads-browser/config") return saveDesktopAdsBrowserConfig(body, actor);
  if (pathname === "/api/desktop/ads-browser/clear") return clearDesktopAdsBrowserConfig(actor);
  if (pathname === "/api/desktop/ads-browser/test") return testDesktopAdsBrowserConfig();
  if (pathname === "/api/desktop/ads-browser/open") return openDesktopAdsBrowserProfile(body);
  if (pathname === "/api/desktop/demo/reset") return resetDesktopDemoData({ markSetupComplete: true, actor });
  if (pathname === "/api/desktop/accounts/import") return importDesktopAccounts(body, actor);
  if (pathname === "/api/desktop/accounts/ensure-slots") return ensureDesktopAccountSlots(body, actor);
  if (pathname === "/api/desktop/accounts/network-notes/import") return importDesktopNetworkNotes(body, actor);
  if (pathname === "/api/desktop/accounts/upsert") return upsertDesktopAccount(body, actor);
  if (pathname === "/api/desktop/accounts/update") return updateDesktopAccountConfig(body, actor);
  if (pathname === "/api/desktop/accounts/delete") return archiveDesktopAccount(body, actor);
  if (pathname === "/api/desktop/tasks/create") return createDesktopTask(body, actor);
  if (pathname === "/api/desktop/tasks/posted") return markDesktopTaskPosted(body, actor);
  if (pathname === "/api/desktop/tasks/publish-x") return publishDesktopTaskToX(body, actor);
  if (pathname === "/api/desktop/feedback") return saveDesktopFeedback(body, actor);
  if (pathname === "/api/desktop/targets/import") return addDesktopRelationshipTargets(body, actor);
  if (pathname === "/api/desktop/targets/status") return updateDesktopRelationshipTargetStatus(body, actor);
  if (pathname === "/api/desktop/backup/export") return exportDesktopBackupPackage(body);
  if (pathname === "/api/desktop/backup/import") return importDesktopBackup(body, actor);
  if (pathname === "/api/desktop/proxies/import") return importProxies(body, actor);
  if (pathname === "/api/desktop/proxies/upsert") return upsertProxy(body, actor);
  if (pathname === "/api/desktop/proxies/delete") return deleteProxy(body.proxyId, actor);
  if (pathname === "/api/desktop/proxies/test") return testProxy(body.proxyId, body);
  if (pathname === "/api/desktop/fingerprints/upsert") return upsertFingerprint(body, actor);
  if (pathname === "/api/desktop/fingerprints/delete") return deleteFingerprint(body.fingerprintId, actor);
  throw new Error(`Unknown Desktop API route: ${pathname}`);
}
