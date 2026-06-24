import { createStableId } from "../ids.mjs";
import { CORE_COLLECTIONS, loadCollection, saveCollection } from "../core-data.mjs";
import { DESKTOP_ACCOUNT_TARGET } from "./constants.mjs";
import {
  findDesktopAccountForImport,
  isDesktopAccountSlot,
  networkNotePatch,
  nextDesktopSlotId,
  normalizeBrowserProvider,
  normalizeDesktopAccount,
  normalizeDesktopLaneId,
  parseDesktopAccountImport,
  parseDesktopNetworkNotesImport
} from "./account-import.mjs";
import { appendDesktopAudit } from "./logging.mjs";
import { normalizeHandle, toCsv, upsertItem } from "./internal.mjs";

export { parseDesktopAccountImport, parseDesktopNetworkNotesImport } from "./account-import.mjs";

export async function importDesktopAccounts(input = {}, actor = { userId: "user_owner" }) {
  const workspaceId = String(input.workspaceId || "workspace_default").trim();
  const parsed = parseDesktopAccountImport(input);
  const current = await loadCollection(CORE_COLLECTIONS.xAccounts);
  const assignments = await loadCollection(CORE_COLLECTIONS.assignments);
  const now = new Date().toISOString();
  const defaultLane = input.defaultLane || "ai_startups";
  const defaultLanguage = input.defaultLanguage || "en";
  const defaultCountry = String(input.defaultCountry || input.defaultRegion || "").trim();
  const defaultDailyPostLimit = Number(input.defaultDailyPostLimit || 10);
  const defaultExternalLinkLimit = Number(input.defaultExternalLinkLimit || 1);
  const imported = [];
  let items = [...current.items];
  let assignmentItems = [...assignments.items];
  const emptySlots = items
    .filter((account) => account.workspaceId === workspaceId && isDesktopAccountSlot(account))
    .sort((a, b) => String(a.accountId).localeCompare(String(b.accountId)));

  for (const row of parsed.rows) {
    const normalizedHandle = normalizeHandle(row.handle);
    const existing = findDesktopAccountForImport(items, workspaceId, row.accountId, normalizedHandle);
    const targetSlot = !existing && !row.accountId ? emptySlots.shift() : null;
    const account = normalizeDesktopAccount({
      ...(targetSlot || {}),
      ...row,
      accountId: row.accountId || targetSlot?.accountId,
      workspaceId,
      laneId: row.laneId || row.lane || defaultLane,
      language: row.language || defaultLanguage,
      country: row.country || row.region || defaultCountry,
      countryManual: Boolean(row.country || row.region || defaultCountry),
      timezone: "",
      dailyPostLimit: row.dailyPostLimit || defaultDailyPostLimit,
      externalLinkLimit: row.externalLinkLimit || defaultExternalLinkLimit,
      status: row.status || "active",
      accountType: "demo",
      connectionStatus: "not_connected"
    }, now);
    items = upsertItem(items, account, "accountId");
    assignmentItems = upsertItem(assignmentItems, {
      assignmentId: createStableId("assign", [workspaceId, "user_owner", account.accountId]),
      workspaceId,
      userId: "user_owner",
      accountId: account.accountId,
      role: "manager",
      active: true,
      createdAt: now,
      updatedAt: now
    }, "assignmentId");
    imported.push(account);
  }

  await Promise.all([
    saveCollection(CORE_COLLECTIONS.xAccounts, { ...current, items }),
    saveCollection(CORE_COLLECTIONS.assignments, { ...assignments, items: assignmentItems })
  ]);
  await appendDesktopAudit({
    type: "account.import",
    workspaceId,
    actorUserId: actor.userId,
    summary: `Imported ${imported.length} desktop account(s).`,
    metadata: { ignoredFields: parsed.ignoredFields }
  });
  return {
    imported,
    count: imported.length,
    ignoredFields: parsed.ignoredFields,
    warning: parsed.ignoredFields.length ? "已忽略密码、cookie、代理、指纹、token、secret、timezone 等字段。" : ""
  };
}

export async function upsertDesktopAccount(input = {}, actor = { userId: "user_owner" }) {
  const result = await importDesktopAccounts({
    workspaceId: input.workspaceId || "workspace_default",
    rows: [input]
  }, actor);
  return { account: result.imported[0], ignoredFields: result.ignoredFields, warning: result.warning };
}

