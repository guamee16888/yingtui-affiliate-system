import { DEFAULT_CONTENT_RULES } from "./core-data.mjs";
import { checkTaskDuplicateRisk } from "./duplicate-checker.mjs";
import { analyzeTweetLength } from "./tweet-length.mjs";
import { normalizeDomain, normalizeUrl } from "./url-utils.mjs";

const AUTO_ALLOWED_TASK_STATUSES = new Set(["approved", "assigned", "scheduled", "copied"]);

export function resolvePublishMode({ task = {}, account = {}, workspace = {}, settings = {} }) {
  return normalizeMode(task.publishMode)
    || normalizeMode(account.publishMode)
    || normalizeMode(workspace.publishMode)
    || normalizeMode(settings.defaultPublishMode)
    || "manual";
}

export function evaluatePublishSafety({
  task = null,
  account = null,
  workspace = null,
  connection = null,
  settings = {},
  tasks = [],
  ledger = [],
  xAccounts = [],
  users = [],
  accountHealth = [],
  copyLibrary = [],
  contentRules = DEFAULT_CONTENT_RULES,
  now = new Date(),
  live = false
}) {
  const flags = [];
  if (!task) {
    return safetyResult([flag("missing_task", "Task does not exist.", "block")]);
  }

  const publishMode = resolvePublishMode({ task, account, workspace, settings });
  const tweetLengthStatus = analyzeTweetLength(task.copyText || task.tweetText || "");
  const duplicateCheckResult = checkTaskDuplicateRisk({
    task,
    context: {
      tasks: tasks.filter((item) => item.taskId !== task.taskId),
      ledger,
      xAccounts,
      users,
      accountHealth,
      copyLibrary,
      contentRules
    }
  });

  if (!account) flags.push(flag("missing_account", "Account does not exist.", "block"));
  if (account && accountStatus(account) !== "active") flags.push(flag("account_not_active", "Account is not active.", "block"));
  if (!connection || connection.status !== "connected") flags.push(flag("x_not_connected", "X account connection is not connected.", "block"));
  if ((settings.requireApprovalBeforePublish ?? true) && task.approvalStatus !== "approved") {
    flags.push(flag("task_not_approved", "Task is not approved.", "block"));
  }
  if (!AUTO_ALLOWED_TASK_STATUSES.has(task.status)) {
    flags.push(flag("task_status_not_publishable", `Task status ${task.status || "unknown"} cannot be auto published.`, "block"));
  }
  if (!tweetLengthStatus.fitsXPost) {
    flags.push(flag("tweet_over_280", `Tweet is ${tweetLengthStatus.weightedCharCount}/280 weighted characters.`, "block"));
  }
  if (duplicateCheckResult.riskLevel === "block") {
    for (const item of duplicateCheckResult.flags ?? []) flags.push(flag(item.type, item.message || item.type, "block"));
  } else if (duplicateCheckResult.riskLevel === "medium") {
    for (const item of duplicateCheckResult.flags ?? []) flags.push(flag(item.type, item.message || item.type, "warn"));
  }
  if (publishMode === "manual") flags.push(flag("manual_mode", "Task/account/workspace publish mode is manual.", live ? "block" : "warn"));
  if (!allowedModes(settings).includes(publishMode)) {
    flags.push(flag("publish_mode_not_allowed", `Publish mode ${publishMode} is not allowed by publish settings.`, "block"));
  }
  if (publishMode === "auto" && !settings.globalAutoPublishEnabled) {
    flags.push(flag("global_auto_disabled", "Global auto publish is disabled.", "block"));
  }
  if (live && !settings.globalAutoPublishEnabled) {
    flags.push(flag("live_publish_disabled", "Live publish requires globalAutoPublishEnabled=true.", "block"));
  }
  if (task.autoPublishEnabled === false || account?.autoPublishEnabled === false || workspace?.autoPublishEnabled === false) {
    flags.push(flag("auto_disabled_scope", "Auto publish is disabled on task, account, or workspace.", "block"));
  }
  if (task.postedAt || ["posted", "feedback_due"].includes(task.status)) {
    flags.push(flag("task_already_posted", "Task is already posted or waiting for feedback.", "block"));
  }
  if (ledger.some((item) => item.taskId === task.taskId)) {
    flags.push(flag("ledger_has_task", "Post ledger already has this taskId.", "block"));
  }
  if (task.affiliateLinkUsed && /example\.com|your-id|your_ref|placeholder/i.test(task.affiliateLinkUsed)) {
    flags.push(flag("fake_affiliate_link", "Affiliate link looks fake or placeholder.", "block"));
  }
  if (workspace && task.laneId && Array.isArray(workspace.enabledLaneIds) && !workspace.enabledLaneIds.includes(task.laneId)) {
    flags.push(flag("lane_not_enabled", "Workspace does not enable this task lane.", "block"));
  }

  addLimitFlags({ flags, task, account, settings, tasks, ledger, now });

  return safetyResult(flags, {
    publishMode,
    duplicateCheckResult,
    tweetLengthStatus
  });
}

