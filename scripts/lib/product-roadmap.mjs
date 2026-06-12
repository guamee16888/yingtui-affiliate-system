import { realAffiliateLinks } from "./affiliate-links.mjs";

export function buildProductRoadmap({
  date,
  latest = null,
  feedback = { entries: [] },
  queues = { items: [] },
  affiliateResearch = { items: [] },
  accountPosts = { items: [] },
  affiliateLinks = { links: [] },
  contentCalendar = null,
  sourceImportPack = null,
  affiliateWorkbench = null,
  publicDemoReady = false
}) {
  const dimensions = [
    accountSwitchingDimension(latest, accountPosts),
    contentSupplyDimension(latest, sourceImportPack),
    contentCalendarDimension(contentCalendar ?? latest?.contentCalendar),
    feedbackLoopDimension(feedback, accountPosts),
    affiliateMonetizationDimension(latest, affiliateResearch, affiliateLinks, affiliateWorkbench),
    sourceDiversityDimension(latest),
    qualitySafetyDimension(latest),
    longformEngineDimension(queues, latest),
    publicProductDimension(publicDemoReady)
  ];
  const nonDeferred = dimensions.filter((item) => item.status !== "deferred");
  const overallScore = Math.round(nonDeferred.reduce((sum, item) => sum + item.score, 0) / Math.max(1, nonDeferred.length));
  const blockers = nonDeferred
    .filter((item) => item.score < 70)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  return {
    date,
    generatedAt: new Date().toISOString(),
    objective: "Product-grade multi-account X content ops system with review-first publishing.",
    overallScore,
    level: readinessLevel(overallScore),
    summary: {
      dimensions: dimensions.length,
      blockers: blockers.length,
      deferred: dimensions.filter((item) => item.status === "deferred").length,
      nextSprintItems: blockers.length
    },
    dimensions,
    topBlockers: blockers.map((item) => ({
      id: item.id,
      name: item.name,
      score: item.score,
      whyItMatters: item.whyItMatters,
      nextAction: item.nextActions[0] ?? ""
    })),
    nextSprint: blockers.flatMap((item) => item.nextActions.slice(0, 2)).slice(0, 8),
    productPrinciples: [
      "Quality gates beat volume targets.",
      "Every paid or API publish action must remain manually confirmed.",
      "One candidate should not be sprayed across accounts.",
      "Feedback should decide what gets repeated, expanded, or monetized.",
      "No fake affiliate links, fake earnings claims, or invented facts."
    ]
  };
}

export function renderProductRoadmapMarkdown(roadmap) {
  if (!roadmap) return "# Product Roadmap\n\nNo roadmap available. Run npm run roadmap.\n";

  return `# Product Roadmap - ${roadmap.date}

- Objective: ${roadmap.objective}
- Overall score: ${roadmap.overallScore}/100
- Level: ${roadmap.level}
- Blockers: ${roadmap.summary.blockers}
- Deferred: ${roadmap.summary.deferred}

## Top Blockers

${roadmap.topBlockers.length ? roadmap.topBlockers.map((item, index) => `${index + 1}. ${item.name} — ${item.score}/100
   Why it matters: ${item.whyItMatters}
   Next: ${item.nextAction}`).join("\n") : "No major blockers."}

## Next Sprint

${roadmap.nextSprint.length ? roadmap.nextSprint.map((item, index) => `${index + 1}. ${item}`).join("\n") : "No sprint items generated."}

## Dimensions

${roadmap.dimensions.map(renderDimension).join("\n\n")}

## Product Principles

${roadmap.productPrinciples.map((item) => `- ${item}`).join("\n")}
`;
}

function accountSwitchingDimension(latest, accountPosts) {
  const activeAccounts = Number(latest?.accountStrategy?.summary?.activeAccounts ?? 0);
  const accountsWithPosts = new Set((accountPosts.items ?? []).map((item) => item.accountId).filter(Boolean)).size;
  const score = activeAccounts ? Math.min(45, 15 + accountsWithPosts * 5) : 0;

  return dimension({
    id: "account_switching",
    name: "X account switching and binding",
    score,
    status: "deferred",
    whyItMatters: "The project has account profiles, but real multi-account OAuth switching is intentionally deferred.",
    evidence: [
      `${activeAccounts} active account profiles configured.`,
      `${accountsWithPosts} accounts have local post records.`
    ],
    gaps: [
      "Need account selector enforcement at publish time.",
      "Need per-account OAuth binding and token health checks before real switching.",
      "Need same-tool cooldown across accounts before any scale-up."
    ],
    nextActions: [
      "Keep account switching as a separate safety-gated milestone.",
      "Do not build unattended multi-account publishing until feedback and quality gates are real."
    ]
  });
}

