import { CORE_COLLECTIONS, emptyCollection, loadCollection, loadContentRules, normalizeCollection, saveCollection } from "./core-data.mjs";
import { checkTaskDuplicateRisk } from "./duplicate-checker.mjs";
import { createCopyId, createStableId, createTaskId, createTopicId, createToolId, todayString } from "./ids.mjs";
import { createSimilarityFingerprint, extractExternalLinks, hashText, normalizeText } from "./text-normalizer.mjs";
import { analyzeTweetLength } from "./tweet-length.mjs";
import { normalizeDomain } from "./url-utils.mjs";
import { loadSourceLaneData, saveSourceLaneData, workspaceLaneIds } from "./source-lanes.mjs";

export const LANE_COPY_PROFILES = {
  ai_startups: {
    audience: "AI builders and operators",
    painPoint: "turning AI tools into useful workflow leverage",
    useCase: "AI product and agent workflows",
    accountHints: ["ai"],
    copy: (title, pain) => `Watching ${title}. The useful AI angle is ${pain}. I would test it as workflow leverage, not another shiny tool.`
  },
  indie_builders: {
    audience: "indie builders and solo founders",
    painPoint: "shipping small tools without turning every launch into noise",
    useCase: "solo founder launch and workflow notes",
    accountHints: ["indie", "build", "creator"],
    copy: (title, pain) => `Watching ${title}. The useful indie angle is ${pain}. Small, specific workflows usually beat broad launch advice.`
  },
  saas_founders: {
    audience: "SaaS founders and operators",
    painPoint: "finding practical SaaS lessons in pricing, onboarding, churn, or sales",
    useCase: "SaaS founder operating notes",
    accountHints: ["saas", "sales", "founder"],
    copy: (title, pain) => `Watching ${title}. The useful SaaS angle is ${pain}. I would frame it around operator decisions, not generic startup advice.`
  },
  crypto_builders: {
    audience: "crypto builders and product operators",
    painPoint: "separating builder workflows from price noise",
    useCase: "wallet, security, infra, or onchain data workflows",
    accountHints: ["crypto", "wallet", "onchain"],
    copy: (title, pain) => `Watching ${title}. Useful only from a builder angle: ${pain}. No price take here; just a product/workflow note.`
  }
};

export async function convertRawCandidatesToCore(options = {}) {
  const [sourceData, tools, topics, copyLibrary, postTasks, postLedger, xAccounts, assignments, users, accountHealth, contentRules] = await Promise.all([
    loadSourceLaneData(),
    loadCollection(CORE_COLLECTIONS.tools),
    loadCollection(CORE_COLLECTIONS.topics),
    loadCollection(CORE_COLLECTIONS.copyLibrary),
    loadCollection(CORE_COLLECTIONS.postTasks),
    loadCollection(CORE_COLLECTIONS.postLedger),
    loadCollection(CORE_COLLECTIONS.xAccounts),
    loadCollection(CORE_COLLECTIONS.assignments),
    loadCollection(CORE_COLLECTIONS.users),
    loadCollection(CORE_COLLECTIONS.accountHealth),
    loadContentRules()
  ]);
  const result = buildRawCandidateConversion({
    sourceData,
    core: { tools, topics, copyLibrary, postTasks, postLedger, xAccounts, assignments, users, accountHealth, contentRules },
    workspaceId: options.workspaceId || "workspace_default",
    date: options.date || todayString()
  });

  await Promise.all([
    saveCollection(CORE_COLLECTIONS.tools, result.core.tools),
    saveCollection(CORE_COLLECTIONS.topics, result.core.topics),
    saveCollection(CORE_COLLECTIONS.copyLibrary, result.core.copyLibrary),
    saveCollection(CORE_COLLECTIONS.postTasks, result.core.postTasks),
    saveSourceLaneData(result.sourceData)
  ]);
  return result.stats;
}

