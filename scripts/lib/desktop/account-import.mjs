import { createAccountId, createStableId } from "../ids.mjs";
import { parseCsv } from "../csv-feedback.mjs";
import {
  DESKTOP_ALLOWED_IMPORT_FIELDS,
  DESKTOP_FORBIDDEN_IMPORT_FIELDS,
  DESKTOP_NETWORK_NOTE_FIELDS
} from "./constants.mjs";
import { normalizeHandle, parseHandles } from "./internal.mjs";

export function parseDesktopAccountImport(input = {}) {
  const rows = [];
  const ignored = new Set();
  if (Array.isArray(input.rows)) {
    for (const row of input.rows) rows.push(normalizeImportRow(row, ignored));
  }
  for (const handle of parseHandles(input.text || input.handles || "")) {
    rows.push({ handle });
  }
  if (input.csv) {
    const parsed = parseCsv(input.csv);
    if (parsed.length) {
      const headers = parsed[0].map(normalizeFieldName);
      for (const header of headers) {
        if (DESKTOP_FORBIDDEN_IMPORT_FIELDS.has(header)) ignored.add(header);
      }
      for (const row of parsed.slice(1)) {
        const item = {};
        headers.forEach((header, index) => {
          const value = row[index] || "";
          if (!value) return;
          if (DESKTOP_FORBIDDEN_IMPORT_FIELDS.has(header)) return;
          if (!DESKTOP_ALLOWED_IMPORT_FIELDS.has(header)) return;
          item[fieldAlias(header)] = value;
        });
        if (item.handle) rows.push(item);
      }
    }
  }
  const uniqueRows = [];
  const seen = new Set();
  for (const row of rows.map((item) => normalizeImportRow(item, ignored)).filter((item) => item.handle)) {
    const key = normalizeHandle(row.handle).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRows.push(row);
  }
  return { rows: uniqueRows, ignoredFields: [...ignored] };
}

export function parseDesktopNetworkNotesImport(input = {}) {
  const rows = [];
  const ignored = new Set();
  if (Array.isArray(input.rows)) {
    for (const row of input.rows) rows.push(normalizeNetworkNoteRow(row, ignored));
  }
  const pasted = String(input.csv || input.text || "").trim();
  if (pasted) {
    const parsed = parseFlexibleNetworkTable(pasted);
    if (parsed.length) {
      const headers = parsed[0].map((header) => normalizeNetworkNoteFieldName(header, ignored));
      const hasHeader = headers.filter(Boolean).length >= 2;
      const dataRows = hasHeader ? parsed.slice(1) : parsed;
      const fallbackFields = ["handle", "networkLabel", "ipNote", "deviceNote", "countryRegionNote", "notes"];
      for (const row of dataRows) {
        const item = {};
        const fields = hasHeader ? headers : fallbackFields;
        fields.forEach((field, index) => {
          const value = String(row[index] || "").trim();
          if (!field || !value) return;
          item[field] = value;
        });
        rows.push(normalizeNetworkNoteRow(item, ignored));
      }
    }
  }
  const uniqueRows = [];
  const seen = new Set();
  for (const row of rows.filter((item) => hasNetworkNoteUpdate(item) && (item.accountId || item.handle || item.proxyAddress || item.ipNote))) {
    const key = row.accountId ? `id:${row.accountId}` : row.handle ? `handle:${normalizeHandle(row.handle).toLowerCase()}` : "";
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    uniqueRows.push(row);
  }
  return { rows: uniqueRows, ignoredFields: [...ignored] };
}

