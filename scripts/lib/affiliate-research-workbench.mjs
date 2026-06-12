import { createToolId } from "./ids.mjs";
import { realAffiliateLinks } from "./affiliate-links.mjs";

export function buildAffiliateResearchWorkbench({
  date,
  latest = null,
  affiliateResearch = { items: [] },
  affiliateLinks = { links: [] },
  queues = { items: [] }
}) {
  const records = (affiliateResearch.items ?? []).map(enrichAffiliateRecord);
  const recordByToolId = new Map(records.map((record) => [record.toolId, record]));
  const configuredLinks = realAffiliateLinks(affiliateLinks);
  const candidates = affiliateCandidates({ latest, queues, recordByToolId })
    .map((candidate) => enrichAffiliateCandidate(candidate, recordByToolId))
    .sort((a, b) => Number(b.priorityScore) - Number(a.priorityScore) || a.name.localeCompare(b.name));
  const readyRecords = records.filter((record) => record.readiness.state === "ready");

  return {
    version: 1,
    date,
    generatedAt: new Date().toISOString(),
    summary: {
      candidates: candidates.length,
      highPriority: candidates.filter((item) => item.priorityScore >= 90).length,
      readyToConfigure: readyRecords.length,
      missingFields: records.filter((record) => record.readiness.state === "missing").length,
      researching: records.filter((record) => record.readiness.state === "researching").length,
      noFit: records.filter((record) => record.readiness.state === "no_fit").length,
      researchRecords: records.length,
      configuredLinks: configuredLinks.length,
      totalSearchLinks: candidates.reduce((sum, item) => sum + item.searchLinks.length, 0)
    },
    rule: "Only use real approved affiliate links. Program pages, homepages, and guessed ref URLs are not affiliate links.",
    workflow: [
      "Open the search group for the highest-priority candidate.",
      "Confirm whether an official affiliate, partner, referral, or marketplace program exists.",
      "Record programUrl, network, status, notes, and only a real approved affiliateLink.",
      "Copy a config snippet only after status is approved and affiliateLink is real."
    ],
    priorityQueue: candidates,
    records,
    readyConfigSnippets: readyRecords.map((record) => ({
      toolName: record.toolName,
      snippet: affiliateConfigSnippet(record)
    }))
  };
}

