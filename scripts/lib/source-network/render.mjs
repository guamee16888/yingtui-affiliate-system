export function renderSourceNetworkMarkdown({ registry, quality, supply }) {
  return `# AI Creator OS Data Source Network - ${registry.date}

## Source Registry

- Sources: ${registry.summary.totalSources}
- L0 Premium: ${registry.summary.l0Premium}
- L1 Public: ${registry.summary.l1Public}
- L2 Community: ${registry.summary.l2Community}
- Direct candidate sources: ${registry.summary.directCandidateSources}
- Manual-review-only sources: ${registry.summary.manualReviewOnlySources}

## Source Health Dashboard

- New candidates tracked: ${quality.summary.totalCandidates}
- Effective candidates: ${quality.summary.effectiveCandidates}
- Rejected candidates: ${quality.summary.rejectedCandidates}
- Duplicate rate: ${quality.summary.duplicateRate}
- Rejection rate: ${quality.summary.rejectionRate}
- Lane coverage: ${quality.summary.laneCoverage}

## Supply Gap Report

- Target accounts: ${supply.summary.targetAccounts}
- Inventory per account: ${supply.summary.inventoryPerAccount}
- Required inventory: ${supply.summary.requiredInventory}
- Current inventory: ${supply.summary.currentInventory}
- Direct candidates: ${supply.summary.directCandidates}
- Review-only candidates: ${supply.summary.reviewOnlyCandidates}
- Projected inventory: ${supply.summary.projectedInventory}
- Current gap: ${supply.summary.inventoryGap}
- Projected gap: ${supply.summary.projectedGap}

## Lanes

${supply.lanes.map((lane) => `- ${lane.name}: current ${lane.currentInventory}/${lane.requiredInventory}, candidates ${lane.directCandidateCount}, gap ${lane.gap}, projected gap ${lane.projectedGap}`).join("\n")}

## Recommendations

${[...quality.recommendations, ...supply.budgetRecommendations].map((item, index) => `${index + 1}. ${item}`).join("\n") || "No source-network recommendations yet."}

## Source Rules

- L0 Premium and L1 Public may enter candidate production after quality checks.
- L2 Community can only enter raw_candidates for manual review.
- Do not generate publish tasks directly from Telegram, Discord, or Reddit noise.
`;
}