function addLimitFlags({ flags, task, account, settings, tasks, ledger, now }) {
  if (!account) return;
  const accountId = account.accountId || account.id;
  const today = now.toISOString().slice(0, 10);
  const postedToday = ledger.filter((item) => item.accountId === accountId && String(item.postedAt || "").slice(0, 10) === today);
  const activeToday = tasks.filter((item) => item.taskId !== task.taskId && item.accountId === accountId && item.date === today && ["assigned", "scheduled", "approved"].includes(item.status));
  const maxPosts = Number(settings.maxPostsPerAccountPerDay ?? account.dailyPostLimit ?? 1);
  if (postedToday.length + activeToday.length >= maxPosts) {
    flags.push(flag("account_daily_limit", `Account reached publish limit (${postedToday.length + activeToday.length}/${maxPosts}).`, "block"));
  }

  const taskLinks = extractLinks(task);
  const externalLinksToday = postedToday.reduce((sum, item) => sum + (item.externalLinks ?? []).length, 0) + taskLinks.length;
  const maxLinks = Number(settings.maxExternalLinksPerAccountPerDay ?? account.externalLinkLimit ?? 1);
  if (externalLinksToday > maxLinks) {
    flags.push(flag("account_external_link_limit", `Account external link limit exceeded (${externalLinksToday}/${maxLinks}).`, "block"));
  }

  const maxSameTool = Number(settings.maxSameToolPerDayGlobal ?? 3);
  if (task.toolId && ledger.filter((item) => item.toolId === task.toolId && String(item.postedAt || "").slice(0, 10) === today).length >= maxSameTool) {
    flags.push(flag("same_tool_global_limit", "Same tool global daily limit reached.", "block"));
  }

  const taskDomain = normalizeDomain(task.toolUrl || taskLinks[0] || "");
  const maxSameDomain = Number(settings.maxSameDomainPerDayGlobal ?? 5);
  if (taskDomain) {
    const sameDomain = ledger.filter((item) => String(item.postedAt || "").slice(0, 10) === today && normalizeDomain(item.externalLinks?.[0] || item.toolUrl || item.postedUrl || "") === taskDomain);
    if (sameDomain.length >= maxSameDomain) flags.push(flag("same_domain_global_limit", "Same domain global daily limit reached.", "block"));
  }

  const maxAffiliate = Number(settings.maxAffiliateLinksPerDayGlobal ?? 3);
  if (task.affiliateLinkUsed) {
    const sameAffiliate = ledger.filter((item) => String(item.postedAt || "").slice(0, 10) === today && normalizeUrl(item.affiliateLinkUsed) === normalizeUrl(task.affiliateLinkUsed));
    if (sameAffiliate.length >= maxAffiliate) flags.push(flag("affiliate_global_limit", "Affiliate link global daily limit reached.", "block"));
  }
}

function safetyResult(flags, extra = {}) {
  const riskLevel = flags.some((item) => item.severity === "block")
    ? "block"
    : flags.some((item) => item.severity === "high")
      ? "high"
      : flags.some((item) => item.severity === "warn")
        ? "medium"
        : "low";
  return {
    ok: riskLevel !== "block",
    riskLevel,
    flags,
    canPublish: riskLevel !== "block",
    recommendation: riskLevel === "block" ? "block" : riskLevel === "medium" ? "review" : "publish",
    ...extra
  };
}

function allowedModes(settings) {
  return Array.isArray(settings.allowedPublishModes) ? settings.allowedPublishModes : ["manual", "scheduled"];
}

function normalizeMode(value) {
  const mode = String(value || "").trim();
  return ["manual", "scheduled", "auto"].includes(mode) ? mode : "";
}

function accountStatus(account) {
  return account.status || (account.active === false ? "paused" : "active");
}

function extractLinks(task) {
  return task.externalLinks ?? String(task.copyText || task.tweetText || "").match(/https?:\/\/[^\s)]+/gi) ?? [];
}

function flag(type, message, severity) {
  return { type, message, severity };
}
