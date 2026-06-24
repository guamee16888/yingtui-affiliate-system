import { fetchCurrentPublicIp } from "../network-lock.mjs";
import { getAppStorageMode } from "../app-storage-mode.mjs";
import { loadDesktopAdsBrowserStatus } from "../ads-browser.mjs";
import {
  exportDesktopAccountsCsv,
  loadDesktopRelationshipTargets,
  loadDesktopSetupStatus,
  loadDesktopXOAuthStatus,
  startDesktopXOAuth
} from "../storage/interface.mjs";
import {
  exportFingerprintsCsv,
  generateRandomFingerprint,
  getFingerprintById,
  loadFingerprints
} from "../fingerprint-manager.mjs";
import {
  exportProxiesCsv,
  getProxyById,
  loadProxies
} from "../proxy-manager.mjs";

export async function handleDesktopApiGet(url) {
  const pathname = url.pathname;
  if (pathname === "/api/desktop/health") return direct(desktopHealth(url));
  if (pathname === "/api/desktop/fingerprints/generate") return direct(generateRandomFingerprint());
  if (pathname === "/api/desktop/network/current-ip") return wrapped(await fetchCurrentPublicIp());
  if (pathname === "/api/desktop/setup") return wrapped(await loadDesktopSetupStatus());
  if (pathname === "/api/desktop/x-oauth/status") return wrapped(await loadDesktopXOAuthStatus());
  if (pathname === "/api/desktop/ads-browser/status") return wrapped(await loadDesktopAdsBrowserStatus());
  if (pathname === "/api/oauth/x/start") return wrapped(await startDesktopXOAuth());
  if (pathname === "/api/desktop/accounts/export") {
    return wrapped({ csv: await exportDesktopAccountsCsv(workspaceId(url)) });
  }
  if (pathname === "/api/desktop/proxies") {
    return wrapped(await loadProxies({ workspaceId: workspaceId(url) }));
  }
  if (pathname === "/api/desktop/proxies/export") {
    return wrapped({ csv: await exportProxiesCsv(workspaceId(url)) });
  }
  if (pathname.startsWith("/api/desktop/proxies/")) {
    const proxyId = decodeURIComponent(pathname.slice("/api/desktop/proxies/".length));
    return wrapped(await getProxyById(proxyId));
  }
  if (pathname === "/api/desktop/fingerprints") {
    return wrapped(await loadFingerprints({ workspaceId: workspaceId(url) }));
  }
  if (pathname === "/api/desktop/fingerprints/export") {
    return wrapped({ csv: await exportFingerprintsCsv(workspaceId(url)) });
  }
  if (pathname.startsWith("/api/desktop/fingerprints/")) {
    const fingerprintId = decodeURIComponent(pathname.slice("/api/desktop/fingerprints/".length));
    return wrapped(await getFingerprintById(fingerprintId));
  }
  if (pathname.startsWith("/api/desktop/accounts/") && pathname.endsWith("/targets")) {
    const accountId = decodeURIComponent(pathname.split("/")[4] || "");
    return wrapped(await loadDesktopRelationshipTargets({
      workspaceId: workspaceId(url),
      accountId
    }));
  }
  return null;
}

function direct(data) {
  return { handled: true, status: 200, data, wrap: false };
}

function wrapped(data) {
  return { handled: true, status: 200, data, wrap: true };
}

function workspaceId(url) {
  return url.searchParams.get("workspaceId") || "workspace_default";
}

function desktopHealth(url) {
  const port = Number(process.env.AI_CREATOR_OS_DESKTOP_PORT || url.port || 0);
  return {
    ok: true,
    mode: process.env.AI_CREATOR_OS_DESKTOP === "1" ? "desktop" : "web",
    port,
    storageMode: getAppStorageMode(),
    desktopDataDir: process.env.AI_CREATOR_OS_DATA_DIR || "",
    timestamp: new Date().toISOString()
  };
}
