import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDesktopAppDataDir } from "../../../desktop/app-config.mjs";
import { emptyCollection } from "../core-data.mjs";
import { readJson, writeJsonAtomic } from "../file-store.mjs";
import { createStableId } from "../ids.mjs";
import { DESKTOP_AUDIT_PATH } from "./constants.mjs";

export async function appendDesktopLog(event = {}) {
  const appDataDir = process.env.AI_CREATOR_OS_DATA_DIR || getDesktopAppDataDir();
  const logsDir = path.join(appDataDir, "logs");
  await mkdir(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `${new Date().toISOString().slice(0, 10)}.log`);
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    type: event.type || "desktop.event",
    summary: sanitizeLogText(event.summary || ""),
    metadata: sanitizeLogObject(event.metadata || {})
  });
  await writeFile(logPath, `${line}\n`, { flag: "a" });
  return { path: logPath };
}

export async function appendDesktopAudit(event = {}) {
  const current = await readJson(DESKTOP_AUDIT_PATH, emptyCollection());
  const now = new Date().toISOString();
  const item = {
    auditId: event.auditId || createStableId("audit", [event.type || "event", event.workspaceId || "", event.targetId || "", now]),
    createdAt: event.createdAt || now,
    ...event
  };
  await writeJsonAtomic(DESKTOP_AUDIT_PATH, {
    ...current,
    updatedAt: now,
    items: [...(current.items || []), item]
  });
  await appendDesktopLog({ type: item.type, summary: item.summary, metadata: item.metadata });
  return item;
}

function sanitizeLogText(value) {
  return String(value || "").replace(/(token|secret|password|cookie|api[_-]?key)[^,\s]*/gi, "[redacted]");
}

function sanitizeLogObject(value) {
  const result = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (/(token|secret|password|cookie|api[_-]?key)/i.test(key)) continue;
    result[key] = typeof item === "string" ? sanitizeLogText(item) : item;
  }
  return result;
}
