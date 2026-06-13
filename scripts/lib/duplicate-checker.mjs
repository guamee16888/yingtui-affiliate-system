import { hashText, normalizeText, similarityScore } from "./text-normalizer.mjs";
import { normalizeDomain, normalizeUrl } from "./url-utils.mjs";
import { ACTIVE_TASK_STATUSES, DEFAULT_CONTENT_RULES } from "./core-data.mjs";

const DAY_MS = 86400000;

export function checkToolDuplicate({ tool, tools = [], history = { tools: [] } }) {
  const flags = [];
  const toolId = tool?.toolId;
  const domain = tool?.domain || normalizeDomain(tool?.officialUrl || tool?.url || tool?.toolUrl);
  if (toolId && tools.some((item) => item.toolId === toolId)) {
    flags.push(flag("tool_seen_before", "这个工具已经在中心化工具池里存在。", "warn"));
  }
  if (domain && tools.some((item) => item.domain === domain && item.toolId !== toolId)) {
    flags.push(flag("domain_seen_before", "同一个 domain 已经存在其他工具记录，建议人工合并。", "warn"));
  }
  if ((history.tools ?? []).some((item) => item.toolId === toolId || normalizeDomain(item.url) === domain)) {
    flags.push(flag("history_seen_before", "这个工具或 domain 已经在历史记录里出现过。", "warn"));
  }
  return result(flags);
}

export function checkTopicDuplicate({ topic, topics = [], tasks = [], ledger = [] }) {
  const flags = [];
  if (topics.some((item) => item.topicId === topic.topicId)) {
    flags.push(flag("topic_seen_before", "这个选题角度已经存在。", "warn"));
  }
  const activeSameTopic = tasks.some((task) => isActive(task) && task.topicId === topic.topicId);
  if (activeSameTopic) flags.push(flag("topic_active_task", "这个选题角度已经有活跃任务。", "block"));
  const usedSameTopic = ledger.some((item) => item.topicId === topic.topicId);
  if (usedSameTopic) flags.push(flag("topic_used", "这个选题角度已经发布过。", "warn"));
  return result(flags);
}

export function checkCopyDuplicate({ copy, copyLibrary = [], tasks = [], ledger = [], contentRules = DEFAULT_CONTENT_RULES }) {
  const flags = [];
  const normalizedHash = copy.normalizedTextHash || hashText(copy.copyText);
  const normalized = copy.normalizedText || normalizeText(copy.copyText);
  const minDistance = Number(contentRules.rules?.minTextSimilarityDistance ?? DEFAULT_CONTENT_RULES.rules.minTextSimilarityDistance);
  const maxSimilarity = 1 - minDistance;

  if (ledger.some((item) => item.normalizedTextHash === normalizedHash || normalizeText(item.postedText) === normalized)) {
    flags.push(flag("copy_duplicate", "这条文案已经被发布过。", "block"));
  }
  if (tasks.some((task) => isActive(task) && task.copyId === copy.copyId)) {
    flags.push(flag("copy_active_task", "同一个 copyId 已经分配给其他活跃任务。", "block"));
  }

  const recentTexts = [
    ...ledger.map((item) => item.postedText),
    ...copyLibrary.filter((item) => item.copyId !== copy.copyId).map((item) => item.copyText)
  ].filter(Boolean);
  if (!flags.some((item) => item.severity === "block")) {
    const similar = recentTexts.find((text) => similarityScore(copy.copyText, text) >= maxSimilarity);
    if (similar) flags.push(flag("copy_too_similar", "这条文案和近期文案相似度偏高，建议改写。", "warn"));
  }

  return result(flags);
}