export function buildRawCandidateConversion({ sourceData, core, workspaceId = "workspace_default", date = todayString(), now = new Date().toISOString() }) {
  const nextCore = cloneCore(core);
  const nextSourceData = cloneSourceData(sourceData);
  const stats = {
    workspaceId,
    scanned: 0,
    eligible: 0,
    toolsAdded: 0,
    toolsUpdated: 0,
    topicsAdded: 0,
    copiesAdded: 0,
    tasksAdded: 0,
    skippedNoWorkspaceLane: 0,
    skippedRisk: 0,
    skippedPlaceholder: 0,
    skippedExistingTask: 0,
    blockedTasks: 0,
    warningTasks: 0
  };
  const workspace = nextSourceData.workspaces.items.find((item) => item.workspaceId === workspaceId && item.active !== false);
  if (!workspace) throw new Error(`Unknown or inactive workspace: ${workspaceId}`);
  const enabledLaneIds = workspaceLaneIds(workspace, nextSourceData.workspaceLanes.items);
  const taskContext = {
    tasks: nextCore.postTasks.items,
    ledger: nextCore.postLedger.items,
    xAccounts: nextCore.xAccounts.items,
    users: nextCore.users.items,
    accountHealth: nextCore.accountHealth.items,
    copyLibrary: nextCore.copyLibrary.items,
    contentRules: nextCore.contentRules
  };

  for (const candidate of nextSourceData.rawCandidates.items) {
    stats.scanned += 1;
    const hasBlockingRisk = (candidate.riskFlags ?? []).some((flag) => flag.severity === "block");
    if (!["new", "accepted", "converted_to_topic"].includes(candidate.status)) {
      if (hasBlockingRisk) stats.skippedRisk += 1;
      continue;
    }
    if (isPlaceholderCandidate(candidate)) {
      stats.skippedPlaceholder += 1;
      continue;
    }
    if (hasBlockingRisk) {
      stats.skippedRisk += 1;
      continue;
    }
    const laneIds = (candidate.laneIds ?? []).filter((laneId) => enabledLaneIds.includes(laneId));
    if (!laneIds.length) {
      stats.skippedNoWorkspaceLane += 1;
      continue;
    }
    stats.eligible += 1;
    const tool = upsertTool({ candidate, nextCore, date, now, stats });
    const convertedLaneIds = [];
    for (const laneId of laneIds) {
      const topic = upsertTopic({ workspace, candidate, tool, laneId, nextCore, date, now, stats });
      const copy = upsertCopy({ workspace, candidate, tool, topic, laneId, nextCore, now, stats });
      const account = pickAccountForLane(laneId, nextCore.xAccounts.items);
      const task = buildTask({ workspace, candidate, tool, topic, copy, laneId, account, assignments: nextCore.assignments.items, date, now });
      if (nextCore.postTasks.items.some((item) => item.taskId === task.taskId)) {
        stats.skippedExistingTask += 1;
      } else {
        const duplicateCheckResult = checkTaskDuplicateRisk({ task, context: taskContext });
        task.duplicateCheckResult = duplicateCheckResult;
        task.riskFlags = duplicateCheckResult.flags.map((flag) => flag.type);
        if (duplicateCheckResult.riskLevel === "block") {
          task.status = "draft";
          task.approvalStatus = "rejected";
          stats.blockedTasks += 1;
        } else if (duplicateCheckResult.riskLevel === "medium") {
          stats.warningTasks += 1;
        }
        nextCore.postTasks.items.push(task);
        taskContext.tasks = nextCore.postTasks.items;
        stats.tasksAdded += 1;
      }
      convertedLaneIds.push(laneId);
    }
    candidate.status = "converted_to_topic";
    candidate.convertedWorkspaceIds = [...new Set([...(candidate.convertedWorkspaceIds ?? []), workspace.workspaceId])];
    candidate.convertedLaneIds = [...new Set([...(candidate.convertedLaneIds ?? []), ...convertedLaneIds])];
    candidate.updatedAt = now;
  }

  return {
    core: nextCore,
    sourceData: nextSourceData,
    stats
  };
}

function upsertTool({ candidate, nextCore, date, now, stats }) {
  const toolId = candidate.toolId || createToolId(candidate.title, candidate.url);
  const existing = nextCore.tools.items.find((item) => item.toolId === toolId);
  const sourceDate = String(candidate.sourcePublishedAt || date).slice(0, 10);
  const incoming = {
    toolId,
    name: candidate.title,
    domain: normalizeDomain(candidate.url),
    productHuntUrl: normalizeDomain(candidate.url) === "producthunt.com" ? candidate.url : "",
    officialUrl: normalizeDomain(candidate.url) === "producthunt.com" ? "" : candidate.url,
    tagline: candidate.summary || "",
    firstSeenAt: sourceDate,
    lastSeenAt: sourceDate,
    seenCount: 1,
    bestScore: Number(candidate.candidateScore || 0),
    latestScore: Number(candidate.candidateScore || 0),
    scoreBreakdown: { sourceQualityScore: Number(candidate.sourceQualityScore || 0), candidateScore: Number(candidate.candidateScore || 0) },
    affiliateStatus: "research_needed",
    affiliateLinkId: "",
    status: "new",
    sourceDates: [sourceDate].filter(Boolean),
    sourceCandidateIds: [candidate.candidateId],
    laneIds: candidate.laneIds ?? [],
    notes: "Converted from raw candidate.",
    createdAt: now,
    updatedAt: now
  };
  if (existing) {
    Object.assign(existing, mergeTool(existing, incoming));
    stats.toolsUpdated += 1;
    return existing;
  }
  nextCore.tools.items.push(incoming);
  stats.toolsAdded += 1;
  return incoming;
}

