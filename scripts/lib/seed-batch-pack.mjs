const ROWS_PER_ACCOUNT = 10;
const MIN_SEED_IMPORTABLE = 3;

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

export function buildSeedImportReadiness({ seedBatchPack = null, previews = [] }) {
  const seedAccounts = seedBatchPack?.rowsByAccount ?? [];
  const previewByAccount = new Map();
  for (const preview of previews) {
    const accountId = preview.candidate?.accountId || preview.accountId || "";
    if (!accountId) continue;
    const current = previewByAccount.get(accountId) ?? { parsed: 0, importable: 0, review: 0, skipped: 0 };
    current.parsed += 1;
    if (preview.importDecision === "import") current.importable += 1;
    if (preview.importDecision === "review") current.review += 1;
    if (preview.importDecision === "skip") current.skipped += 1;
    previewByAccount.set(accountId, current);
  }

  const accounts = seedAccounts.map((account) => {
    const counts = previewByAccount.get(account.accountId) ?? { parsed: 0, importable: 0, review: 0, skipped: 0 };
    const targetImportable = Math.min(MIN_SEED_IMPORTABLE, Math.max(1, Number(account.missingDrafts || MIN_SEED_IMPORTABLE)));
    const remaining = Math.max(0, targetImportable - counts.importable);
    const status = counts.importable >= targetImportable
      ? "ready_to_seed"
      : counts.importable + counts.review >= targetImportable || counts.importable > 0
        ? "needs_review"
        : "not_ready";
    return {
      accountId: account.accountId,
      displayName: account.displayName,
      targetImportable,
      parsed: counts.parsed,
      importable: counts.importable,
      review: counts.review,
      skipped: counts.skipped,
      remaining,
      status,
      reason: seedReadinessReason({ account, counts, targetImportable, remaining, status })
    };
  });

  return {
    targetImportablePerAccount: MIN_SEED_IMPORTABLE,
    summary: {
      accounts: accounts.length,
      ready: accounts.filter((account) => account.status === "ready_to_seed").length,
      review: accounts.filter((account) => account.status === "needs_review").length,
      notReady: accounts.filter((account) => account.status === "not_ready").length,
      importable: accounts.reduce((sum, account) => sum + account.importable, 0),
      parsed: accounts.reduce((sum, account) => sum + account.parsed, 0)
    },
    accounts
  };
}

export function buildSeedImportNextActions({ imported = 0, skipped = 0, errors = [], importMode = "recommended", seedImportReadiness = null } = {}) {
  const readiness = seedImportReadiness ?? { summary: {}, accounts: [] };
  const readyAccounts = (readiness.accounts ?? []).filter((account) => account.status === "ready_to_seed");
  const reviewAccounts = (readiness.accounts ?? []).filter((account) => account.status === "needs_review");
  const notReadyAccounts = (readiness.accounts ?? []).filter((account) => account.status === "not_ready");
  const hasSeedRows = Number(readiness.summary?.parsed ?? 0) > 0
    || (readiness.accounts ?? []).some((account) => Number(account.parsed ?? 0) > 0);
  const actions = [];

  if (imported > 0) {
    actions.push({
      type: "refresh_daily",
      label: "刷新 Live Feed",
      tone: "good",
      detail: `${imported} candidates imported. Refresh daily scoring so they enter account matching, final review, and copy planning.`
    });
  }

  if (hasSeedRows && readyAccounts.length) {
    actions.push({
      type: "open_final_review",
      label: "打开发布审核",
      tone: "good",
      detail: `${readyAccounts.length} seed account${readyAccounts.length === 1 ? "" : "s"} now have enough importable candidates for a small manual test. Refresh first, then review the 3 safest posts.`
    });
  }

  if (hasSeedRows && reviewAccounts.length) {
    actions.push({
      type: "review_seed_rows",
      label: "复核边界候选",
      tone: "warn",
      detail: `${reviewAccounts.map((account) => account.displayName).slice(0, 3).join(", ")} still need manual review rows fixed or replaced.`
    });
  }

  if (hasSeedRows && notReadyAccounts.length) {
    actions.push({
      type: "continue_seed_pack",
      label: "继续补 Seed CSV",
      tone: "warn",
      detail: `${notReadyAccounts.map((account) => `${account.displayName} -${account.remaining}`).slice(0, 3).join(", ")} need more importable candidates before scale testing.`
    });
  }

  if (imported === 0) {
    actions.push({
      type: "fix_candidates",
      label: "修正候选质量",
      tone: "bad",
      detail: `No candidates were imported in ${importMode} mode. Add real URLs, narrower buyer pain, and fresher source detail before importing again.`
    });
  }

  if (Number(skipped) > 0 || errors.length) {
    actions.push({
      type: "check_skipped_rows",
      label: "检查跳过行",
      tone: Number(imported) > 0 ? "neutral" : "warn",
      detail: `${skipped} skipped by scoring/duplicate rules${errors.length ? `, ${errors.length} parser errors` : ""}. Keep skips out unless they are clearly useful.`
    });
  }

  return actions.slice(0, 5);
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

function seedReadinessReason({ account, counts, targetImportable, remaining, status }) {
  if (status === "ready_to_seed") return `${account.displayName} has ${counts.importable}/${targetImportable} importable candidates. Enough for a small manual seed test.`;
  if (status === "needs_review") return `${account.displayName} has ${counts.importable} importable and ${counts.review} review candidates; fix or approve ${remaining} more.`;
  return `${account.displayName} still needs ${remaining} importable candidates before seed testing.`;
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
