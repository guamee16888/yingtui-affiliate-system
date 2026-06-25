import { createStableId, createToolId } from "./ids.mjs";
import { normalizeAccountConfig } from "./account-system.mjs";

const DEFAULT_TOOL_WINDOW_DAYS = 7;
const DEFAULT_COPY_WINDOW_DAYS = 30;

export function buildAccountConflictRadar({
  date,
  latest = null,
  accountPosts = { items: [] },
  feedback = { entries: [] },
  accountConfig = { accounts: [] },
  now = new Date()
}) {
  const config = normalizeAccountConfig(accountConfig);
  const policy = {
    sameToolCooldownDays: Number(config.rotationPolicy?.sameToolCooldownDays ?? DEFAULT_TOOL_WINDOW_DAYS),
    sameCopyCooldownDays: Number(config.rotationPolicy?.sameCopyCooldownDays ?? DEFAULT_COPY_WINDOW_DAYS),
    defaultCooldownHours: Number(config.rotationPolicy?.defaultCooldownHours ?? 8),
    activeAccounts: config.accounts.filter((account) => account.active).length
  };
  const accountMap = new Map(config.accounts.map((account) => [account.id, account]));
  const records = buildPostedRecords({ accountPosts, feedback, accountMap, now });
  const sameTool = buildGroupedConflicts({
    type: "same_tool",
    label: "Same tool across accounts",
    records,
    windowDays: policy.sameToolCooldownDays,
    now,
    keyForRecord: (record) => record.toolId
  });
  const sameUrl = buildGroupedConflicts({
    type: "same_url",
    label: "Same URL across accounts",
    records,
    windowDays: policy.sameToolCooldownDays,
    now,
    keyForRecord: (record) => record.urlKey
  });
  const sameCopy = buildGroupedConflicts({
    type: "same_copy",
    label: "Same copy across accounts",
    records,
    windowDays: policy.sameCopyCooldownDays,
    now,
    keyForRecord: (record) => record.copyKey
  });
  const cooldown = buildCooldownConflicts({ records, accountMap, policy, now });
  const candidateRisks = buildCandidateRisks({
    tools: latest?.tools ?? [],
    records,
    accountMap,
    policy,
    now
  });
  const blockedCandidates = candidateRisks.filter((item) => item.riskLevel === "blocked").length;
  const warningCandidates = candidateRisks.filter((item) => item.riskLevel === "warn").length;
  const totalConflicts = sameTool.length + sameUrl.length + sameCopy.length + cooldown.length;
  const status = totalConflicts || blockedCandidates ? "needs_review" : warningCandidates ? "watch" : "clear";

  return {
    version: 1,
    date,
    generatedAt: new Date().toISOString(),
    mode: "manual_conflict_radar",
    rule: "Use this as a publish-safety gate before account switching. It does not authorize or auto-post.",
    policy,
    summary: {
      recentPosts: records.length,
      trackedAccounts: new Set(records.map((record) => record.accountId).filter(Boolean)).size,
      sameToolConflicts: sameTool.length,
      sameUrlConflicts: sameUrl.length,
      sameCopyConflicts: sameCopy.length,
      cooldownConflicts: cooldown.length,
      candidateRisks: candidateRisks.length,
      blockedCandidates,
      warningCandidates,
      status
    },
    headline: conflictHeadline({ status, totalConflicts, blockedCandidates, warningCandidates }),
    actionList: conflictActions({ status, blockedCandidates, warningCandidates, sameTool, sameCopy, cooldown }),
    conflicts: {
      sameTool,
      sameUrl,
      sameCopy,
      cooldown
    },
    candidateRisks,
    safeCandidates: candidateRisks.filter((item) => item.riskLevel === "clear").slice(0, 10)
  };
}

