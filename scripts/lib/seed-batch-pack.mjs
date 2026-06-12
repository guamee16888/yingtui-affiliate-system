const ROWS_PER_ACCOUNT = 10;

export function buildSeedBatchPack({ date, scaleRampPlan = null, rowsPerAccount = ROWS_PER_ACCOUNT, csvPath = "", guidePath = "" }) {
  const accounts = scaleRampPlan?.startAccounts ?? [];
  const rows = accounts.flatMap((account) => seedRowsForAccount({ account, date, rowsPerAccount }));
  const rowsByAccount = accounts.map((account) => ({
    accountId: account.accountId,
    displayName: account.displayName,
    launchStage: account.launchStage,
    readinessScore: account.readinessScore,
    rows: rows.filter((row) => row.accountId === account.accountId).length,
    missingDrafts: account.missing?.drafts ?? 0,
    missingFresh: account.missing?.fresh ?? 0,
    firstSearchUrl: account.searchTasks?.[0]?.url ?? ""
  }));

  return {
    version: 1,
    date,
    generatedAt: new Date().toISOString(),
    mode: "manual_research_seed_batch",
    summary: {
      accounts: accounts.length,
      rows: rows.length,
      rowsPerAccount,
      rowsNeedingResearch: rows.filter((row) => !row.name || !row.url || !row.tagline).length,
      csvPath,
      guidePath,
      safeTestPosts: scaleRampPlan?.summary?.safeTestPosts ?? 0
    },
    rowsByAccount,
    firstBatch: rowsByAccount.map((item) => ({
      accountId: item.accountId,
      displayName: item.displayName,
      instruction: `Fill ${item.rows} real candidates for ${item.displayName}; import only rows with a real URL, narrow buyer, and clear pain.`
    })),
    rows
  };
}

export function seedBatchRowsToCsv(rows) {
  const headers = ["seedId", "accountId", "accountName", "priority", "name", "url", "tagline", "source", "circle", "candidateType", "sourceUrl", "published", "researchProvider", "researchQuery", "researchUrl", "acceptanceChecklist", "notes"];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header] ?? "")).join(","))
  ].join("\n");
}

export function renderSeedBatchPackMarkdown(pack) {
  if (!pack) return "# Seed Batch Pack\n\nNo seed batch pack available. Run npm run seed-pack.\n";
  return `# Seed Batch Pack - ${pack.date}

- Accounts: ${pack.summary.accounts}
- Rows: ${pack.summary.rows}
- Safe test posts now: ${pack.summary.safeTestPosts}
- CSV: ${pack.summary.csvPath || "not written"}

## First Batch

${pack.firstBatch.length ? pack.firstBatch.map((item) => `- ${item.displayName}: ${item.instruction}`).join("\n") : "- No seed accounts available."}

## Account Rows

${pack.rowsByAccount.length ? pack.rowsByAccount.map((item) => `- ${item.displayName}: ${item.rows} rows, missing drafts ${item.missingDrafts}, missing fresh ${item.missingFresh}${item.firstSearchUrl ? `\n  ${item.firstSearchUrl}` : ""}`).join("\n") : "- No rows."}

Rules:
- Fill name, url, and tagline before importing.
- Leave weak rows blank.
- Keep accountId/accountName columns for your own tracking; the candidate importer will ignore extra columns safely.
- Do not import placeholder or fake URLs.
- After importing, rerun npm run daily, then check Scale ramp plan again.
`;
}

function seedRowsForAccount({ account, date, rowsPerAccount }) {
  const tasks = account.searchTasks?.length ? account.searchTasks : fallbackSearchTasks(account);
  return Array.from({ length: rowsPerAccount }, (_, index) => {
    const task = tasks[index % tasks.length];
    const circle = circleForAccount(account);
    return {
      seedId: [date || "today", account.accountId, String(index + 1).padStart(3, "0")].join("-"),
      accountId: account.accountId,
      accountName: account.displayName,
      priority: index < 3 ? "P1" : index < 7 ? "P2" : "P3",
      name: "",
      url: "",
      tagline: "",
      source: "seed_batch_pack",
      circle,
      candidateType: index % 3 === 0 ? "topic" : "product",
      sourceUrl: task.url,
      published: date,
      researchProvider: task.provider,
      researchQuery: task.query,
      researchUrl: task.url,
      acceptanceChecklist: acceptanceChecklistForCircle(circle),
      notes: `Account: ${account.displayName} | Fill only if fresh, specific, and useful for this account.`
    };
  });
}

function circleForAccount(account) {
  const text = `${account.accountId ?? ""} ${account.displayName ?? ""} ${account.category ?? ""}`.toLowerCase();
  if (text.includes("crypto")) return "crypto_builders";
  if (text.includes("saas")) return "saas_founders";
  if (text.includes("indie")) return "indie_hackers";
  return "ai_startups";
}

function acceptanceChecklistForCircle(circle) {
  if (circle === "crypto_builders") return "real URL | builder/tool angle | not price-only | clear audience | fresh enough";
  if (circle === "saas_founders") return "real URL | SaaS founder pain | pricing/growth/ops angle | fresh enough";
  if (circle === "indie_hackers") return "real URL | indie/solo founder angle | concrete build or monetization lesson";
  return "real URL | AI/startup/tool angle | clear buyer pain | not broad hype";
}

function fallbackSearchTasks(account) {
  const query = `${account.displayName} ${account.category ?? ""} tools founder workflow`.trim();
  return [
    {
      provider: "X live search",
      query,
      url: `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`
    },
    {
      provider: "Google recent search",
      query,
      url: `https://www.google.com/search?q=${encodeURIComponent(`${query} after:2026-01-01`)}`
    }
  ];
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
