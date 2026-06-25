export function renderSourceSupplyWorkbenchMarkdown(workbench) {
  if (!workbench) return "# Source Supply Workbench\n\nNo source workbench available. Run npm run daily first.\n";
  const summary = workbench.summary ?? {};
  return `# Source Supply Workbench - ${workbench.date}

- Status: ${workbench.status}
- Target drafts: ${summary.targetDrafts}
- Qualified tools: ${summary.qualifiedTools}
- Possible drafts: ${summary.possibleDrafts}
- Supply gap: ${summary.supplyGap}
- Needed candidates: ${summary.totalNeededCandidates}
- Top gap: ${summary.topCircle || "none"}
- Active inbox: ${summary.activeInboxCount}
- Active source candidates: ${summary.activeSourceCandidateCount}
- Sources enabled: ${summary.enabledSources}/${summary.configuredSources}

## Workflow

${(workbench.workflow ?? []).map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Top Source Gaps

${(workbench.circles ?? []).map((circle, index) => `### ${index + 1}. ${circle.circleName}

- Needed candidates: ${circle.neededCandidates}
- Current qualified tools: ${circle.currentQualifiedTools}
- Affected accounts: ${circle.affectedAccounts.length ? circle.affectedAccounts.map((account) => `${account.displayName} gap ${account.gap}`).join("; ") : "none"}
- Opening move: ${circle.openingMove}
- Source health: ${circle.health.enabledSources}/${circle.health.trackedSources} enabled, ${circle.health.qualifiedCandidates} qualified${circle.health.weakestSource ? `, weakest ${circle.health.weakestSource}` : ""}

Search links:
${circle.searchLinks.length ? circle.searchLinks.slice(0, 8).map((link) => `- [${link.label}: ${link.query}](${link.url})`).join("\n") : "- No search links yet."}

Source ideas:
${circle.sourceIdeas.length ? circle.sourceIdeas.map((source) => `- ${source.name}: ${source.url} — ${source.why}`).join("\n") : "- No source ideas yet."}

Import template:
\`\`\`csv
${circle.importTemplate}
\`\`\`

Quality checklist:
${circle.qualityChecklist.map((item) => `- ${item}`).join("\n")}`).join("\n\n") || "No source gaps detected."}

## Commands

${(workbench.commands ?? []).map((command) => `- \`${command}\``).join("\n")}
`;
}

export function renderSourceDiscoveryMarkdown(pack) {
  if (!pack?.circles?.length) return "# Source Discovery Pack\n\nNo source discovery actions needed.\n";

  return `# Source Discovery Pack - ${pack.date}

- Circles: ${pack.summary.circles}
- Needed candidates: ${pack.summary.totalNeededCandidates}
- Search links: ${pack.summary.totalSearchLinks}
- Top gap: ${pack.summary.topCircle || "none"}

${pack.circles.map((circle, index) => `## ${index + 1}. ${circle.circleName}

- Needed candidates: ${circle.neededCandidates}
- Current qualified tools: ${circle.currentQualifiedTools}
- Opening move: ${circle.openingMove}
- Import hint: ${circle.importHint}

Search links:
${circle.searchLinks.map((link) => `- [${link.label}](${link.url}) — ${link.query}`).join("\n")}

Source ideas:
${circle.sourceIdeas.map((source) => `- ${source.name}: ${source.url} — ${source.why}`).join("\n")}

Quality checklist:
${circle.qualityChecklist.map((item) => `- ${item}`).join("\n")}`).join("\n\n")}
`;
}

export function renderSourceHealthMarkdown(health) {
  if (!health) return "# Source Health\n\nNo source health report available. Run npm run source-health.\n";

  return `# Source Health - ${health.date}

- Configured sources: ${health.summary.configuredSources}
- Enabled sources: ${health.summary.enabledSources}
- Tracked sources: ${health.summary.trackedSources}
- Healthy sources: ${health.summary.healthySources}
- Tune sources: ${health.summary.tuneSources}
- Disable candidates: ${health.summary.disableCandidates}
- Total candidates: ${health.summary.totalCandidates}
- Qualified candidates: ${health.summary.qualifiedCandidates}
- Noise candidates: ${health.summary.noiseCandidates}

## Recommendations

${health.recommendations.length ? health.recommendations.map((item, index) => `${index + 1}. ${item}`).join("\n") : "No source-health actions yet."}

## Sources

${health.sources.map((source, index) => `${index + 1}. ${source.name} — ${source.status} — ${source.healthScore}/100
   Circle: ${source.circle || "unknown"} · enabled ${source.enabled ? "yes" : "no"} · candidates ${source.totalCandidates} · qualified ${source.qualifiedCandidates} · noise ${source.noiseCandidates}
   Recommendation: ${source.recommendation}`).join("\n")}

## Circle Coverage

${health.circles.map((circle) => `- ${circle.name}: sources ${circle.sources}, enabled ${circle.enabledSources}, candidates ${circle.totalCandidates}, qualified ${circle.qualifiedCandidates}, source gap ${circle.sourceGap}, candidate gap ${circle.candidateGap}`).join("\n")}
`;
}

export function renderSourceQualityQueueMarkdown(queue) {
  if (!queue?.items?.length) {
    return "# Source Quality Queue\n\nNo source gaps detected under the current target.\n";
  }

  return `# Source Quality Queue

- Queue items: ${queue.summary.items}
- Needed candidates: ${queue.summary.totalNeededCandidates}
- Top gap: ${queue.summary.topCircle || "none"}

${queue.items.map((item, index) => `## ${index + 1}. ${item.circleName}

- Needed candidates: ${item.neededCandidates}
- Current qualified tools: ${item.currentQualifiedTools}
- Affected accounts: ${item.affectedAccounts.length ? item.affectedAccounts.map((account) => `${account.displayName} gap ${account.gap}`).join("; ") : "none"}
- Import hint: ${item.importHint}

Search queries:
${item.searchQueries.map((query) => `- ${query}`).join("\n")}

Recommended configured sources:
${item.recommendedSources.length ? item.recommendedSources.map((source) => `- ${source.name} (${source.enabled ? "enabled" : "disabled"}) — ${source.url}`).join("\n") : "- No configured source yet. Add one to config/content-sources.json after testing it."}`).join("\n\n")}
`;
}