export function renderAccountConflictRadarMarkdown(radar) {
  if (!radar) return "# Account Conflict Radar\n\nNo radar available. Run npm run conflict-radar.\n";
  return `# Account Conflict Radar - ${radar.date}

- Mode: ${radar.mode}
- Status: ${radar.summary.status}
- Recent posts: ${radar.summary.recentPosts}
- Blocked candidates: ${radar.summary.blockedCandidates}
- Warning candidates: ${radar.summary.warningCandidates}
- Same-tool conflicts: ${radar.summary.sameToolConflicts}
- Same-copy conflicts: ${radar.summary.sameCopyConflicts}
- Cooldown conflicts: ${radar.summary.cooldownConflicts}

## Headline

${radar.headline}

## Next Actions

${radar.actionList.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Candidate Risks

${radar.candidateRisks.length ? radar.candidateRisks.slice(0, 12).map(renderCandidateRiskMarkdown).join("\n\n") : "No candidate risks detected."}

## Same Tool

${radar.conflicts.sameTool.length ? radar.conflicts.sameTool.map(renderConflictMarkdown).join("\n\n") : "No same-tool cross-account conflicts."}

## Same Copy

${radar.conflicts.sameCopy.length ? radar.conflicts.sameCopy.map(renderConflictMarkdown).join("\n\n") : "No same-copy cross-account conflicts."}

## Account Cooldown

${radar.conflicts.cooldown.length ? radar.conflicts.cooldown.map(renderCooldownMarkdown).join("\n\n") : "No account cooldown conflicts."}
`;
}

