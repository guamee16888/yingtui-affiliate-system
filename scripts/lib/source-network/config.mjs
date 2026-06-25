import path from "node:path";
import { readJson, rootDir, writeJsonAtomic } from "../file-store.mjs";
import {
  clampScore,
  normalizeEditableSource,
  normalizeTier
} from "./internal.mjs";

export const SOURCE_NETWORK_CONFIG_PATH = "config/source-network.json";

export const DEFAULT_SOURCE_NETWORK = {
  version: 1,
  updatedAt: "",
  target: {
    accounts: 100,
    inventoryPerAccount: 10,
    requiredInventory: 1000,
    theme: "AI x Crypto",
    minimumQualityScore: 70
  },
  lanes: [],
  sources: []
};

export async function loadSourceNetworkConfig() {
  const runtimeConfig = await readJson(SOURCE_NETWORK_CONFIG_PATH, null);
  const repoConfig = runtimeConfig
    ?? await readJson(path.join(rootDir, SOURCE_NETWORK_CONFIG_PATH), null)
    ?? sourceNetworkConfigFromRegistry(await readJson("data/source-registry.json", null))
    ?? DEFAULT_SOURCE_NETWORK;
  return normalizeSourceNetworkConfig(repoConfig);
}

export function normalizeSourceNetworkConfig(config = DEFAULT_SOURCE_NETWORK) {
  const target = { ...DEFAULT_SOURCE_NETWORK.target, ...(config.target ?? {}) };
  target.accounts = Number(target.accounts || 100);
  target.inventoryPerAccount = Number(target.inventoryPerAccount || 10);
  target.requiredInventory = Number(target.requiredInventory || target.accounts * target.inventoryPerAccount);
  target.minimumQualityScore = Number(target.minimumQualityScore || 70);

  const lanes = (Array.isArray(config.lanes) ? config.lanes : [])
    .map((lane) => ({
      laneId: String(lane.laneId || "").trim(),
      name: String(lane.name || lane.laneId || "").trim(),
      accountTarget: Number(lane.accountTarget || 0),
      keywords: Array.isArray(lane.keywords) ? lane.keywords : [],
      adFit: Array.isArray(lane.adFit) ? lane.adFit : []
    }))
    .filter((lane) => lane.laneId);

  const laneIds = new Set(lanes.map((lane) => lane.laneId));
  const sources = (Array.isArray(config.sources) ? config.sources : [])
    .map((source) => ({
      sourceId: String(source.sourceId || source.id || "").trim(),
      name: String(source.name || source.sourceId || source.id || "").trim(),
      tier: normalizeTier(source.tier),
      type: String(source.type || "public").trim(),
      laneIds: (Array.isArray(source.laneIds) ? source.laneIds : [source.lane || source.circle])
        .map((laneId) => String(laneId || "").trim())
        .filter((laneId) => laneIds.has(laneId)),
      status: String(source.status || "planned").trim(),
      qualityScore: clampScore(source.qualityScore),
      freshnessScore: clampScore(source.freshnessScore),
      reviewPolicy: String(source.reviewPolicy || (source.tier === "L2" ? "manual_review_only" : "direct_candidate")).trim(),
      requiresApiKey: Boolean(source.requiresApiKey),
      url: String(source.url || "").trim(),
      notes: String(source.notes || "").trim()
    }))
    .filter((source) => source.sourceId);

  return {
    ...DEFAULT_SOURCE_NETWORK,
    ...config,
    target,
    lanes,
    sources
  };
}

export async function saveSourceNetworkConfig(config = DEFAULT_SOURCE_NETWORK) {
  const normalized = normalizeSourceNetworkConfig({
    ...config,
    updatedAt: new Date().toISOString()
  });
  await writeJsonAtomic(SOURCE_NETWORK_CONFIG_PATH, normalized);
  return normalized;
}

export function buildSourceNetworkConfigWithSource(config = DEFAULT_SOURCE_NETWORK, input = {}) {
  const normalized = normalizeSourceNetworkConfig(config);
  const source = normalizeEditableSource(input, normalized);
  const sources = normalized.sources.filter((item) => item.sourceId !== source.sourceId);
  return normalizeSourceNetworkConfig({
    ...normalized,
    updatedAt: new Date().toISOString(),
    sources: [...sources, source]
  });
}

function sourceNetworkConfigFromRegistry(registry) {
  if (!registry?.sources?.length) return null;
  return {
    version: 1,
    updatedAt: registry.generatedAt || "",
    target: DEFAULT_SOURCE_NETWORK.target,
    lanes: Array.isArray(registry.lanes) ? registry.lanes : [],
    sources: registry.sources
  };
}
