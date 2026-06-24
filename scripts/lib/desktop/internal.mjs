import { writeJsonAtomic } from "../file-store.mjs";
import { DESKTOP_STATE_PATH } from "./constants.mjs";

export function parseHandles(value) {
  return String(value || "")
    .split(/\r?\n|,|，/)
    .map((item) => normalizeHandle(item))
    .filter((item) => item && item !== "@");
}

export function normalizeHandle(value) {
  const clean = String(value || "").trim().replace(/^https?:\/\/(?:x|twitter)\.com\//i, "").replace(/[/?#].*$/, "").replace(/^@/, "");
  if (!clean) return "";
  return `@${clean.replace(/[^A-Za-z0-9_]/g, "").slice(0, 30)}`;
}

export function normalizeLanes(value) {
  const lanes = Array.isArray(value) ? value : String(value || "").split(/[,，\s]+/);
  const cleaned = lanes.map((lane) => String(lane || "").trim()).filter(Boolean);
  return cleaned.length ? cleaned : ["ai_startups", "indie_builders", "saas_founders", "crypto_builders"];
}

export async function writeDesktopState(input = {}) {
  const now = new Date().toISOString();
  await writeJsonAtomic(DESKTOP_STATE_PATH, {
    version: 1,
    setupCompleted: true,
    mode: input.mode || "demo",
    workspaceId: input.workspaceId || "workspace_default",
    workspaceName: input.workspaceName || "",
    updatedAt: now
  });
}

export function upsertCollection(collection, item, idField) {
  return {
    ...collection,
    updatedAt: new Date().toISOString(),
    items: upsertItem(collection.items || [], item, idField)
  };
}

export function upsertItem(items = [], item, idField) {
  const index = items.findIndex((current) => current[idField] === item[idField]);
  if (index >= 0) {
    const existing = items[index];
    return items.map((current, currentIndex) => currentIndex === index
      ? { ...existing, ...item, createdAt: existing.createdAt || item.createdAt }
      : current);
  }
  return [...items, item];
}

export function existingById(items = [], idField, id) {
  return items.find((item) => item[idField] === id) || null;
}

export function appendNote(existing, note) {
  return [existing, note].filter(Boolean).join("\n").trim();
}

export function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}
