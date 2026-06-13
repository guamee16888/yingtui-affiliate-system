import { emptyCollection, normalizeCollection, withUpdatedAt } from "./core-data.mjs";
import { readJson, writeJsonAtomic } from "./file-store.mjs";

export const PUBLISH_FILES = {
  settings: "data/publish-settings.json",
  xConnections: "data/x-connections.json",
  publishJobs: "data/publish-jobs.json",
  publishAttempts: "data/publish-attempts.json"
};

export const DEFAULT_PUBLISH_SETTINGS = {
  version: 1,
  updatedAt: "",
  settings: {
    globalAutoPublishEnabled: false,
    dryRunByDefault: true,
    requireApprovalBeforePublish: true,
    maxPostsPerAccountPerDay: 1,
    maxExternalLinksPerAccountPerDay: 1,
    maxSameToolPerDayGlobal: 3,
    maxSameDomainPerDayGlobal: 5,
    maxAffiliateLinksPerDayGlobal: 3,
    allowedPublishModes: ["manual", "scheduled"],
    defaultPublishMode: "manual"
  }
};

export async function loadPublishSettings() {
  const current = await readJson(PUBLISH_FILES.settings, DEFAULT_PUBLISH_SETTINGS);
  return normalizePublishSettings(current);
}

export async function savePublishSettings(settings) {
  await writeJsonAtomic(PUBLISH_FILES.settings, {
    ...normalizePublishSettings(settings),
    updatedAt: new Date().toISOString()
  });
}

export async function loadPublishCollection(filePath) {
  return normalizeCollection(await readJson(filePath, emptyCollection()));
}

export async function savePublishCollection(filePath, collection) {
  await writeJsonAtomic(filePath, withUpdatedAt(normalizeCollection(collection)));
}

export async function ensurePublishFiles() {
  await savePublishSettings(await loadPublishSettings());
  for (const filePath of [PUBLISH_FILES.xConnections, PUBLISH_FILES.publishJobs, PUBLISH_FILES.publishAttempts]) {
    await savePublishCollection(filePath, await loadPublishCollection(filePath));
  }
}

export function normalizePublishSettings(data) {
  return {
    ...DEFAULT_PUBLISH_SETTINGS,
    ...data,
    settings: {
      ...DEFAULT_PUBLISH_SETTINGS.settings,
      ...(data?.settings ?? {})
    }
  };
}

export function publicConnection(connection) {
  return {
    connectionId: connection.connectionId || "",
    accountId: connection.accountId || "",
    workspaceId: connection.workspaceId || "",
    handle: connection.handle || "",
    xUserId: connection.xUserId || "",
    status: connection.status || "not_connected",
    scopes: connection.scopes ?? [],
    tokenRef: connection.tokenRef ? "server_side_only" : "",
    lastVerifiedAt: connection.lastVerifiedAt || "",
    error: connection.error || "",
    createdAt: connection.createdAt || "",
    updatedAt: connection.updatedAt || ""
  };
}
