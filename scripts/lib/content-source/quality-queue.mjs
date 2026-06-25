import { DEFAULT_CONTENT_SOURCE_CONFIG, normalizeContentSourceConfig } from "./config.mjs";
import { accountLooksLikeCircle, recommendedSourcesForCircle, searchQueriesForCircle } from "./helpers.mjs";

export function buildSourceQualityQueue({ supplyPlan = null, contentSourceConfig = DEFAULT_CONTENT_SOURCE_CONFIG }) {
  const config = normalizeContentSourceConfig(contentSourceConfig);
  if (!supplyPlan) {
    return {
      summary: { items: 0, totalNeededCandidates: 0 },
      items: []
    };
  }

  const accountGaps = (supplyPlan.accountCoverage ?? [])
    .filter((account) => Number(account.gap) > 0)
    .sort((a, b) => Number(b.gap) - Number(a.gap));

  const items = config.circles.map((circle) => {
    const affectedAccounts = accountGaps.filter((account) => accountLooksLikeCircle(account, circle));
    const circleCoverage = (supplyPlan.circleCoverage ?? []).find((item) => item.circleId === circle.id);
    const accountGap = affectedAccounts.reduce((sum, account) => sum + Number(account.gap || 0), 0);
    const baselineNeed = Math.max(0, Math.ceil(Number(supplyPlan.targetPerAccount || 10) * 2) - Number(circleCoverage?.qualifiedTools || 0));
    const neededCandidates = Math.max(accountGap, baselineNeed);

    return {
      circleId: circle.id,
      circleName: circle.name,
      priorityScore: neededCandidates + affectedAccounts.length * 2,
      neededCandidates,
      currentQualifiedTools: Number(circleCoverage?.qualifiedTools || 0),
      affectedAccounts: affectedAccounts.map((account) => ({
        accountId: account.accountId,
        displayName: account.displayName,
        gap: account.gap,
        category: account.category
      })),
      recommendedSources: recommendedSourcesForCircle(config, circle),
      searchQueries: searchQueriesForCircle(circle),
      importHint: `Add ${neededCandidates || 5} fresh ${circle.name} candidates with clear buyer, narrow pain, and a real URL.`
    };
  })
    .filter((item) => item.neededCandidates > 0 || item.affectedAccounts.length > 0)
    .sort((a, b) => b.priorityScore - a.priorityScore || a.circleName.localeCompare(b.circleName));

  return {
    summary: {
      items: items.length,
      totalNeededCandidates: items.reduce((sum, item) => sum + item.neededCandidates, 0),
      topCircle: items[0]?.circleName ?? ""
    },
    items
  };
}