export async function ensureDesktopAccountSlots(input = {}, actor = { userId: "user_owner" }) {
  const workspaceId = String(input.workspaceId || "workspace_default").trim();
  const target = Math.min(Math.max(Number(input.count || DESKTOP_ACCOUNT_TARGET), 1), 500);
  const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
  const assignments = await loadCollection(CORE_COLLECTIONS.assignments);
  const now = new Date().toISOString();
  const workspaceAccounts = accounts.items.filter((account) => account.workspaceId === workspaceId);
  const created = [];
  const usedIds = new Set(accounts.items.map((account) => account.accountId));
  let items = [...accounts.items];
  let assignmentItems = [...assignments.items];

  for (let index = workspaceAccounts.length + 1; index <= target; index += 1) {
    const slotId = nextDesktopSlotId(usedIds, index);
    usedIds.add(slotId);
    const slot = normalizeDesktopAccount({
      accountId: slotId,
      workspaceId,
      handle: "",
      persona: `账号槽位 ${String(index).padStart(3, "0")}`,
      laneId: "none",
      status: "empty_slot",
      language: "en",
      browserProvider: "ads",
      connectionStatus: "not_connected",
      notes: "待导入账号"
    }, now);
    items.push(slot);
    assignmentItems = upsertItem(assignmentItems, {
      assignmentId: createStableId("assign", [workspaceId, "user_owner", slot.accountId]),
      workspaceId,
      userId: "user_owner",
      accountId: slot.accountId,
      role: "manager",
      active: true,
      createdAt: now,
      updatedAt: now
    }, "assignmentId");
    created.push(slot);
  }

  if (created.length) {
    await Promise.all([
      saveCollection(CORE_COLLECTIONS.xAccounts, { ...accounts, items }),
      saveCollection(CORE_COLLECTIONS.assignments, { ...assignments, items: assignmentItems })
    ]);
  }
  await appendDesktopAudit({
    type: "account.slots.ensure",
    workspaceId,
    actorUserId: actor.userId,
    summary: `Ensured ${target} desktop account slot(s).`,
    metadata: { target, createdCount: created.length }
  });
  return {
    target,
    total: workspaceAccounts.length + created.length,
    createdCount: created.length,
    created
  };
}

export async function updateDesktopAccountConfig(input = {}, actor = { userId: "user_owner" }) {
  const accountId = String(input.accountId || "").trim();
  if (!accountId) throw new Error("accountId is required");
  const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
  const current = accounts.items.find((item) => item.accountId === accountId);
  if (!current) throw new Error(`Unknown account: ${accountId}`);
  const country = String(input.country ?? current.country ?? "").trim();
  const updated = normalizeDesktopAccount({
    ...current,
    laneId: normalizeDesktopLaneId(input.laneId ?? current.laneId),
    country,
    countryManual: Boolean(country),
    language: String(input.language ?? current.language ?? "en").trim() || "en",
    networkLabel: input.networkLabel ?? input.networkNote ?? current.networkLabel ?? "",
    ipNote: input.ipNote ?? current.ipNote ?? "",
    deviceNote: input.deviceNote ?? current.deviceNote ?? "",
    countryRegionNote: input.countryRegionNote ?? current.countryRegionNote ?? "",
    sessionMode: input.sessionMode ?? current.sessionMode ?? "persistent",
    proxyUrl: input.proxyUrl ?? current.proxyUrl ?? "",
    browserProvider: normalizeBrowserProvider(input.browserProvider ?? input.workEnvironment ?? current.browserProvider),
    adsProfileId: input.adsProfileId ?? current.adsProfileId ?? "",
    notes: input.notes ?? current.notes ?? ""
  });
  await saveCollection(CORE_COLLECTIONS.xAccounts, {
    ...accounts,
    items: accounts.items.map((item) => item.accountId === accountId ? updated : item)
  });
  await appendDesktopAudit({
    type: "account.config.update",
    workspaceId: updated.workspaceId || "workspace_default",
    actorUserId: actor.userId,
    targetId: accountId,
    summary: "Desktop account config updated.",
    metadata: {
      laneId: updated.laneId,
      countrySet: Boolean(updated.country),
      networkNoteSet: Boolean(updated.networkLabel || updated.ipNote || updated.deviceNote || updated.countryRegionNote)
    }
  });
  return { account: updated };
}

