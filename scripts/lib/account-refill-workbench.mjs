import { accountRefillRowsToCsv } from "./account-content-matrix.mjs";

const DEFAULT_FOCUS_LIMIT = 5;

export function buildAccountRefillWorkbench({
  date,
  accountContentMatrix = null,
  focusLimit = DEFAULT_FOCUS_LIMIT
}) {
  const accounts = accountContentMatrix?.inventory?.accounts ?? [];
  const refillAccounts = accounts
    .map(normalizeRefillAccount)
    .filter((account) => account.refillNeed > 0 || account.postableToday > 0)
    .sort((a, b) => refillPriority(b) - refillPriority(a) || a.displayName.localeCompare(b.displayName));
  const focusAccounts = refillAccounts.slice(0, focusLimit);
  const totalRefillNeed = refillAccounts.reduce((total, account) => total + account.refillNeed, 0);
  const searchUrlCount = new Set(refillAccounts.flatMap((account) => account.searchUrls)).size;

  return {
    version: 1,
    date,
    generatedAt: new Date().toISOString(),
    status: totalRefillNeed ? "needs_refill" : "covered",
    rule: "Fill only real name/url/tagline rows. Blank rows are skipped by candidate import; do not invent candidates to hit volume.",
    summary: {
      activeAccounts: Number(accountContentMatrix?.summary?.activeAccounts ?? accounts.length),
      targetDailyPosts: Number(accountContentMatrix?.summary?.targetDailyPosts ?? 0),
      readyAccounts: Number(accountContentMatrix?.summary?.readyAccounts ?? 0),
      focusAccounts: focusAccounts.length,
      refillAccounts: refillAccounts.filter((account) => account.refillNeed > 0).length,
      totalRefillNeed,
      postableToday: Number(accountContentMatrix?.inventory?.summary?.postableToday ?? 0),
      contentBlockedAccounts: Number(accountContentMatrix?.inventory?.summary?.contentBlockedAccounts ?? 0),
      feedbackBlockedAccounts: Number(accountContentMatrix?.inventory?.summary?.feedbackBlockedAccounts ?? 0),
      searchUrlCount
    },
    workflow: [
      "Open the search group for the top account.",
      "Collect only real tools or topics with a URL, a clear audience, and one narrow pain.",
      "Use Fill candidate inbox to paste the account CSV template.",
      "Fill name/url/tagline for good rows; leave weak rows blank.",
      "Preview scoring, import only qualified rows, then rerun daily."
    ],
    focusAccounts,
    accounts: refillAccounts,
    notes: [
      "This is a supply workbench, not a publishing permission.",
      "A higher refillNeed means the account lacks drafts, fresh items, quality, or candidate bench depth.",
      "Feedback-blocked accounts still need metrics before scale, even if they have enough content."
    ]
  };
}

export function renderAccountRefillWorkbenchMarkdown(workbench) {
  if (!workbench) return "# Account Refill Workbench\n\nNo workbench data available. Run npm run account-matrix first.\n";
  return `# Account Refill Workbench - ${workbench.date}

- Status: ${workbench.status}
- Active accounts: ${workbench.summary.activeAccounts}
- Target posts: ${workbench.summary.targetDailyPosts}/day
- Focus accounts: ${workbench.summary.focusAccounts}
- Refill accounts: ${workbench.summary.refillAccounts}
- Total refill need: ${workbench.summary.totalRefillNeed}
- Search URLs: ${workbench.summary.searchUrlCount}

## Rule

${workbench.rule}

## Workflow

${workbench.workflow.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Today Focus

${workbench.focusAccounts.length ? workbench.focusAccounts.map((account, index) => renderFocusAccount(account, index)).join("\n\n") : "No refill accounts today."}

## Notes

${workbench.notes.map((note) => `- ${note}`).join("\n")}
`;
}

function renderFocusAccount(account, index) {
  return `### ${index + 1}. ${account.displayName}

- Status: ${account.statusLabel}
- Action: ${account.actionLabel}
- Refill need: ${account.refillNeed}
- Postable today: ${account.postableToday}/${account.targetPosts}
- First bottleneck: ${account.firstBottleneck || "none"}
- Search links:
${account.searchLinks.map((link) => `  - ${link.provider}: ${link.url}`).join("\n") || "  - none"}

CSV template:

\`\`\`csv
${account.csv}
\`\`\``;
}

function normalizeRefillAccount(account) {
  const rows = account.refillTemplate?.rows ?? [];
  const searchLinks = uniqueSearchLinks(rows);
  return {
    accountId: account.accountId,
    displayName: account.displayName,
    category: account.category,
    status: account.status,
    statusLabel: account.statusLabel,
    actionLabel: account.actionLabel,
    actionDetail: account.actionDetail,
    actionPriority: Number(account.actionPriority ?? 0),
    readinessScore: Number(account.readinessScore ?? 0),
    targetPosts: Number(account.targetPosts ?? 0),
    postableToday: Number(account.postableToday ?? 0),
    refillNeed: Number(account.refillNeed ?? 0),
    firstBottleneck: account.firstBottleneck ?? "",
    bottlenecks: account.bottlenecks ?? [],
    contentBlocked: Boolean(account.contentBlocked),
    feedbackBlocked: Boolean(account.feedbackBlocked),
    searchLinks,
    searchUrls: searchLinks.map((link) => link.url),
    csv: rows.length ? accountRefillRowsToCsv(rows) : "",
    csvRows: rows.length
  };
}

function uniqueSearchLinks(rows) {
  const seen = new Set();
  const links = [];
  for (const row of rows) {
    const url = row.researchUrl || row.sourceUrl;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    links.push({
      provider: row.researchProvider || "Search",
      query: row.researchQuery || "",
      url
    });
  }
  return links;
}

function refillPriority(account) {
  return account.actionPriority
    + account.refillNeed * 2
    + account.postableToday
    + account.readinessScore / 100;
}