function contentSupplyDimension(latest, sourceImportPack) {
  const target = Number(latest?.draftPlan?.summary?.targetPosts ?? latest?.supplyPlan?.targetDrafts ?? 0);
  const planned = Number(latest?.draftPlan?.summary?.plannedPosts ?? 0);
  const qualified = Number(latest?.supplyPlan?.qualifiedTools ?? 0);
  const sourceGap = Number(latest?.sourceQualityQueue?.summary?.totalNeededCandidates ?? 0);
  const importRows = Number(sourceImportPack?.summary?.totalRows ?? 0);
  const importRowsNeedingResearch = Number(sourceImportPack?.summary?.rowsNeedingResearch ?? 0);
  const score = Math.min(100, percent(planned, target) + (importRows ? 5 : 0));

  return dimension({
    id: "content_supply",
    name: "Daily high-quality content supply",
    score,
    whyItMatters: "20 accounts need a real candidate pipeline; weak or repeated posts will hurt the whole system.",
    evidence: [
      `${planned}/${target} planned unique drafts.`,
      `${qualified} qualified tools.`,
      `${sourceGap} source candidates needed by the queue.`,
      importRows ? `${importRows} source-pack rows generated, ${importRowsNeedingResearch} still need real candidates.` : "No source import pack generated yet."
    ],
    gaps: [
      planned < target ? `Need ${target - planned} more unique drafts for the current target.` : "",
      sourceGap > 0 ? "Need more manual/imported sources from AI startup, indie, SaaS, and crypto circles." : ""
    ].filter(Boolean),
    nextActions: [
      "Run npm run source-queue and fill the largest circle gap first.",
      importRows ? "Fill the generated source-pack rows, preview scoring, then import only candidates with a clear buyer, pain, and URL." : "Run npm run source-pack and import only candidates with a clear buyer, pain, and URL."
    ]
  });
}

function contentCalendarDimension(calendar) {
  const target = Number(calendar?.summary?.targetPosts ?? 0);
  const scheduled = Number(calendar?.summary?.scheduledPosts ?? 0);
  const capacityGap = Number(calendar?.summary?.capacityGap ?? 0);
  const draftGap = Number(calendar?.summary?.draftGap ?? 0);
  const score = calendar ? Math.min(percent(scheduled, target), capacityGap ? 45 : 100) : 0;

  return dimension({
    id: "content_calendar",
    name: "Account-level content calendar",
    score,
    whyItMatters: "A daily target is not real until it fits account cooldowns and human review time.",
    evidence: calendar ? [
      `${scheduled}/${target} posts scheduled into review slots.`,
      `${capacityGap} slots impossible under current cooldown settings.`,
      `${draftGap} drafts missing.`
    ] : ["No content calendar has been generated yet."],
    gaps: [
      capacityGap > 0 ? "Current cooldown settings cannot fit the configured daily target." : "",
      draftGap > 0 ? "Not enough drafts to fill the calendar." : ""
    ].filter(Boolean),
    nextActions: [
      "Run npm run content-calendar after every daily generation.",
      capacityGap > 0 ? "Lower per-account daily targets or reduce cooldown hours before scaling." : "Review scheduled slots before publishing."
    ]
  });
}

function feedbackLoopDimension(feedback, accountPosts) {
  const entries = feedback.entries ?? [];
  const posted = entries.filter((item) => item.posted);
  const measured = posted.filter((item) => Number(item.metrics?.impressions ?? 0) > 0);
  const accountsWithPosts = new Set((accountPosts.items ?? []).map((item) => item.accountId).filter(Boolean)).size;
  const score = posted.length ? Math.round((measured.length / posted.length) * 100) : 0;

  return dimension({
    id: "feedback_loop",
    name: "Feedback learning loop",
    score,
    whyItMatters: "The system cannot learn angles, accounts, or topics until posted content gets metrics back into JSON.",
    evidence: [
      `${posted.length} posted feedback rows.`,
      `${measured.length} rows have impressions.`,
      `${accountsWithPosts} accounts have post records.`
    ],
    gaps: [
      posted.length ? "" : "No posted feedback rows yet.",
      posted.length && measured.length < posted.length ? `${posted.length - measured.length} posted rows still need metrics.` : ""
    ].filter(Boolean),
    nextActions: [
      "Mark every manual post as posted with accountId.",
      "Paste X Analytics export into feedback import after posts have data."
    ]
  });
}