function upsertTopic({ workspace, candidate, tool, laneId, nextCore, date, now, stats }) {
  const profile = LANE_COPY_PROFILES[laneId];
  const painPoint = candidate.summary || profile.painPoint;
  const useCase = profile.useCase;
  const topicId = createTopicId(tool.toolId, "shortPost", profile.audience, painPoint, useCase);
  const existing = nextCore.topics.items.find((item) => item.topicId === topicId);
  if (existing) return existing;
  const topic = {
    topicId,
    toolId: tool.toolId,
    workspaceId: workspace.workspaceId,
    laneId,
    sourceCandidateId: candidate.candidateId,
    angleType: "shortPost",
    audience: profile.audience,
    painPoint,
    useCase,
    sourceDate: String(candidate.sourcePublishedAt || date).slice(0, 10),
    priorityScore: Number(candidate.candidateScore || 0),
    status: "new",
    duplicateGroupId: createStableId("dupgroup", [tool.toolId, laneId, normalizeText(painPoint)]),
    notes: `Converted from raw candidate ${candidate.candidateId}.`,
    createdAt: now,
    updatedAt: now
  };
  nextCore.topics.items.push(topic);
  stats.topicsAdded += 1;
  return topic;
}

function upsertCopy({ workspace, candidate, tool, topic, laneId, nextCore, now, stats }) {
  const copyText = buildShortCopy(candidate, laneId);
  const copyId = createCopyId(topic.topicId, "shortPost", copyText);
  const existing = nextCore.copyLibrary.items.find((item) => item.copyId === copyId || item.normalizedTextHash === hashText(copyText));
  if (existing) return existing;
  const length = analyzeTweetLength(copyText);
  const copy = {
    copyId,
    topicId: topic.topicId,
    toolId: tool.toolId,
    workspaceId: workspace.workspaceId,
    laneId,
    sourceCandidateId: candidate.candidateId,
    variantType: "shortPost",
    copyText,
    tweetText: copyText,
    weightedCharCount: length.weightedCharCount,
    fitsAutoPost: length.fitsAutoPost,
    linkPolicy: "no_link",
    normalizedText: normalizeText(copyText),
    normalizedTextHash: hashText(copyText),
    similarityFingerprint: createSimilarityFingerprint(copyText),
    language: "en",
    status: "approved",
    riskFlags: length.fitsAutoPost ? [] : ["over_280_chars"],
    usedByAccountIds: [],
    usedByTaskIds: [],
    createdAt: now,
    updatedAt: now
  };
  nextCore.copyLibrary.items.push(copy);
  stats.copiesAdded += 1;
  return copy;
}

function buildTask({ workspace, candidate, tool, topic, copy, laneId, account, assignments, date, now }) {
  const accountId = account?.accountId || "";
  const assignment = assignments.find((item) => item.accountId === accountId && item.active !== false);
  const taskId = createTaskId(date, accountId || "no_account", copy.copyId);
  return {
    taskId,
    date,
    workspaceId: workspace.workspaceId,
    laneId,
    sourceCandidateId: candidate.candidateId,
    accountId,
    assignedTo: assignment?.userId || workspace.staffUserIds?.[0] || "",
    managerUserId: account?.managerUserId || workspace.managerUserIds?.[0] || "",
    toolId: tool.toolId,
    toolName: tool.name,
    toolUrl: tool.officialUrl || tool.productHuntUrl,
    topicId: topic.topicId,
    copyId: copy.copyId,
    copyText: copy.copyText,
    tweetText: copy.tweetText,
    weightedCharCount: copy.weightedCharCount,
    variantType: copy.variantType,
    status: "pending_review",
    approvalStatus: "pending",
    publishMode: "manual",
    autoPublishEnabled: false,
    requiresFinalApproval: true,
    publishWindow: "",
    scheduledAt: "",
    copiedAt: "",
    postedAt: "",
    postedUrl: "",
    feedbackDueAt: "",
    metrics: defaultMetrics(),
    duplicateCheckResult: {},
    riskFlags: [],
    externalLinks: extractExternalLinks(copy.copyText),
    affiliateLinkUsed: "",
    notes: `Workspace ${workspace.workspaceId}; lane ${laneId}; converted from raw candidate.`,
    createdAt: now,
    updatedAt: now
  };
}