export function normalizeDesktopAccount(input = {}, now = new Date().toISOString()) {
  const handle = normalizeHandle(input.handle);
  const accountId = input.accountId || createAccountId(handle);
  const official = input.accountType === "official" && Boolean(input.oauthConnectionId);
  const country = String(input.country ?? input.region ?? "").trim();
  return {
    accountId,
    workspaceId: input.workspaceId || "workspace_default",
    handle,
    persona: input.persona || handle || accountId,
    laneId: normalizeDesktopLaneId(input.laneId || input.lane || "ai_startups"),
    country,
    countryManual: Boolean(input.countryManual || country),
    region: "",
    timezone: "",
    language: input.language || "en",
    status: input.status || "active",
    active: input.status === "archived" ? false : input.active !== false,
    publishMode: input.publishMode || "manual",
    accountType: official ? "official" : "demo",
    dailyPostLimit: Number(input.dailyPostLimit || 10),
    externalLinkLimit: Number(input.externalLinkLimit || 1),
    networkLabel: String(input.networkLabel || input.network || "").trim(),
    ipNote: String(input.ipNote || input.ip || "").trim(),
    deviceNote: String(input.deviceNote || input.device || "").trim(),
    countryRegionNote: String(input.countryRegionNote || "").trim(),
    sessionMode: normalizeSessionMode(input.sessionMode),
    notes: input.notes || "",
    connectionStatus: official ? (input.connectionStatus || "connected") : "not_connected",
    oauthConnectionId: official ? input.oauthConnectionId : "",
    // 代理和指纹绑定字段
    proxyId: String(input.proxyId || "").trim(),
    proxyUrl: String(input.proxyUrl || "").trim(),
    fingerprintId: String(input.fingerprintId || "").trim(),
    browserProvider: normalizeBrowserProvider(input.browserProvider || input.workEnvironment || "ads"),
    adsProfileId: String(input.adsProfileId || input.adsEnvironmentId || input.environmentId || "").trim(),
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

export function isDesktopAccountSlot(account = {}) {
  return account.status === "empty_slot" || (!account.handle && /^xacc_slot_/.test(String(account.accountId || "")));
}

export function findDesktopAccountForImport(items = [], workspaceId = "workspace_default", accountId = "", handle = "") {
  const normalizedHandle = normalizeHandle(handle).toLowerCase();
  return items.find((account) => {
    if (account.workspaceId !== workspaceId) return false;
    if (accountId && account.accountId === accountId) return true;
    return normalizedHandle && String(account.handle || "").toLowerCase() === normalizedHandle;
  });
}

export function nextDesktopSlotId(usedIds, preferredIndex) {
  let index = Math.max(Number(preferredIndex || 1), 1);
  while (index < 10000) {
    const id = `xacc_slot_${String(index).padStart(3, "0")}`;
    if (!usedIds.has(id)) return id;
    index += 1;
  }
  return `xacc_slot_${createStableId("slot", [Date.now(), Math.random()]).slice(-12)}`;
}

export function normalizeImportRow(row = {}, ignored = new Set()) {
  const item = {};
  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeFieldName(key);
    if (DESKTOP_FORBIDDEN_IMPORT_FIELDS.has(normalized)) {
      ignored.add(normalized);
      continue;
    }
    if (!DESKTOP_ALLOWED_IMPORT_FIELDS.has(normalized)) continue;
    item[fieldAlias(normalized)] = String(value || "").trim();
  }
  if (item.handle) item.handle = normalizeHandle(item.handle);
  return item;
}

export function normalizeNetworkNoteRow(row = {}, ignored = new Set()) {
  const item = {};
  for (const [key, value] of Object.entries(row)) {
    const field = normalizeNetworkNoteFieldName(key, ignored);
    if (!field) continue;
    item[field] = String(value || "").trim();
  }
  if (item.handle) item.handle = normalizeHandle(item.handle);
  return item;
}

export function normalizeNetworkNoteFieldName(value, ignored = new Set()) {
  const raw = String(value || "").trim();
  const normalized = normalizeFieldName(raw);
  const rawCompact = raw.toLowerCase().replace(/\s+/g, "");
  if (normalized === "proxyaddress" || normalized === "ipaddress" || rawCompact === "proxyaddress" || rawCompact === "ipaddress" || rawCompact === "代理地址" || rawCompact === "ip地址") return "proxyAddress";
  if (normalized === "proxyport" || normalized === "port" || rawCompact === "端口") return "proxyPort";
  if (normalized === "proxylastchecked" || normalized === "lastchecked" || rawCompact === "lastchecked" || rawCompact === "最后检查" || rawCompact === "检测时间") return "proxyLastChecked";
  if (normalized === "proxystatus" || normalized === "status" || rawCompact === "状态") return "proxyStatus";
  if (normalized === "proxycity" || normalized === "city" || rawCompact === "城市") return "proxyCity";
  if (normalized === "proxycountry" || normalized === "country" || rawCompact === "国家") return "proxyCountry";
  if (normalized === "username" || rawCompact === "用户名" || rawCompact === "账号名") {
    ignored.add("username");
    return "";
  }
  const forbidden = forbiddenImportFieldName(raw, normalized);
  if (forbidden) {
    ignored.add(forbidden);
    return "";
  }
  if (normalized === "accountid" || rawCompact === "账号id" || rawCompact === "账号编号") return "accountId";
  if (normalized === "handle" || rawCompact === "账号" || rawCompact === "x账号" || rawCompact === "推特账号") return "handle";
  if (["network", "networklabel", "networknote"].includes(normalized) || rawCompact === "网络" || rawCompact === "网络备注" || rawCompact === "网络ip") return "networkLabel";
  if (["ip", "ipnote"].includes(normalized) || rawCompact === "ip备注" || rawCompact === "ip归属" || rawCompact === "ip归属备注") return "ipNote";
  if (["device", "devicenote"].includes(normalized) || rawCompact === "设备" || rawCompact === "设备备注" || rawCompact === "手机") return "deviceNote";
  if (normalized === "countryregionnote" || rawCompact === "地区" || rawCompact === "国家地区" || rawCompact === "国家/地区" || rawCompact === "国家地区备注") return "countryRegionNote";
  if (normalized === "notes" || rawCompact === "备注") return "notes";
  return DESKTOP_NETWORK_NOTE_FIELDS.has(normalized) ? fieldAlias(normalized) : "";
}

export function forbiddenImportFieldName(raw, normalized) {
  if (DESKTOP_FORBIDDEN_IMPORT_FIELDS.has(normalized)) return normalized;
  const compact = String(raw || "").toLowerCase().replace(/\s+/g, "");
  if (/密码|口令/.test(compact)) return "password";
  if (/cookie/.test(compact)) return "cookie";
  if (/代理|proxy/.test(compact)) return "proxy";
  if (/指纹|fingerprint/.test(compact)) return "fingerprint";
  if (/token/.test(compact)) return "token";
  if (/secret|密钥/.test(compact)) return "secret";
  if (/timezone|时区/.test(compact)) return "timezone";
  return "";
}

export function networkNotePatch(row = {}) {
  const patch = {};
  for (const field of ["networkLabel", "ipNote", "deviceNote", "countryRegionNote", "notes"]) {
    if (String(row[field] || "").trim()) patch[field] = String(row[field]).trim();
  }
  const proxyAddress = String(row.proxyAddress || "").trim();
  const proxyPort = String(row.proxyPort || "").trim();
  if (proxyAddress && !patch.ipNote) patch.ipNote = proxyPort ? `${proxyAddress}:${proxyPort}` : proxyAddress;
  const location = [row.proxyCountry, row.proxyCity].map((item) => String(item || "").trim()).filter(Boolean).join(" / ");
  if (location && !patch.countryRegionNote) patch.countryRegionNote = location;
  const proxyNotes = [
    row.proxyStatus ? `状态: ${row.proxyStatus}` : "",
    row.proxyLastChecked ? `检查: ${row.proxyLastChecked}` : ""
  ].filter(Boolean).join("；");
  if (proxyNotes && !patch.notes) patch.notes = proxyNotes;
  return patch;
}

export function hasNetworkNoteUpdate(row = {}) {
  return ["networkLabel", "ipNote", "deviceNote", "countryRegionNote", "notes", "proxyAddress", "proxyPort", "proxyCountry", "proxyCity", "proxyStatus", "proxyLastChecked"]
    .some((field) => String(row[field] || "").trim());
}

export function parseFlexibleNetworkTable(pasted) {
  const text = String(pasted || "").trim();
  if (!text) return [];
  if (text.includes("\t")) {
    return text.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split("\t").map((cell) => cell.trim()));
  }
  return parseCsv(text);
}

