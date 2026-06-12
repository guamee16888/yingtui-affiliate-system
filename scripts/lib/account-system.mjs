import { createToolId } from "./ids.mjs";

const ACTION_BONUS = 4;
const KEYWORD_BONUS = 2;
const CATEGORY_BONUS = 3;

export const DEFAULT_ACCOUNT_CONFIG = {
  version: 1,
  rotationPolicy: {
    mode: "manual_confirm",
    maxAccounts: 20,
    sameToolCooldownDays: 7,
    sameCopyCooldownDays: 30,
    defaultDailyPostLimit: 10
  },
  accounts: []
};

export function normalizeAccountConfig(config = DEFAULT_ACCOUNT_CONFIG) {
  const accounts = (config.accounts ?? [])
    .filter((account) => account && account.id && account.displayName)
    .slice(0, Number(config.rotationPolicy?.maxAccounts ?? 10))
    .map((account) => ({
      id: account.id,
      displayName: account.displayName,
      handle: account.handle || "",
      category: account.category || "general",
      description: account.description || "",
      contentPillars: Array.isArray(account.contentPillars) ? account.contentPillars : [],
      keywords: Array.isArray(account.keywords) ? account.keywords : [],
      preferredActions: Array.isArray(account.preferredActions) ? account.preferredActions : [],
      dailyPostLimit: Number(account.dailyPostLimit || config.rotationPolicy?.defaultDailyPostLimit || 2),
      cooldownHours: Number(account.cooldownHours || 8),
      active: account.active !== false,
      authStatus: "planned"
    }));

  return {
    ...DEFAULT_ACCOUNT_CONFIG,
    ...config,
    rotationPolicy: {
      ...DEFAULT_ACCOUNT_CONFIG.rotationPolicy,
      ...(config.rotationPolicy ?? {})
    },
    accounts
  };
}

export function buildAccountStrategy({ date, picked = [], accountConfig = DEFAULT_ACCOUNT_CONFIG }) {
  const config = normalizeAccountConfig(accountConfig);
  const activeAccounts = config.accounts.filter((account) => account.active);
  const plannedLoad = new Map(activeAccounts.map((account) => [account.id, { plannedToolsToday: 0 }]));
  const toolRecommendations = picked.map((item) => recommendAccountWithLoad(item, config, plannedLoad));
  const accountLoad = buildAccountLoad(activeAccounts, toolRecommendations);

  return {
    date,
    mode: config.rotationPolicy.mode,
    maxAccounts: config.rotationPolicy.maxAccounts,
    sameToolCooldownDays: config.rotationPolicy.sameToolCooldownDays,
    sameCopyCooldownDays: config.rotationPolicy.sameCopyCooldownDays,
    authReady: false,
    summary: {
      totalAccounts: config.accounts.length,
      activeAccounts: activeAccounts.length,
      routedTools: toolRecommendations.filter((item) => item.primary).length
    },
    accounts: activeAccounts.map((account) => ({
      ...account,
      plannedToolsToday: accountLoad.get(account.id)?.plannedToolsToday ?? 0,
      remainingSlotsToday: Math.max(0, account.dailyPostLimit - (accountLoad.get(account.id)?.plannedToolsToday ?? 0))
    })),
    toolRecommendations,
    rotationNotes: [
      "Planning only: no OAuth token is stored in account config.",
      "Use the recommended account as a publishing hint, not an automatic posting rule.",
      `Avoid posting the same tool across accounts for ${config.rotationPolicy.sameToolCooldownDays} days.`,
      `Avoid reusing the same copy across accounts for ${config.rotationPolicy.sameCopyCooldownDays} days.`
    ]
  };
}

export function recommendAccountForItem(item, accountConfig = DEFAULT_ACCOUNT_CONFIG) {
  const config = normalizeAccountConfig(accountConfig);
  const activeAccounts = config.accounts.filter((account) => account.active);
  if (!activeAccounts.length) return { toolId: toolId(item), primary: null, alternatives: [], reason: "No active account profiles configured." };

  const scored = rankAccountsForItem(item, activeAccounts);
  const primary = scored[0];
  const alternatives = scored.slice(1, 3).map(toAccountSummary);

  return {
    toolId: toolId(item),
    toolName: item.tool?.name ?? item.name ?? "",
    primary: primary ? toAccountSummary(primary) : null,
    alternatives,
    reason: primary ? accountReason(primary) : "No matching account profile."
  };
}

export function findAccountById(accountConfig = DEFAULT_ACCOUNT_CONFIG, accountId = "") {
  const config = normalizeAccountConfig(accountConfig);
  return config.accounts.find((account) => account.id === accountId) ?? null;
}

