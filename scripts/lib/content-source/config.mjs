import { readJson, writeJsonAtomic } from "../file-store.mjs";

export const CONTENT_SOURCES_PATH = "config/content-sources.json";
export const SOURCE_CANDIDATES_PATH = "data/source-candidates.json";

export const DEFAULT_CONTENT_SOURCE_CONFIG = {
  version: 1,
  dailyTargets: {
    accounts: 20,
    postsPerAccount: 10,
    minimumQualityScore: 18
  },
  circles: [
    { id: "ai_startups", name: "AI startup circle", keywords: ["AI", "agent", "workflow", "automation"] },
    { id: "indie_hackers", name: "Indie hacker circle", keywords: ["indie", "builder", "launch", "micro SaaS"] },
    { id: "saas_founders", name: "SaaS founder circle", keywords: ["SaaS", "B2B", "pricing", "growth"] },
    { id: "crypto_builders", name: "Crypto builder circle", keywords: ["crypto", "web3", "wallet", "onchain"] }
  ],
  sources: []
};

export const DEFAULT_SOURCE_CANDIDATES = {
  version: 1,
  updatedAt: "",
  items: []
};

export function normalizeContentSourceConfig(config = DEFAULT_CONTENT_SOURCE_CONFIG) {
  const circles = Array.isArray(config.circles) ? config.circles : DEFAULT_CONTENT_SOURCE_CONFIG.circles;
  const sources = Array.isArray(config.sources) ? config.sources : [];

  return {
    ...DEFAULT_CONTENT_SOURCE_CONFIG,
    ...config,
    dailyTargets: {
      ...DEFAULT_CONTENT_SOURCE_CONFIG.dailyTargets,
      ...(config.dailyTargets ?? {})
    },
    circles: circles.map((circle) => ({
      id: String(circle.id || "").trim(),
      name: String(circle.name || circle.id || "").trim(),
      keywords: Array.isArray(circle.keywords) ? circle.keywords : []
    })).filter((circle) => circle.id),
    sources: sources.map(normalizeSource).filter((source) => source.id && source.url)
  };
}

export async function loadContentSourceConfig(warnings = []) {
  try {
    return normalizeContentSourceConfig(await readJson(CONTENT_SOURCES_PATH, DEFAULT_CONTENT_SOURCE_CONFIG));
  } catch (error) {
    warnings.push(`Content source config failed: ${error.message}. Using built-in defaults.`);
    return normalizeContentSourceConfig(DEFAULT_CONTENT_SOURCE_CONFIG);
  }
}

export async function loadSourceCandidates() {
  return readJson(SOURCE_CANDIDATES_PATH, DEFAULT_SOURCE_CANDIDATES);
}

export async function saveSourceCandidates(data) {
  await writeJsonAtomic(SOURCE_CANDIDATES_PATH, {
    ...DEFAULT_SOURCE_CANDIDATES,
    ...data,
    updatedAt: new Date().toISOString(),
    items: Array.isArray(data.items) ? data.items : []
  });
}

function normalizeSource(source) {
  return {
    id: String(source.id || "").trim(),
    name: String(source.name || source.id || "").trim(),
    circle: String(source.circle || "").trim(),
    url: String(source.url || "").trim(),
    type: String(source.type || "rss").trim(),
    candidateType: String(source.candidateType || "topic").trim(),
    enabled: source.enabled === true,
    maxItems: Number(source.maxItems || 20),
    qualityHint: String(source.qualityHint || "").trim(),
    includeKeywords: Array.isArray(source.includeKeywords) ? source.includeKeywords : [],
    excludeKeywords: Array.isArray(source.excludeKeywords) ? source.excludeKeywords : []
  };
}