export function checkAccountRisk({ account, task, tasks = [], ledger = [], accountHealth = [], contentRules = DEFAULT_CONTENT_RULES }) {
  const flags = [];
  const rules = mergedRules(contentRules);
  const status = account?.status || (account?.active === false ? "paused" : "active");
  if (["paused", "restricted", "archived"].includes(status)) {
    flags.push(flag("account_not_active", "这个账号不是 active 状态，不能分配或发布任务。", "block"));
  }
  const accountId = task.accountId || account?.accountId || account?.id;
  const today = task.date || new Date().toISOString().slice(0, 10);
  const todayTasks = tasks.filter((item) => item.accountId === accountId && item.date === today && isActive(item));
  const todayLedger = ledger.filter((item) => item.accountId === accountId && sameDay(item.postedAt, today));
  const dailyLimit = Number(account?.dailyPostLimit ?? rules.defaultDailyPostLimit ?? 1);
  if (todayTasks.length + todayLedger.length >= dailyLimit) {
    flags.push(flag("account_daily_limit", "这个账号今天的任务/发布数已经达到上限。", "block"));
  }
  const linkLimit = Number(account?.externalLinkLimit ?? rules.maxExternalLinksPerAccountDay);
  const todayLinks = todayLedger.reduce((sum, item) => sum + (item.externalLinks ?? []).length, 0) + (extractTaskLinks(task).length ? 1 : 0);
  if (todayLinks > linkLimit) {
    flags.push(flag("account_link_limit", "这个账号今天外链数已经超过限制。", "block"));
  }
  if (ledger.some((item) => item.accountId === accountId && item.toolId === task.toolId && daysBetween(item.postedAt, today) <= 7)) {
    flags.push(flag("account_same_tool_7d", "这个账号 7 天内已经发过同一个工具。", "block"));
  }
  const taskDomain = normalizeDomain(task.toolUrl || task.url);
  if (taskDomain && ledger.some((item) => item.accountId === accountId && ledgerDomain(item) === taskDomain && daysBetween(item.postedAt, today) <= 7)) {
    flags.push(flag("account_same_domain_7d", "这个账号 7 天内已经发过同一个 domain。", "block"));
  }
  const health = accountHealth.find((item) => item.accountId === accountId && item.date === today);
  if (health?.duplicateRisk === "high") flags.push(flag("account_duplicate_risk", "这个账号当前重复风险较高。", "warn"));
  return result(flags);
}

export function checkEmployeeRisk({ user, task, tasks = [], ledger = [], contentRules = DEFAULT_CONTENT_RULES }) {
  const flags = [];
  const rules = mergedRules(contentRules);
  const userId = task.assignedTo || user?.userId;
  const today = task.date || new Date().toISOString().slice(0, 10);
  const sameToolTasks = tasks.filter((item) => item.assignedTo === userId && item.date === today && item.toolId === task.toolId && isActive(item));
  if (sameToolTasks.length >= Number(rules.maxSameToolPerEmployeeDay)) {
    flags.push(flag("employee_same_tool_day", "这个员工今天已经拿到太多同一个工具的任务。", "warn"));
  }
  const sameEmployeeTexts = tasks
    .filter((item) => item.assignedTo === userId && item.date === today && isActive(item))
    .map((item) => item.copyText)
    .filter(Boolean);
  if (sameEmployeeTexts.some((text) => similarityScore(text, task.copyText) >= 0.8)) {
    flags.push(flag("employee_similar_copy_day", "这个员工今天已有相似文案任务。", "warn"));
  }
  if (ledger.filter((item) => item.employeeId === userId && sameDay(item.postedAt, today)).length > 30) {
    flags.push(flag("employee_large_daily_volume", "这个员工今天发布量偏高，建议主管复核。", "warn"));
  }
  return result(flags);
}

