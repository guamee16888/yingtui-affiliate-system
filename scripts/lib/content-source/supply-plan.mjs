import { DEFAULT_CONTENT_SOURCE_CONFIG, normalizeContentSourceConfig } from "./config.mjs";
import { accountMatchesItem, itemMatchesCircle, uniqueByTool } from "./helpers.mjs";

export function buildSupplyPlan({ date, scored = [], accountStrategy = null, contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG }) {
  const config = normalizeContentSourceConfig(contentSourceConfig);
  const targetAccounts = Number(config.dailyTargets.accounts || accountStrategy?.summary?.activeAccounts || 0);
  const targetPerAccount = Number(config.dailyTargets.postsPerAccount || 0);
  const minimumQualityScore = Number(config.dailyTargets.minimumQualityScore || 18);
  const activeAccounts = accountStrategy?.accounts ?? [];
  const qualified = scored.filter((item) => item.followUpAction !== "skip" && Number(item.score) >= minimumQualityScore);
  const uniqueQualifiedTools = uniqueByTool(qualified);
  const possibleDrafts = uniqueQualifiedTools.length * 5;
  const targetDrafts = targetAccounts * targetPerAccount;
  const accountCoverage = activeAccounts.map((account) => {
    const matches = uniqueQualifiedTools.filter((item) => accountMatchesItem(account, item));
    const availableDrafts = Math.min(targetPerAccount, matches.length);
    return {
      accountId: account.id,
      displayName: account.displayName,
      category: account.category,
      targetPosts: targetPerAccount,
      availableDrafts,
      qualifiedTools: matches.length,
      gap: Math.max(0, targetPerAccount - availableDrafts),
      status: availableDrafts >= targetPerAccount ? "covered" : "short"
    };
  });
  const circleCoverage = config.circles.map((circle) => {
    const items = uniqueQualifiedTools.filter((item) => itemMatchesCircle(item, circle));
    return {
      circleId: circle.id,
      name: circle.name,
      qualifiedTools: items.length,
      possibleDrafts: items.length * 5
    };
  });
  const totalGap = Math.max(0, targetDrafts - possibleDrafts);
  const accountShort = accountCoverage.some((account) => account.status === "short");
  const status = totalGap === 0 && !accountShort ? "covered" : "short";

  return {
    date,
    targetAccounts,
    targetPerAccount,
    targetDrafts,
    minimumQualityScore,
    qualifiedTools: uniqueQualifiedTools.length,
    possibleDrafts,
    totalGap,
    status,
    note: status === "covered"
      ? "Supply is enough for the configured account target, subject to manual review."
      : "Supply is short for at least one account or circle. Add more source candidates instead of lowering quality just to fill slots.",
    accountCoverage,
    circleCoverage
  };
}
