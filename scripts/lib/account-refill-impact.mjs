export function buildAccountRefillImpact({
  accountRefillWorkbench = null,
  previews = [],
  importMode = "recommended"
} = {}) {
  const accounts = accountRefillWorkbench?.accounts ?? [];
  if (!accounts.length) return null;

  const countsByAccount = new Map();
  for (const preview of previews) {
    const accountId = preview.candidate?.accountId || preview.accountId || "";
    if (!accountId) continue;
    const counts = countsByAccount.get(accountId) ?? {
      parsed: 0,
      accepted: 0,
      importable: 0,
      review: 0,
      skipped: 0
    };
    counts.parsed += 1;
    if (preview.importDecision === "import") counts.importable += 1;
    if (preview.importDecision === "review") counts.review += 1;
    if (preview.importDecision === "skip") counts.skipped += 1;
    if (isAcceptedByMode(preview.importDecision, importMode)) counts.accepted += 1;
    countsByAccount.set(accountId, counts);
  }

  const impactedAccounts = accounts
    .filter((account) => countsByAccount.has(account.accountId))
    .map((account) => impactAccount(account, countsByAccount.get(account.accountId), importMode))
    .sort((a, b) => impactPriority(b) - impactPriority(a) || a.displayName.localeCompare(b.displayName));

  if (!impactedAccounts.length) {
    return {
      status: "no_account_rows",
      importMode,
      summary: {
        accountsTouched: 0,
        accountsImproved: 0,
        accountsCovered: 0,
        acceptedCandidates: 0,
        importableRows: 0,
        reviewRows: 0,
        skippedRows: 0,
        refillNeedBefore: 0,
        projectedRefillNeedAfter: 0
      },
      accounts: [],
      nextActions: [{
        type: "continue_refill",
        label: "继续用账号补题模板",
        tone: "warn",
        detail: "This paste did not include accountId rows from the account refill workbench, so account-level supply impact cannot be calculated."
      }]
    };
  }

  const summary = {
    accountsTouched: impactedAccounts.length,
    accountsImproved: impactedAccounts.filter((account) => account.accepted > 0).length,
    accountsCovered: impactedAccounts.filter((account) => account.status === "covered").length,
    acceptedCandidates: impactedAccounts.reduce((sum, account) => sum + account.accepted, 0),
    importableRows: impactedAccounts.reduce((sum, account) => sum + account.importable, 0),
    reviewRows: impactedAccounts.reduce((sum, account) => sum + account.review, 0),
    skippedRows: impactedAccounts.reduce((sum, account) => sum + account.skipped, 0),
    refillNeedBefore: impactedAccounts.reduce((sum, account) => sum + account.refillNeedBefore, 0),
    projectedRefillNeedAfter: impactedAccounts.reduce((sum, account) => sum + account.projectedRefillNeedAfter, 0)
  };

  return {
    status: impactStatus(summary),
    importMode,
    summary,
    accounts: impactedAccounts,
    nextActions: impactNextActions(summary, impactedAccounts)
  };
}

function impactAccount(account, counts, importMode) {
  const refillNeedBefore = Number(account.refillNeed ?? 0);
  const accepted = Number(counts.accepted ?? 0);
  const projectedRefillNeedAfter = Math.max(0, refillNeedBefore - accepted);
  const status = accountImpactStatus({
    refillNeedBefore,
    projectedRefillNeedAfter,
    accepted,
    review: counts.review,
    skipped: counts.skipped
  });

  return {
    accountId: account.accountId,
    displayName: account.displayName,
    category: account.category,
    status,
    tone: statusTone(status),
    importMode,
    refillNeedBefore,
    projectedRefillNeedAfter,
    delta: refillNeedBefore - projectedRefillNeedAfter,
    parsed: counts.parsed,
    accepted,
    importable: counts.importable,
    review: counts.review,
    skipped: counts.skipped,
    firstBottleneck: account.firstBottleneck ?? "",
    actionDetail: impactReason({ status, account, counts, accepted, projectedRefillNeedAfter })
  };
}

function isAcceptedByMode(decision, importMode) {
  if (decision === "import") return true;
  return importMode === "all" && decision === "review";
}

function accountImpactStatus({ refillNeedBefore, projectedRefillNeedAfter, accepted, review, skipped }) {
  if (refillNeedBefore > 0 && projectedRefillNeedAfter === 0) return "covered";
  if (accepted > 0) return "improved";
  if (review > 0) return "needs_review";
  if (skipped > 0) return "not_moved";
  return "unchanged";
}

function impactStatus(summary) {
  if (summary.accountsCovered > 0) return "covered_accounts";
  if (summary.accountsImproved > 0) return "improved";
  if (summary.reviewRows > 0) return "needs_review";
  return "not_moved";
}

function impactReason({ status, account, counts, accepted, projectedRefillNeedAfter }) {
  if (status === "covered") return `${account.displayName} has enough accepted rows to cover the current refill need. Refresh daily next.`;
  if (status === "improved") return `${accepted} accepted row${accepted === 1 ? "" : "s"} reduce projected refill need to ${projectedRefillNeedAfter}.`;
  if (status === "needs_review") return `${counts.review} row${counts.review === 1 ? "" : "s"} need a stronger URL, audience, pain, or freshness angle before import.`;
  if (status === "not_moved") return "Rows were parsed but skipped by duplicate or quality rules; this account's refill need did not improve.";
  return "No account-level movement yet.";
}

function impactNextActions(summary, accounts) {
  const actions = [];
  if (summary.acceptedCandidates > 0) {
    actions.push({
      type: "refresh_daily",
      label: "刷新 Live Feed",
      tone: "good",
      detail: `${summary.acceptedCandidates} accepted account refill row${summary.acceptedCandidates === 1 ? "" : "s"} can now enter scoring, routing, draft planning, and the account matrix.`
    });
  }

  if (summary.reviewRows > 0) {
    actions.push({
      type: "fix_candidates",
      label: "修正黄灯候选",
      tone: "warn",
      detail: `${summary.reviewRows} account refill row${summary.reviewRows === 1 ? "" : "s"} need manual fixes before they should count toward supply.`
    });
  }

  const remaining = accounts
    .filter((account) => account.projectedRefillNeedAfter > 0)
    .slice(0, 3);
  if (remaining.length) {
    actions.push({
      type: "continue_refill",
      label: "继续补账号缺口",
      tone: "warn",
      detail: remaining.map((account) => `${account.displayName} -${account.projectedRefillNeedAfter}`).join(", ")
    });
  }

  return actions.slice(0, 4);
}

function statusTone(status) {
  return {
    covered: "good",
    improved: "good",
    needs_review: "warn",
    not_moved: "bad",
    unchanged: "neutral"
  }[status] ?? "neutral";
}

function impactPriority(account) {
  return account.delta * 100
    + (account.status === "covered" ? 50 : 0)
    + (account.review > 0 ? 10 : 0)
    - account.projectedRefillNeedAfter;
}