function affiliateMonetizationDimension(latest, affiliateResearch, affiliateLinks, affiliateWorkbench) {
  const queueCount = Number(latest?.summary?.affiliateQueueCount ?? latest?.affiliateResearchQueue?.length ?? 0);
  const links = realAffiliateLinks(affiliateLinks);
  const researchItems = affiliateResearch.items ?? [];
  const approved = researchItems.filter((item) => item.status === "approved" || item.affiliateLink).length;
  const workbenchCandidates = Number(affiliateWorkbench?.summary?.candidates ?? 0);
  const readyToConfigure = Number(affiliateWorkbench?.summary?.readyToConfigure ?? 0);
  const score = Math.min(100, links.length * 15 + approved * 20 + (researchItems.length ? 20 : 0) + (affiliateWorkbench ? 5 : 0) + readyToConfigure * 15);

  return dimension({
    id: "affiliate_monetization",
    name: "Affiliate monetization readiness",
    score,
    whyItMatters: "Traffic without real affiliate programs becomes vanity; fake links or unverified claims are worse.",
    evidence: [
      `${links.length} configured affiliate links.`,
      `${researchItems.length} affiliate research records.`,
      `${queueCount} current high-affiliate candidates.`,
      affiliateWorkbench ? `${workbenchCandidates} candidates in affiliate research workbench.` : "Affiliate research workbench has not been generated."
    ],
    gaps: [
      queueCount > 0 ? "High-affiliate candidates still need program research." : "",
      links.length ? "" : "No configured affiliate links detected."
    ].filter(Boolean),
    nextActions: [
      affiliateWorkbench ? "Use the Affiliate research workbench and save real program findings." : "Run npm run affiliate:research to generate the research workbench.",
      "Only move approved real links into config/affiliate-links.json."
    ]
  });
}

function sourceDiversityDimension(latest) {
  const breakdown = latest?.source?.breakdown ?? {};
  const enabled = Number(breakdown.enabledExtraSources ?? 0);
  const sourceCandidates = Number(breakdown.sourceCandidateTools ?? 0);
  const inbox = Number(breakdown.candidateInboxTools ?? 0);
  const sourceHealth = latest?.sourceHealth?.summary ?? {};
  const healthySources = Number(sourceHealth.healthySources ?? 0);
  const tuneSources = Number(sourceHealth.tuneSources ?? 0);
  const disableCandidates = Number(sourceHealth.disableCandidates ?? 0);
  const score = Math.max(0, Math.min(100, enabled * 12 + healthySources * 14 + sourceCandidates + inbox - disableCandidates * 12 - tuneSources * 4));

  return dimension({
    id: "source_diversity",
    name: "Source diversity",
    score,
    whyItMatters: "A multi-account system needs more than one launch feed, especially for SaaS, indie, and crypto angles.",
    evidence: [
      `${enabled} enabled extra sources.`,
      `${sourceCandidates} source candidates in the daily merge.`,
      `${inbox} candidate inbox items in the daily merge.`,
      `${healthySources} healthy sources, ${tuneSources} tune sources, ${disableCandidates} disable candidates.`
    ],
    gaps: [
      enabled < 6 ? "Need more reliable sources beyond Product Hunt and two RSS feeds." : "",
      sourceCandidates + inbox < 100 ? "Need a larger manual/imported candidate bench." : "",
      tuneSources || disableCandidates ? "Some sources need filter tuning before scaling." : ""
    ].filter(Boolean),
    nextActions: [
      "Run npm run source-health and fix the worst source first.",
      "Add source packs by circle instead of turning on noisy feeds blindly.",
      "Keep disabled sources disabled until they prove they produce useful candidates."
    ]
  });
}

