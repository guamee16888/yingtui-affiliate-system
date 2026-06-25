import { DEFAULT_SOURCE_CANDIDATES } from "./config.mjs";
import { sourceImportRowsToCsv } from "./csv.mjs";
import { sourceSupplyQualityChecklist } from "./helpers.mjs";

export function buildSourceSupplyWorkbench({
  date,
  supplyPlan = null,
  sourceQualityQueue = null,
  sourceDiscovery = null,
  sourceHealth = null,
  candidateInbox = { items: [] },
  sourceCandidates = DEFAULT_SOURCE_CANDIDATES
}) {
  const activeInbox = (candidateInbox.items ?? []).filter((item) => item.status === "active");
  const activeSourceCandidates = (sourceCandidates.items ?? []).filter((item) => item.status === "active");
  const queueItems = sourceQualityQueue?.items ?? [];
  const discoveryByCircle = new Map((sourceDiscovery?.circles ?? []).map((circle) => [circle.circleId, circle]));
  const healthByCircle = new Map((sourceHealth?.sources ?? []).reduce((entries, source) => {
    const circle = source.circle || "unknown";
    entries.set(circle, [...(entries.get(circle) ?? []), source]);
    return entries;
  }, new Map()));
  const circleIds = new Set([...queueItems.map((item) => item.circleId), ...discoveryByCircle.keys()]);
  const circles = [...circleIds].map((circleId) => {
    const queueItem = queueItems.find((item) => item.circleId === circleId) ?? {};
    const discoveryItem = discoveryByCircle.get(circleId) ?? {};
    const healthSources = healthByCircle.get(circleId) ?? [];
    const searchQueries = queueItem.searchQueries ?? (discoveryItem.searchLinks ?? []).map((link) => link.query).filter(Boolean);
    return {
      circleId,
      circleName: queueItem.circleName || discoveryItem.circleName || circleId,
      priorityScore: Number(queueItem.priorityScore ?? discoveryItem.priorityScore ?? 0),
      neededCandidates: Number(queueItem.neededCandidates ?? discoveryItem.neededCandidates ?? 0),
      currentQualifiedTools: Number(queueItem.currentQualifiedTools ?? discoveryItem.currentQualifiedTools ?? 0),
      affectedAccounts: queueItem.affectedAccounts ?? [],
      openingMove: discoveryItem.openingMove || queueItem.importHint || "Collect candidates, preview score, then import only strong fits.",
      importHint: queueItem.importHint || discoveryItem.importHint || "",
      searchQueries,
      searchLinks: discoveryItem.searchLinks ?? [],
      sourceIdeas: discoveryItem.sourceIdeas ?? [],
      configuredSources: discoveryItem.configuredSources ?? queueItem.recommendedSources ?? [],
      health: {
        trackedSources: healthSources.length,
        enabledSources: healthSources.filter((source) => source.enabled).length,
        healthySources: healthSources.filter((source) => source.status === "healthy").length,
        qualifiedCandidates: healthSources.reduce((sum, source) => sum + Number(source.qualifiedCandidates || 0), 0),
        weakestSource: healthSources.slice().sort((a, b) => Number(a.healthScore || 0) - Number(b.healthScore || 0))[0]?.name ?? ""
      },
      qualityChecklist: discoveryItem.qualityChecklist ?? sourceSupplyQualityChecklist(),
      importTemplate: sourceSupplyCsvTemplate({ circleId, searchQueries })
    };
  }).sort((a, b) => b.neededCandidates - a.neededCandidates || b.priorityScore - a.priorityScore);

  const totalNeededCandidates = sourceQualityQueue?.summary?.totalNeededCandidates
    ?? sourceDiscovery?.summary?.totalNeededCandidates
    ?? circles.reduce((sum, circle) => sum + circle.neededCandidates, 0);
  const supplyGap = Number(supplyPlan?.totalGap ?? 0);
  const status = totalNeededCandidates > 0 || supplyGap > 0 ? "needs_supply" : "covered";

  return {
    date,
    generatedAt: new Date().toISOString(),
    status,
    summary: {
      targetDrafts: Number(supplyPlan?.targetDrafts ?? 0),
      targetAccounts: Number(supplyPlan?.targetAccounts ?? 0),
      targetPerAccount: Number(supplyPlan?.targetPerAccount ?? 0),
      qualifiedTools: Number(supplyPlan?.qualifiedTools ?? 0),
      possibleDrafts: Number(supplyPlan?.possibleDrafts ?? 0),
      supplyGap,
      totalNeededCandidates,
      topCircle: circles[0]?.circleName ?? "",
      activeInboxCount: activeInbox.length,
      activeSourceCandidateCount: activeSourceCandidates.length,
      enabledSources: Number(sourceHealth?.summary?.enabledSources ?? 0),
      configuredSources: Number(sourceHealth?.summary?.configuredSources ?? 0)
    },
    workflow: [
      "Open search links for the top gap circle.",
      "Collect real candidates with a URL, a clear audience, and one narrow pain.",
      "Paste candidates into Candidate Inbox and preview scoring before importing.",
      "Run daily again so account routing and draft planning update from the new supply."
    ],
    commands: [
      "npm run source-workbench",
      "npm run source-pack",
      "npm run daily",
      "npm start"
    ],
    circles,
    sourceHealth: sourceHealth ? {
      summary: sourceHealth.summary,
      recommendations: sourceHealth.recommendations ?? []
    } : null
  };
}

function sourceSupplyCsvTemplate({ circleId, searchQueries = [] }) {
  const source = `${circleId || "manual"}_research`;
  const query = searchQueries.find(Boolean) || "specific narrow pain";
  return sourceImportRowsToCsv([
    {
      name: "Real tool or topic name",
      url: "https://example.com",
      tagline: "Who has this pain and why it matters",
      source,
      circle: circleId,
      candidateType: "product",
      sourceUrl: "",
      published: "",
      notes: `Found from: ${query}`
    },
    {
      name: "Second real candidate",
      url: "https://example.com/blog",
      tagline: `Founder/product signal found from ${query}`,
      source,
      circle: circleId,
      candidateType: "topic",
      sourceUrl: "",
      published: "",
      notes: "Only import if it has a real URL and clear audience."
    }
  ]);
}