export function renderAffiliateResearchWorkbenchMarkdown(workbench) {
  if (!workbench) return "# Affiliate Research Workbench\n\nNo workbench data available.\n";
  return `# Affiliate Research Workbench - ${workbench.date}

- Candidates: ${workbench.summary.candidates}
- High priority: ${workbench.summary.highPriority}
- Ready to configure: ${workbench.summary.readyToConfigure}
- Missing fields: ${workbench.summary.missingFields}
- Researching: ${workbench.summary.researching}
- Configured links: ${workbench.summary.configuredLinks}

Rule:
${workbench.rule}

## Workflow

${workbench.workflow.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Priority Queue

${workbench.priorityQueue.length ? workbench.priorityQueue.map((item, index) => `### ${index + 1}. ${item.name}

- Priority: ${item.priorityScore}
- Affiliate score: ${item.affiliateScore}
- Total score: ${item.score}
- Status: ${item.readiness.label}
- Next: ${item.nextAction}
- Reason: ${item.reason}
- URL: ${item.url}

Search links:
${item.searchLinks.map((link) => `- [${link.label}](${link.url})`).join("\n")}`).join("\n\n") : "No affiliate research candidates today."}

## Research Records

${workbench.records.length ? workbench.records.map((record) => `- ${record.toolName} — ${record.status} — ${record.readiness.label} — ${record.readiness.reason}`).join("\n") : "No research records yet."}

## Ready Config Snippets

${workbench.readyConfigSnippets.length ? workbench.readyConfigSnippets.map((item) => `### ${item.toolName}

\`\`\`json
${item.snippet}
\`\`\``).join("\n\n") : "No approved affiliate links ready for config."}
`;
}

export function affiliateSearchLinks(toolName, toolUrl = "") {
  const domain = safeHost(toolUrl);
  const productDomain = domain && !isEditorialDomain(domain);
  const quoted = `"${toolName}"`;
  const google = (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const links = [];
  if (toolUrl) links.push({ label: productDomain ? "official site" : "source article", url: toolUrl });
  links.push({ label: "official affiliate", url: google(productDomain ? `site:${domain} affiliate OR partner OR referral` : `${quoted} affiliate program`) });
  links.push({ label: "PartnerStack", url: google(`site:partnerstack.com ${quoted}`) });
  links.push({ label: "Impact", url: google(`site:impact.com ${quoted} affiliate`) });
  links.push({ label: "Rewardful", url: google(`site:rewardful.com ${quoted}`) });
  links.push({ label: "Terms", url: google(`${quoted} terms affiliate referral partner`) });
  return links;
}

export function affiliateResearchReadiness(item) {
  if (item.status === "added_to_config") {
    return { state: "ready", kind: "good", label: "added to config", reason: "Already marked as added_to_config. Re-check periodically that the link still works.", missingFields: [] };
  }
  if (["rejected", "no_program"].includes(item.status)) {
    return { state: "no_fit", kind: "stale", label: "no fit", reason: "No usable program or application was rejected. Do not add it to affiliate config.", missingFields: [] };
  }
  if (item.status === "approved" && item.programUrl && item.affiliateLink) {
    return { state: "ready", kind: "good", label: "ready to configure", reason: "Approved and has a real affiliateLink. Safe to copy into config after one manual check.", missingFields: [] };
  }
  if (item.status === "approved") {
    const missingFields = [!item.programUrl ? "programUrl" : "", !item.affiliateLink ? "affiliateLink" : ""].filter(Boolean);
    return { state: "missing", kind: "warn", label: "missing fields", reason: `Approved, but missing ${missingFields.join(", ")}.`, missingFields };
  }
  if (item.status === "applied") {
    return { state: "researching", kind: "warn", label: "waiting approval", reason: "Applied but not approved yet. Do not use an affiliate link.", missingFields: [] };
  }
  return { state: "researching", kind: "warn", label: "research needed", reason: "Confirm official programUrl, network, and application path first.", missingFields: ["programUrl", "status", "affiliateLink"] };
}

export function affiliateConfigSnippet(item) {
  const domain = safeHost(item.toolUrl);
  return JSON.stringify({
    match: item.toolName,
    keywords: [],
    domains: domain ? [domain] : [],
    affiliateUrl: item.affiliateLink || "",
    note: item.commissionNote || `Verified affiliate program: ${item.programUrl || "programUrl missing"}`
  }, null, 2);
}

function affiliateCandidates({ latest, queues, recordByToolId }) {
  const fromDaily = (latest?.affiliateResearchQueue ?? []).map((item) => ({
    toolId: item.toolId || createToolId(item.name, item.url),
    name: item.name,
    url: item.url,
    tagline: item.tagline || "",
    affiliateScore: Number(item.affiliateScore ?? 0),
    score: Number(item.score ?? 0),
    followUpAction: item.followUpAction || "affiliate priority",
    reason: item.reason || "No affiliate link yet — research needed",
    source: "daily_queue"
  }));
  const fromTools = (latest?.tools ?? [])
    .filter((tool) => !tool.affiliateLink && Number(tool.scoreBreakdown?.affiliateScore ?? 0) >= 6)
    .map((tool) => ({
      toolId: tool.toolId || createToolId(tool.name, tool.url),
      name: tool.name,
      url: tool.url,
      tagline: tool.tagline || "",
      affiliateScore: Number(tool.scoreBreakdown?.affiliateScore ?? 0),
      score: Number(tool.score ?? 0),
      followUpAction: tool.followUpAction || "",
      reason: tool.reason || "No affiliate link yet — research needed",
      source: "latest_tools"
    }));
  const fromQueues = (queues.items ?? [])
    .filter((item) => item.type === "affiliate_research" && item.status !== "archived" && item.status !== "skipped")
    .map((item) => ({
      toolId: item.toolId || createToolId(item.toolName, item.toolUrl),
      name: item.toolName,
      url: item.toolUrl,
      tagline: "",
      affiliateScore: 0,
      score: Number(item.priorityScore ?? 0),
      followUpAction: "affiliate priority",
      reason: item.reason || "Queued for affiliate research.",
      source: "manual_queue"
    }));

  const candidates = new Map();
  for (const item of [...fromDaily, ...fromTools, ...fromQueues]) {
    if (!item.name || !item.url) continue;
    const existing = candidates.get(item.toolId);
    const merged = existing ? {
      ...existing,
      ...item,
      affiliateScore: Math.max(existing.affiliateScore, item.affiliateScore),
      score: Math.max(existing.score, item.score),
      source: Array.from(new Set([existing.source, item.source])).join(",")
    } : item;
    candidates.set(item.toolId, merged);
  }

  for (const record of recordByToolId.values()) {
    if (record.readiness.state === "ready" || record.readiness.state === "no_fit") {
      candidates.delete(record.toolId);
    }
  }

  return [...candidates.values()];
}

function enrichAffiliateCandidate(candidate, recordByToolId) {
  const record = recordByToolId.get(candidate.toolId);
  const readiness = record?.readiness ?? affiliateResearchReadiness({ status: "not_started" });
  const priorityScore = Math.round(
    Number(candidate.score || 0)
    + Number(candidate.affiliateScore || 0) * 8
    + (candidate.followUpAction === "affiliate priority" ? 18 : 0)
    + (record ? 10 : 0)
    - (readiness.state === "researching" && record?.status === "applied" ? 8 : 0)
  );
  return {
    ...candidate,
    priorityScore,
    existingRecordId: record?.id ?? "",
    status: record?.status ?? "not_started",
    readiness,
    nextAction: nextAffiliateAction(record, readiness),
    searchLinks: affiliateSearchLinks(candidate.name, candidate.url)
  };
}

function enrichAffiliateRecord(record) {
  const toolId = record.toolId || createToolId(record.toolName, record.toolUrl);
  const normalized = {
    ...record,
    toolId,
    toolName: record.toolName || "",
    toolUrl: record.toolUrl || "",
    status: record.status || "not_started",
    affiliateScore: Number(record.affiliateScore ?? 0),
    network: record.network || "",
    programUrl: record.programUrl || "",
    affiliateLink: record.affiliateLink || "",
    commissionNote: record.commissionNote || "",
    notes: record.notes || ""
  };
  return {
    ...normalized,
    readiness: affiliateResearchReadiness(normalized),
    searchLinks: affiliateSearchLinks(normalized.toolName, normalized.toolUrl)
  };
}

function nextAffiliateAction(record, readiness) {
  if (!record) return "Open the search group, then save a research record as searching, applied, approved, no_program, or rejected.";
  if (readiness.state === "ready") return "Copy the config snippet into config/affiliate-links.json after one manual link check.";
  if (readiness.state === "missing") return `Fill ${readiness.missingFields.join(", ")} before using this record.`;
  if (record.status === "applied") return "Wait for approval; do not use any link yet.";
  if (readiness.state === "no_fit") return "Keep archived unless the official program changes.";
  return "Continue research: confirm official programUrl, network, and application path.";
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isEditorialDomain(domain) {
  return [
    "techcrunch.com",
    "coindesk.com",
    "news.ycombinator.com",
    "hnrss.org",
    "producthunt.com",
    "medium.com",
    "substack.com"
  ].some((item) => domain === item || domain.endsWith(`.${item}`));
}