function qualitySafetyDimension(latest) {
  const warnings = latest?.warnings ?? [];
  const freshness = latest?.freshnessReport?.stats ?? {};
  const freshPostCandidates = Number(freshness.topPickFreshPostCandidates ?? 0);
  const score = Math.max(35, 85 - warnings.length * 10 - (freshPostCandidates ? 0 : 15));

  return dimension({
    id: "quality_safety",
    name: "Quality and safety gates",
    score,
    whyItMatters: "The system is valuable only if it protects account quality, avoids fake claims, and blocks stale posts.",
    evidence: [
      `${warnings.length} generation warnings.`,
      `${freshPostCandidates} fresh publish candidates.`,
      "Manual-confirm publishing is the default mode."
    ],
    gaps: [
      freshPostCandidates ? "" : "No fresh publish candidates in the latest run.",
      warnings.length ? "Resolve generation warnings before publishing." : ""
    ].filter(Boolean),
    nextActions: [
      "Keep Fresh today/Fresh 48h as the paid publish gate.",
      "Add fact-check notes for topic/news-style candidates before scaling."
    ]
  });
}

function longformEngineDimension(queues, latest) {
  const items = queues.items ?? [];
  const review = items.filter((item) => item.type === "review_page").length;
  const thread = items.filter((item) => item.type === "thread").length;
  const active = items.filter((item) => item.status !== "done" && item.status !== "skipped").length;
  const promotionReady = Number(latest?.promotionReview?.summary?.readyToQueue ?? 0);
  const score = Math.min(100, active * 10 + review * 15 + thread * 10 + promotionReady * 5);

  return dimension({
    id: "longform_engine",
    name: "Thread and SEO review engine",
    score,
    whyItMatters: "The compounding upside is not one-off tweets; it is threads, review pages, and affiliate pages from proven winners.",
    evidence: [
      `${thread} thread queue items.`,
      `${review} review page queue items.`,
      `${active} active follow-up items.`,
      `${promotionReady} promotion review items are ready to queue.`
    ],
    gaps: [
      active ? "" : "No active follow-up queue items.",
      promotionReady ? "Promotion review has ready items that still need manual queue approval." : "",
      review ? "" : "No review page candidates have been promoted into the queue."
    ].filter(Boolean),
    nextActions: [
      promotionReady ? "Open Promotion review and manually queue the ready items." : "Promote posts with bookmarks/replies into thread or review_page queue.",
      "Generate review outlines only after the tool has signal or clear affiliate fit."
    ]
  });
}

function publicProductDimension(publicDemoReady) {
  return dimension({
    id: "public_product",
    name: "Public product surface",
    score: publicDemoReady ? 82 : 75,
    whyItMatters: "The public repo and Vercel demo help people understand the product and contact you.",
    evidence: [
      "README has product positioning and contact.",
      "Vercel static dashboard is deployable.",
      publicDemoReady ? "Public demo banner explains local-only actions." : "Public demo banner is not detected."
    ],
    gaps: [
      publicDemoReady ? "" : "Need demo-mode labels so visitors understand what is local-only.",
      "Need screenshots/GIFs to make the public repo easier to judge quickly."
    ].filter(Boolean),
    nextActions: publicDemoReady
      ? ["Add screenshots/GIFs to README after the UI stabilizes."]
      : [
        "Add a public demo banner explaining local-only actions.",
        "Add screenshots/GIFs to README after the UI stabilizes."
      ]
  });
}

function dimension({ id, name, score, status = null, whyItMatters, evidence, gaps, nextActions }) {
  return {
    id,
    name,
    score,
    status: status ?? scoreStatus(score),
    whyItMatters,
    evidence,
    gaps: gaps.length ? gaps : ["No major gap detected."],
    nextActions
  };
}

function renderDimension(item) {
  return `### ${item.name}

- Score: ${item.score}/100
- Status: ${item.status}
- Why it matters: ${item.whyItMatters}
- Evidence: ${item.evidence.join(" ")}
- Gaps: ${item.gaps.join(" ")}
- Next: ${item.nextActions.join(" ")}`;
}

function percent(value, total) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(value || 0) / Number(total)) * 100)));
}

function scoreStatus(score) {
  if (score >= 80) return "good";
  if (score >= 50) return "watch";
  return "blocked";
}

function readinessLevel(score) {
  if (score >= 85) return "product-ready";
  if (score >= 65) return "operator-ready";
  if (score >= 40) return "structured-mvp";
  return "prototype";
}