export function checkLinkRisk({ links = [], task, tasks = [], ledger = [], contentRules = DEFAULT_CONTENT_RULES }) {
  const flags = [];
  const rules = mergedRules(contentRules);
  const today = task.date || new Date().toISOString().slice(0, 10);
  for (const link of links.map(normalizeUrl).filter(Boolean)) {
    const dailyUses = ledger.filter((item) => sameDay(item.postedAt, today) && (item.externalLinks ?? []).map(normalizeUrl).includes(link)).length;
    if (dailyUses >= Number(rules.maxSameDomainPerDayGlobal)) {
      flags.push(flag("link_global_daily_limit", "同一个外链今天全局使用次数过高。", "block"));
    }
  }
  if (task.affiliateLinkUsed) {
    const affiliateUses = ledger.filter((item) => sameDay(item.postedAt, today) && normalizeUrl(item.affiliateLinkUsed) === normalizeUrl(task.affiliateLinkUsed)).length;
    if (affiliateUses >= Number(rules.maxAffiliateLinkPerDayGlobal)) {
      flags.push(flag("affiliate_link_global_limit", "同一个 affiliate link 今日全局使用超过上限。", "block"));
    }
  }
  const taskDomain = normalizeDomain(links[0] || task.toolUrl || task.url);
  if (taskDomain) {
    const domainUses = [
      ...ledger.filter((item) => sameDay(item.postedAt, today) && ledgerDomain(item) === taskDomain),
      ...tasks.filter((item) => item.taskId !== task.taskId && item.date === today && isActive(item) && normalizeDomain(item.toolUrl) === taskDomain)
    ].length;
    if (domainUses >= Number(rules.maxSameDomainPerDayGlobal)) {
      flags.push(flag("domain_global_daily_limit", "同一个 domain 今天全局出现次数偏高。", "warn"));
    }
  }
  return result(flags);
}

export function checkTaskDuplicateRisk({ task, context }) {
  const contentRules = context.contentRules ?? DEFAULT_CONTENT_RULES;
  const account = (context.xAccounts ?? []).find((item) => [item.accountId, item.id].includes(task.accountId));
  const user = (context.users ?? []).find((item) => item.userId === task.assignedTo);
  const copy = (context.copyLibrary ?? []).find((item) => item.copyId === task.copyId) ?? task;
  const links = task.externalLinks?.length ? task.externalLinks : extractTaskLinks(task);
  const checks = [
    checkCopyDuplicate({ copy, copyLibrary: context.copyLibrary ?? [], tasks: context.tasks ?? [], ledger: context.ledger ?? [], contentRules }),
    checkAccountRisk({ account, task, tasks: context.tasks ?? [], ledger: context.ledger ?? [], accountHealth: context.accountHealth ?? [], contentRules }),
    checkEmployeeRisk({ user, task, tasks: context.tasks ?? [], ledger: context.ledger ?? [], contentRules }),
    checkLinkRisk({ links, task, tasks: context.tasks ?? [], ledger: context.ledger ?? [], contentRules })
  ];
  if (task.approvalStatus !== "approved" && ["assigned", "copied", "posted"].includes(task.status)) {
    checks.push(result([flag("task_not_approved", "任务没有 approved，不能进入 assigned/copied/posted。", "block")]));
  }
  return mergeResults(checks);
}

function mergedRules(contentRules) {
  return {
    ...DEFAULT_CONTENT_RULES.rules,
    ...(contentRules.rules ?? contentRules ?? {})
  };
}

function result(flags) {
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
    recommendation: riskLevel === "block" ? "block" : riskLevel === "medium" ? "revise" : "approve"
  };
}

function mergeResults(results) {
  return result(results.flatMap((item) => item.flags ?? []));
}

function flag(type, message, severity) {
  return { type, message, severity };
}

function isActive(task) {
  return ACTIVE_TASK_STATUSES.has(task.status);
}

function sameDay(value, day) {
  return String(value ?? "").slice(0, 10) === day;
}

function daysBetween(value, day) {
  const date = new Date(value);
  const target = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.abs(target.getTime() - date.getTime()) / DAY_MS;
}

function ledgerDomain(item) {
  return normalizeDomain(item.externalLinks?.[0] || item.toolUrl || item.postedUrl || "");
}

function extractTaskLinks(task) {
  return task.externalLinks ?? String(task.copyText ?? "").match(/https?:\/\/[^\s)]+/gi) ?? [];
}