export function buildShortCopy(candidate, laneId) {
  const profile = LANE_COPY_PROFILES[laneId];
  const title = shortPhrase(candidate.title, 72);
  const pain = stripTrailingPunctuation(shortPhrase(candidate.summary || profile.painPoint, 92));
  const candidates = [
    profile.copy(title, pain),
    `Watching ${title}. Useful angle: ${pain}.`,
    `Watching ${title}. Useful ${laneId.replace(/_/g, " ")} note, but only after a real workflow check.`
  ];
  return candidates.find((text) => analyzeTweetLength(text).fitsAutoPost) ?? candidates.at(-1);
}

function shortPhrase(value, maxLength) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).replace(/\s+\S*$/, "")}...`;
}

function stripTrailingPunctuation(value) {
  const text = String(value || "").trim();
  if (text.endsWith("...")) return text;
  return text.replace(/[.!?。！？]+$/g, "").trim();
}

function pickAccountForLane(laneId, accounts) {
  const activeAccounts = accounts.filter((account) => account.status === "active" || account.active);
  const hints = LANE_COPY_PROFILES[laneId]?.accountHints ?? [];
  return activeAccounts.find((account) => {
    const text = [account.accountId, account.niche, account.persona, account.contentStyle].join(" ").toLowerCase();
    return hints.some((hint) => text.includes(hint));
  }) ?? activeAccounts[0] ?? null;
}

function mergeTool(existing, incoming) {
  const sourceDates = [...new Set([...(existing.sourceDates ?? []), ...(incoming.sourceDates ?? [])].filter(Boolean))].sort();
  return {
    ...existing,
    ...incoming,
    firstSeenAt: [existing.firstSeenAt, incoming.firstSeenAt].filter(Boolean).sort()[0] || incoming.firstSeenAt,
    lastSeenAt: [existing.lastSeenAt, incoming.lastSeenAt].filter(Boolean).sort().at(-1) || incoming.lastSeenAt,
    seenCount: Math.max(Number(existing.seenCount || 1), sourceDates.length || 1),
    bestScore: Math.max(Number(existing.bestScore || 0), Number(incoming.bestScore || 0)),
    latestScore: Number(incoming.latestScore || existing.latestScore || 0),
    sourceDates,
    sourceCandidateIds: [...new Set([...(existing.sourceCandidateIds ?? []), ...(incoming.sourceCandidateIds ?? [])])],
    laneIds: [...new Set([...(existing.laneIds ?? []), ...(incoming.laneIds ?? [])])],
    createdAt: existing.createdAt || incoming.createdAt,
    updatedAt: incoming.updatedAt
  };
}

function isPlaceholderCandidate(candidate) {
  return normalizeDomain(candidate.url) === "example.com";
}

function cloneCore(core) {
  return {
    tools: normalizeCollection(core.tools ?? emptyCollection()),
    topics: normalizeCollection(core.topics ?? emptyCollection()),
    copyLibrary: normalizeCollection(core.copyLibrary ?? emptyCollection()),
    postTasks: normalizeCollection(core.postTasks ?? emptyCollection()),
    postLedger: normalizeCollection(core.postLedger ?? emptyCollection()),
    xAccounts: normalizeCollection(core.xAccounts ?? emptyCollection()),
    assignments: normalizeCollection(core.assignments ?? emptyCollection()),
    users: normalizeCollection(core.users ?? emptyCollection()),
    accountHealth: normalizeCollection(core.accountHealth ?? emptyCollection()),
    contentRules: core.contentRules ?? { rules: {} }
  };
}

function cloneSourceData(sourceData) {
  return {
    ...sourceData,
    workspaces: normalizeCollection(sourceData.workspaces ?? emptyCollection()),
    workspaceLanes: normalizeCollection(sourceData.workspaceLanes ?? emptyCollection()),
    rawCandidates: normalizeCollection(sourceData.rawCandidates ?? emptyCollection())
  };
}

function defaultMetrics() {
  return {
    impressions: 0,
    likes: 0,
    bookmarks: 0,
    replies: 0,
    reposts: 0,
    clicks: 0,
    profileVisits: 0
  };
}