export function normalizeFieldName(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function fieldAlias(field) {
  if (field === "accountid") return "accountId";
  if (["lane", "laneid", "contentlane"].includes(field)) return "laneId";
  if (field === "country") return "country";
  if (field === "region") return "country";
  if (field === "publishmode") return "publishMode";
  if (field === "dailypostlimit") return "dailyPostLimit";
  if (field === "externallinklimit") return "externalLinkLimit";
  if (["network", "networklabel", "networknote"].includes(field)) return "networkLabel";
  if (["ip", "ipnote"].includes(field)) return "ipNote";
  if (["device", "devicenote"].includes(field)) return "deviceNote";
  if (field === "countryregionnote") return "countryRegionNote";
  if (field === "sessionmode") return "sessionMode";
  if (["browserprovider", "workenvironment", "workenv"].includes(field)) return "browserProvider";
  if (["adsprofileid", "adspowerid", "adspowerprofileid", "adspowerenvironmentid", "adsenvironmentid", "environmentid"].includes(field)) return "adsProfileId";
  return field;
}

export function normalizeDesktopLaneId(value) {
  const lane = String(value || "").trim();
  const aliases = {
    ai: "ai_startups",
    ai_startup: "ai_startups",
    indie: "indie_builders",
    saas: "saas_founders",
    crypto: "crypto_builders",
    uncategorized: "none",
    unclassified: "none"
  };
  const normalized = aliases[lane] || lane;
  return ["ai_startups", "indie_builders", "saas_founders", "crypto_builders", "custom", "none"].includes(normalized)
    ? normalized
    : "none";
}

export function normalizeSessionMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return ["temp", "persistent", "manual", "fixed_note"].includes(mode) ? mode : "persistent";
}

export function normalizeBrowserProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (["default", "electron", "local"].includes(provider)) return "default";
  if (["ads", "adspower", "adsbrowser", "ads_browser", "fingerprint", "fingerprint_browser"].includes(provider)) return "ads";
  return "ads";
}