export function recommendedAccountIdForTool(tool = null) {
  return tool?.accountRecommendation?.primary?.accountId ?? "";
}

function recommendAccountWithLoad(item, accountConfig, accountLoad) {
  const config = normalizeAccountConfig(accountConfig);
  const activeAccounts = config.accounts.filter((account) => account.active);
  if (!activeAccounts.length) return { toolId: toolId(item), primary: null, alternatives: [], reason: "No active account profiles configured." };

  const scored = rankAccountsForItem(item, activeAccounts);
  const primary = scored.find((match) => {
    const planned = accountLoad.get(match.account.id)?.plannedToolsToday ?? 0;
    return planned < match.account.dailyPostLimit;
  }) ?? scored[0];
  if (primary) {
    const load = accountLoad.get(primary.account.id);
    if (load) load.plannedToolsToday += 1;
  }
  const alternatives = scored
    .filter((match) => match.account.id !== primary?.account.id)
    .slice(0, 2)
    .map(toAccountSummary);

  return {
    toolId: toolId(item),
    toolName: item.tool?.name ?? item.name ?? "",
    primary: primary ? toAccountSummary(primary) : null,
    alternatives,
    reason: primary ? accountReason(primary) : "No matching account profile."
  };
}

function rankAccountsForItem(item, accounts) {
  return accounts
    .map((account) => scoreAccountMatch(item, account))
    .sort((a, b) => b.score - a.score || a.account.displayName.localeCompare(b.account.displayName));
}

function scoreAccountMatch(item, account) {
  const haystack = normalize([
    item.tool?.name,
    item.tool?.tagline,
    item.tool?.description,
    item.tool?.circle,
    item.tool?.candidateType,
    item.tool?.sourceName,
    item.angle?.audience,
    item.angle?.outcome,
    item.angle?.pain,
    item.followUpAction
  ].filter(Boolean).join(" "));
  const keywordMatches = account.keywords.filter((keyword) => termMatches(haystack, keyword));
  const pillarMatches = account.contentPillars.filter((pillar) => termMatches(haystack, pillar));
  const actionMatch = account.preferredActions.includes(item.followUpAction);
  const categoryMatch = termMatches(haystack, account.category);
  const score = keywordMatches.length * KEYWORD_BONUS
    + pillarMatches.length * KEYWORD_BONUS
    + (actionMatch ? ACTION_BONUS : 0)
    + (categoryMatch ? CATEGORY_BONUS : 0)
    + Number(item.scoreBreakdown?.contentScore ?? 0) / 2
    + Number(item.scoreBreakdown?.affiliateScore ?? 0) / 3;

  return {
    account,
    score: round(score),
    keywordMatches,
    pillarMatches,
    actionMatch,
    categoryMatch
  };
}

function toAccountSummary(match) {
  return {
    accountId: match.account.id,
    displayName: match.account.displayName,
    handle: match.account.handle,
    category: match.account.category,
    score: match.score,
    dailyPostLimit: match.account.dailyPostLimit,
    cooldownHours: match.account.cooldownHours,
    matchedKeywords: match.keywordMatches.slice(0, 5),
    matchedPillars: match.pillarMatches.slice(0, 3)
  };
}

function accountReason(match) {
  const pieces = [];
  if (match.actionMatch) pieces.push(`matches ${match.account.preferredActions.join(" / ")}`);
  if (match.keywordMatches.length) pieces.push(`keywords: ${match.keywordMatches.slice(0, 4).join(", ")}`);
  if (match.pillarMatches.length) pieces.push(`pillar: ${match.pillarMatches[0]}`);
  if (!pieces.length) pieces.push("best available profile by content score");
  return `${match.account.displayName}: ${pieces.join("; ")}.`;
}

function buildAccountLoad(accounts, recommendations) {
  const byAccount = new Map(accounts.map((account) => [account.id, { plannedToolsToday: 0 }]));
  for (const recommendation of recommendations) {
    const accountId = recommendation.primary?.accountId;
    if (!accountId || !byAccount.has(accountId)) continue;
    byAccount.get(accountId).plannedToolsToday += 1;
  }
  return byAccount;
}

function toolId(item) {
  return item.toolId || createToolId(item.tool?.name ?? item.name ?? "", item.tool?.url ?? item.url ?? "");
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function termMatches(haystack, term) {
  const normalizedTerm = normalize(term).trim();
  if (!normalizedTerm) return false;
  if (/^[a-z0-9+#.-]{1,4}$/.test(normalizedTerm)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}([^a-z0-9]|$)`, "i").test(haystack);
  }
  return haystack.includes(normalizedTerm);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function round(value) {
  return Math.round(value * 10) / 10;
}