export async function importDesktopNetworkNotes(input = {}, actor = { userId: "user_owner" }) {
  const workspaceId = String(input.workspaceId || "workspace_default").trim();
  const parsed = parseDesktopNetworkNotesImport(input);
  const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
  const scopedAccounts = accounts.items.filter((account) => (account.workspaceId || "workspace_default") === workspaceId);
  const byAccountId = new Map(scopedAccounts.map((account) => [account.accountId, account]));
  const byHandle = new Map(scopedAccounts.map((account) => [normalizeHandle(account.handle).toLowerCase(), account]));
  const positionalAccounts = scopedAccounts.filter((account) => account.status !== "archived");
  const patches = new Map();
  const skipped = [];
  let positionalIndex = 0;

  for (const row of parsed.rows) {
    const account = row.accountId
      ? byAccountId.get(row.accountId)
      : row.handle
        ? byHandle.get(normalizeHandle(row.handle).toLowerCase())
        : positionalAccounts[positionalIndex++];
    if (!account) {
      skipped.push({ accountId: row.accountId || "", handle: row.handle || "", reason: row.handle || row.accountId ? "not_found" : "no_account_for_row" });
      continue;
    }
    const patch = networkNotePatch(row);
    if (!Object.keys(patch).length) {
      skipped.push({ accountId: account.accountId, handle: account.handle || "", reason: "empty_update" });
      continue;
    }
    patches.set(account.accountId, { ...(patches.get(account.accountId) || {}), ...patch });
  }

  const now = new Date().toISOString();
  const items = accounts.items.map((account) => {
    const patch = patches.get(account.accountId);
    return patch ? { ...account, ...patch, updatedAt: now } : account;
  });
  if (patches.size) await saveCollection(CORE_COLLECTIONS.xAccounts, { ...accounts, items });
  await appendDesktopAudit({
    type: "account.network_notes.import",
    workspaceId,
    actorUserId: actor.userId,
    summary: `Imported network/IP notes for ${patches.size} desktop account(s).`,
    metadata: {
      updated: patches.size,
      skipped: skipped.length,
      ignoredFields: parsed.ignoredFields
    }
  });
  return {
    updatedCount: patches.size,
    skippedCount: skipped.length,
    ignoredFields: parsed.ignoredFields,
    skipped,
    warning: parsed.ignoredFields.length ? "已忽略密码、cookie、代理、指纹、token、secret、timezone 等字段。" : ""
  };
}

export async function archiveDesktopAccount(input = {}, actor = { userId: "user_owner" }) {
  const accountId = String(input.accountId || "").trim();
  if (!accountId) throw new Error("accountId is required");
  const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
  const account = accounts.items.find((item) => item.accountId === accountId);
  if (!account) throw new Error(`Unknown account: ${accountId}`);
  const archived = { ...account, status: "archived", active: false, updatedAt: new Date().toISOString() };
  await saveCollection(CORE_COLLECTIONS.xAccounts, {
    ...accounts,
    items: accounts.items.map((item) => item.accountId === accountId ? archived : item)
  });
  await appendDesktopAudit({
    type: "account.archive",
    workspaceId: archived.workspaceId || "workspace_default",
    actorUserId: actor.userId,
    targetId: accountId,
    summary: "Account archived instead of deleted."
  });
  return { account: archived };
}

export async function exportDesktopAccountsCsv(workspaceId = "workspace_default") {
  const accounts = await loadCollection(CORE_COLLECTIONS.xAccounts);
  const rows = accounts.items
    .filter((account) => (account.workspaceId || "workspace_default") === workspaceId)
    .map((account) => [
      account.accountId || "",
      account.handle || "",
      account.laneId || account.contentLaneId || "",
      account.country || account.region || "",
      account.language || "",
      account.connectionStatus || "not_connected",
      account.status || "",
      account.publishMode || "",
      account.dailyPostLimit || "",
      account.externalLinkLimit || "",
      account.browserProvider || "ads",
      account.adsProfileId || "",
      account.networkLabel || "",
      account.ipNote || "",
      account.sessionMode || "persistent",
      account.notes || ""
    ]);
  return toCsv([["accountId", "handle", "lane", "country", "language", "loginStatus", "status", "publishMode", "dailyPostLimit", "externalLinkLimit", "workEnvironment", "adsProfileId", "networkLabel", "ipNote", "sessionMode", "notes"], ...rows]);
}
