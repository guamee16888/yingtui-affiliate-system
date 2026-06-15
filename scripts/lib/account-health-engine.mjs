const DEFAULT_RULES = {
  maxExternalLinksPerAccountDay: 1,
  maxSameToolPerAccount7d: 1,
  maxSameDomainPerAccount7d: 1
};

export function calculateAccountHealth({
  account = {},
  tasks = [],
  ledger = [],
  feedback = [],
  contentRules = {}
} = {}) {
  const rules = { ...DEFAULT_RULES, ...(contentRules.rules ?? contentRules ?? {}) };
  const accountId = account.accountId || account.id || "";
  const accountTasks = tasks.filter((task) => belongsToAccount(task, accountId));
  const accountLedger = ledger.filter((entry) => belongsToAccount(entry, accountId));
  const accountFeedback = feedback.filter((entry) => belongsToAccount(entry, accountId));
  const riskFlags = [];
  const explanations = [];
  let score = 72;

  const status = String(account.status || "").toLowerCase();
  if (["paused", "restricted", "suspended"].includes(status)) {
    riskFlags.push(status === "paused" ? "account_paused" : "account_restricted");
    explanations.push(status === "paused" ? "账号已暂停，健康度直接进入 paused。" : "账号状态受限，健康度进入 risky。");
    return {
      healthScore: status === "paused" ? 0 : 25,
      healthStatus: status === "paused" ? "paused" : "risky",
      riskFlags,
      explanations
    };
  }

  const feedbackDebt = accountTasks.filter((task) => {
    const taskStatus = task.status || "";
    return ["posted", "feedback_due", "copied"].includes(taskStatus) && !hasUsableMetrics(task.metrics);
  }).length;
  if (feedbackDebt) {
    const penalty = Math.min(24, feedbackDebt * 6);
    score -= penalty;
    riskFlags.push("feedback_debt");
    explanations.push(`反馈欠账 ${feedbackDebt} 条，扣 ${penalty} 分。`);
  }

  const postedCount = accountLedger.length || accountTasks.filter((task) => task.postedAt || task.status === "posted").length;
  const externalLinkCount = countExternalLinks([...accountLedger, ...accountTasks]);
  const linkLimit = Number(account.externalLinkLimit || rules.maxExternalLinksPerAccountDay || 1);
  if (externalLinkCount > Math.max(1, linkLimit)) {
    const penalty = Math.min(18, (externalLinkCount - linkLimit) * 5);
    score -= penalty;
    riskFlags.push("external_link_ratio_high");
    explanations.push(`外链数量 ${externalLinkCount} 超过账号限制 ${linkLimit}，扣 ${penalty} 分。`);
  }
  if (postedCount > 0 && externalLinkCount / postedCount > 0.65) {
    score -= 8;
    riskFlags.push("external_link_ratio_high");
    explanations.push("近期发布中过半包含外链，额外扣 8 分。");
  }

  const repeatedToolCount = countRepeatedValues(accountLedger.map((entry) => entry.toolId).filter(Boolean));
  if (repeatedToolCount > Number(rules.maxSameToolPerAccount7d || 1)) {
    const penalty = Math.min(12, repeatedToolCount * 4);
    score -= penalty;
    riskFlags.push("same_tool_repeated");
    explanations.push(`重复工具出现 ${repeatedToolCount} 次，扣 ${penalty} 分。`);
  }

  const repeatedDomainCount = countRepeatedValues(accountLedger.flatMap((entry) => domainsFromLinks(entry.externalLinks ?? [entry.toolUrl, entry.postedUrl])));
  if (repeatedDomainCount > Number(rules.maxSameDomainPerAccount7d || 1)) {
    const penalty = Math.min(12, repeatedDomainCount * 4);
    score -= penalty;
    riskFlags.push("same_domain_repeated");
    explanations.push(`重复 domain 出现 ${repeatedDomainCount} 次，扣 ${penalty} 分。`);
  }

  if (postedCount >= 3 && feedbackDebt === 0) {
    score += 8;
    explanations.push("近期有稳定发布且无反馈欠账，加 8 分。");
  }
  if (accountFeedback.some((entry) => hasUsableMetrics(entry.metrics))) {
    score += 6;
    explanations.push("已有有效反馈指标，加 6 分。");
  }

  const healthScore = clamp(Math.round(score), 0, 100);
  const healthStatus = healthScore >= 75
    ? "healthy"
    : healthScore >= 55
      ? "watch"
      : healthScore > 0
        ? "risky"
        : "paused";

  if (!explanations.length) explanations.push("暂无明显风险，保持人工审核和反馈回填。");

  return {
    healthScore,
    healthStatus,
    riskFlags: [...new Set(riskFlags)],
    explanations
  };
}

function belongsToAccount(item, accountId) {
  if (!accountId) return false;
  return item?.accountId === accountId || item?.xAccountId === accountId;
}

function hasUsableMetrics(metrics = {}) {
  return Object.values(metrics || {}).some((value) => Number(value || 0) > 0);
}

function countExternalLinks(items = []) {
  return items.reduce((total, item) => total + (item.externalLinks?.length || domainsFromLinks([item.toolUrl, item.postedUrl]).length), 0);
}

function countRepeatedValues(values = []) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.values()].filter((count) => count > 1).reduce((total, count) => total + count, 0);
}

function domainsFromLinks(links = []) {
  return links
    .filter(Boolean)
    .map((link) => {
      try {
        return new URL(link).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