function buildPostedRecords({ accountPosts, feedback, accountMap, now }) {
  const rows = [];
  const seen = new Set();
  for (const item of accountPosts.items ?? []) {
    rows.push(recordFromPost(item, accountMap, now));
  }
  for (const entry of feedback.entries ?? []) {
    if (entry.posted === false || !entry.accountId) continue;
    rows.push(recordFromPost({
      id: entry.id,
      feedbackId: entry.id,
      accountId: entry.accountId,
      accountName: entry.accountName,
      toolId: entry.toolId,
      toolName: entry.toolName,
      toolUrl: entry.toolUrl,
      variantType: entry.variantType,
      copyText: entry.copyText,
      postedUrl: entry.postedUrl,
      postedAt: entry.postedAt || entry.updatedAt || entry.createdAt,
      status: "posted"
    }, accountMap, now));
  }
  return rows
    .filter((record) => record.accountId && record.postedAt)
    .filter((record) => {
      const key = record.feedbackId || record.id || `${record.accountId}:${record.toolId}:${record.postedAt}:${record.copyKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
}

function recordFromPost(item, accountMap, now) {
  const account = accountMap.get(item.accountId);
  const toolId = item.toolId || createToolId(item.toolName, item.toolUrl);
  const postedAt = item.postedAt || item.updatedAt || item.createdAt || "";
  return {
    id: item.id || "",
    feedbackId: item.feedbackId || "",
    accountId: String(item.accountId || "").trim(),
    accountName: item.accountName || account?.displayName || item.accountId || "",
    toolId,
    toolName: item.toolName || "",
    toolUrl: item.toolUrl || "",
    urlKey: normalizeUrlKey(item.toolUrl),
    variantType: item.variantType || "shortPost",
    copyText: item.copyText || "",
    copyKey: normalizeCopyKey(item.copyText),
    postedUrl: item.postedUrl || "",
    postedAt,
    ageHours: ageHours(postedAt, now),
    ageDays: ageDays(postedAt, now)
  };
}

function buildGroupedConflicts({ type, label, records, windowDays, now, keyForRecord }) {
  const groups = new Map();
  for (const record of records) {
    if (ageDays(record.postedAt, now) > windowDays) continue;
    const key = keyForRecord(record);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => groupedConflict({ type, label, key, group, windowDays }))
    .filter(Boolean)
    .sort((a, b) => b.uniqueAccounts - a.uniqueAccounts || new Date(b.lastPostedAt).getTime() - new Date(a.lastPostedAt).getTime());
}

function groupedConflict({ type, label, key, group, windowDays }) {
  const accounts = uniqueBy(group.map((record) => ({
    accountId: record.accountId,
    accountName: record.accountName
  })), "accountId");
  if (accounts.length < 2) return null;
  const lastPostedAt = group.map((record) => record.postedAt).sort().at(-1) ?? "";
  return {
    id: createStableId("conflict", [type, key, lastPostedAt]),
    type,
    label,
    key,
    severity: type === "same_copy" || accounts.length >= 3 ? "bad" : "warn",
    windowDays,
    uniqueAccounts: accounts.length,
    posts: group.length,
    accounts,
    lastPostedAt,
    reason: `${label}: ${accounts.length} accounts used this within ${windowDays} days.`,
    examples: group.slice(0, 6).map(compactRecord)
  };
}

function buildCooldownConflicts({ records, accountMap, policy, now }) {
  const byAccount = new Map();
  for (const record of records) {
    const list = byAccount.get(record.accountId) ?? [];
    list.push(record);
    byAccount.set(record.accountId, list);
  }
  const conflicts = [];
  for (const [accountId, list] of byAccount.entries()) {
    const account = accountMap.get(accountId);
    const cooldownHours = Number(account?.cooldownHours ?? policy.defaultCooldownHours);
    const sorted = list
      .filter((record) => ageHours(record.postedAt, now) <= 48)
      .sort((a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime());
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      const spacingHours = (new Date(current.postedAt).getTime() - new Date(previous.postedAt).getTime()) / 3600000;
      if (spacingHours >= cooldownHours) continue;
      conflicts.push({
        id: createStableId("cooldown_conflict", [accountId, previous.id || previous.feedbackId, current.id || current.feedbackId]),
        type: "account_cooldown",
        label: "Account cooldown",
        severity: spacingHours < cooldownHours / 2 ? "bad" : "warn",
        accountId,
        accountName: account?.displayName || current.accountName || accountId,
        cooldownHours,
        spacingHours: round(spacingHours),
        reason: `${account?.displayName || accountId} posted again after ${round(spacingHours)}h; configured cooldown is ${cooldownHours}h.`,
        previous: compactRecord(previous),
        current: compactRecord(current)
      });
    }
  }
  return conflicts.sort((a, b) => a.spacingHours - b.spacingHours);
}

function buildCandidateRisks({ tools, records, accountMap, policy, now }) {
  return (tools ?? [])
    .slice(0, 80)
    .map((tool) => buildCandidateRisk({ tool, records, accountMap, policy, now }))
    .sort((a, b) => riskRank(b.riskLevel) - riskRank(a.riskLevel) || Number(b.score ?? 0) - Number(a.score ?? 0));
}

function buildCandidateRisk({ tool, records, accountMap, policy, now }) {
  const toolId = tool.toolId || createToolId(tool.name, tool.url);
  const accountId = tool.accountRecommendation?.primary?.accountId || "";
  const account = accountMap.get(accountId);
  const urlKey = normalizeUrlKey(tool.url);
  const copyKeys = Object.values(tool.copyVariants ?? {}).map(normalizeCopyKey).filter(Boolean);
  const toolMatches = records
    .filter((record) => ageDays(record.postedAt, now) <= policy.sameToolCooldownDays)
    .filter((record) => record.toolId === toolId || (urlKey && record.urlKey === urlKey));
  const copyMatches = records
    .filter((record) => ageDays(record.postedAt, now) <= policy.sameCopyCooldownDays)
    .filter((record) => record.copyKey && copyKeys.includes(record.copyKey));
  const lastAccountPost = accountId
    ? records.find((record) => record.accountId === accountId)
    : null;
  const accountCooldownHours = Number(account?.cooldownHours ?? policy.defaultCooldownHours);
  const accountCooling = lastAccountPost && ageHours(lastAccountPost.postedAt, now) < accountCooldownHours;
  const reasons = [];

  if (toolMatches.length) {
    reasons.push(`Same tool/URL posted within ${policy.sameToolCooldownDays}d by ${uniqueAccountNames(toolMatches).join(" / ")}.`);
  }
  if (copyMatches.length) {
    reasons.push(`Same copy already used within ${policy.sameCopyCooldownDays}d.`);
  }
  if (accountCooling) {
    reasons.push(`${account?.displayName || accountId} is still cooling down: ${round(ageHours(lastAccountPost.postedAt, now))}h/${accountCooldownHours}h.`);
  }
  if (!reasons.length && tool.seenBefore) {
    reasons.push("Seen before in history; okay for long-form/watch, weaker for paid publish.");
  }

  const riskLevel = toolMatches.length || copyMatches.length || accountCooling
    ? "blocked"
    : tool.seenBefore ? "warn" : "clear";

  return {
    toolId,
    toolName: tool.name || "",
    toolUrl: tool.url || "",
    score: tool.score ?? 0,
    accountId,
    accountName: account?.displayName || accountId || "",
    followUpAction: tool.followUpAction || "",
    riskLevel,
    reasons,
    conflictCount: toolMatches.length + copyMatches.length + (accountCooling ? 1 : 0),
    lastMatchingPosts: [...toolMatches, ...copyMatches].slice(0, 5).map(compactRecord),
    recommendation: candidateRecommendation(riskLevel)
  };
}

function compactRecord(record) {
  return {
    accountId: record.accountId,
    accountName: record.accountName,
    toolId: record.toolId,
    toolName: record.toolName,
    toolUrl: record.toolUrl,
    variantType: record.variantType,
    postedAt: record.postedAt,
    ageHours: round(record.ageHours)
  };
}

function conflictHeadline({ status, blockedCandidates, warningCandidates }) {
  if (status === "needs_review") return `${blockedCandidates} candidates should stay out of ready because conflict risk exists. Clear duplicates before scaling.`;
  if (status === "watch") return `${warningCandidates} candidates need manual review, but no hard duplicate conflict was found.`;
  return "No active account conflict found. Keep manual confirmation and feedback gates on.";
}

function conflictActions({ status, blockedCandidates, warningCandidates, sameTool, sameCopy, cooldown }) {
  if (status === "clear") {
    return [
      "Use the normal final review queue.",
      "Keep one tool assigned to one account during the cooldown window.",
      "Mark every manual post with accountId so the radar stays useful."
    ];
  }
  const actions = [];
  if (blockedCandidates) actions.push(`Hold ${blockedCandidates} candidate${blockedCandidates === 1 ? "" : "s"} that collide with recent posts.`);
  if (sameTool.length) actions.push("Do not post the same tool or URL across accounts inside the same-tool cooldown window.");
  if (sameCopy.length) actions.push("Rewrite or discard exact-copy repeats before using another account.");
  if (cooldown.length) actions.push("Respect account cooldown before the next manual confirmation.");
  if (warningCandidates) actions.push(`Review ${warningCandidates} seen-before candidate${warningCandidates === 1 ? "" : "s"} manually.`);
  return actions.slice(0, 5);
}

function candidateRecommendation(riskLevel) {
  if (riskLevel === "blocked") return "Hold for review; do not put this in ready publish queue.";
  if (riskLevel === "warn") return "Manual review only; better for watch/thread/review than paid publish.";
  return "No account conflict found; still requires manual final confirmation.";
}

function renderCandidateRiskMarkdown(item) {
  return `### ${item.toolName}
- Risk: ${item.riskLevel}
- Account: ${item.accountName || item.accountId || "no account"}
- Recommendation: ${item.recommendation}
${item.reasons.length ? item.reasons.map((reason) => `- ${reason}`).join("\n") : "- No conflict reason."}`;
}

function renderConflictMarkdown(item) {
  return `### ${item.label}
- Severity: ${item.severity}
- Accounts: ${item.accounts.map((account) => account.accountName || account.accountId).join(" / ")}
- Reason: ${item.reason}
- Last posted: ${item.lastPostedAt}`;
}

function renderCooldownMarkdown(item) {
  return `### ${item.accountName}
- Severity: ${item.severity}
- Spacing: ${item.spacingHours}h / ${item.cooldownHours}h
- Reason: ${item.reason}`;
}

function normalizeUrlKey(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    url.hash = "";
    url.search = "";
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return text.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

function normalizeCopyKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ageHours(value, now) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - date.getTime()) / 3600000);
}

function ageDays(value, now) {
  return ageHours(value, now) / 24;
}

function uniqueAccountNames(records) {
  return uniqueBy(records.map((record) => ({
    accountId: record.accountId,
    accountName: record.accountName
  })), "accountId")
    .map((account) => account.accountName || account.accountId);
}

function uniqueBy(items, key) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const value = item[key];
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(item);
  }
  return output;
}

function riskRank(value) {
  return { clear: 0, warn: 1, blocked: 2 }[value] ?? 0;
}

function round(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 10) / 10;
}
