import {
  loadAccountPosts,
  loadCandidateInbox,
  loadAffiliateLinks,
  loadAffiliateResearch,
  loadFeedback,
  loadHistoryData,
  loadLatest,
  loadQueues,
  loadReviewPages,
  loadVoiceConfig,
  loadXAccountsConfig
} from "../storage/interface.mjs";
import { buildPromotionSuggestions } from "../promotion-engine.mjs";
import { readJson } from "../file-store.mjs";
import { buildWeeklyReport } from "../weekly-report.mjs";
import { buildDecisionReport } from "../decision-engine.mjs";
import { buildFeedbackOps, buildLearningLoop } from "../feedback-ops.mjs";
import { loadLocalEnv } from "../env.mjs";
import { todayString } from "../ids.mjs";
import { findAccountById, normalizeAccountConfig } from "../account-system.mjs";
import { getAccountXPublishStatus, getXPublishStatus } from "../x-publish.mjs";
import { loadStaffSummary } from "../staff-system.mjs";
import { loadManagerSummary } from "../manager-system.mjs";
import {
  loadPublishSummary,
  loadXConnectionsSummary
} from "../publish-engine.mjs";
import { PUBLISH_FILES, loadPublishCollection, loadPublishSettings } from "../publish-data.mjs";
import { loadCandidateSummary, loadLaneSummary, loadSourceLaneData } from "../source-lanes.mjs";
import { loadWorkspaceSummary } from "../workspace-system.mjs";
import { getAppStorageMode } from "../app-storage-mode.mjs";
import { loadSourceNetworkConfig } from "../source-network.mjs";

export async function handleDashboardApiGet(url) {
  const pathname = url.pathname;
  if (pathname === "/api/storage-mode") return { mode: getAppStorageMode(), d1Bound: false };
  guardD1ReservedRoute(pathname);
  if (pathname === "/api/latest") return loadLatest();
  if (pathname === "/api/staff/summary") return loadStaffSummary({
    workspaceId: url.searchParams.get("workspaceId") || "",
    userId: url.searchParams.get("userId") || ""
  });
  if (pathname === "/api/manager/summary") return loadManagerSummary({
    workspaceId: url.searchParams.get("workspaceId") || "",
    managerUserId: url.searchParams.get("managerUserId") || ""
  });
  if (pathname === "/api/publish/settings") return loadPublishSettings();
  if (pathname === "/api/publish/jobs") return filteredPublishJobs(url.searchParams.get("workspaceId") || "");
  if (pathname === "/api/publish/summary") return loadPublishSummary({ workspaceId: url.searchParams.get("workspaceId") || "" });
  if (pathname === "/api/workspaces") return (await loadSourceLaneData()).workspaces;
  if (pathname === "/api/workspace/summary") return loadWorkspaceSummary();
  if (pathname === "/api/lanes") return (await loadSourceLaneData()).contentLanes;
  if (pathname === "/api/lanes/summary") return loadLaneSummary();
  if (pathname === "/api/candidates") return (await loadSourceLaneData()).rawCandidates;
  if (pathname === "/api/candidates/summary") return loadCandidateSummary();
  if (pathname === "/api/source-runs") return (await loadSourceLaneData()).sourceRuns;
  if (pathname === "/api/x/connections") return loadXConnectionsSummary();
  if (pathname === "/api/history") return loadHistoryData();
  if (pathname === "/api/candidate-inbox") return loadCandidateInbox();
  if (pathname === "/api/feedback") return loadFeedback();
  if (pathname === "/api/account-posts") return loadAccountPosts();
  if (pathname === "/api/affiliate-links") return loadAffiliateLinks();
  if (pathname === "/api/queues") return loadQueues();
  if (pathname === "/api/review-pages") return loadReviewPages();
  if (pathname === "/api/affiliate-research") return loadAffiliateResearch();
  if (pathname === "/api/affiliate-research-workbench") return readJson("data/affiliate-research-workbench.json", null);
  if (pathname === "/api/product-roadmap") return readJson("data/product-roadmap.json", null);
  if (pathname === "/api/scale-readiness") return readJson("data/scale-readiness.json", null);
  if (pathname === "/api/scale-ramp-plan") return readJson("data/scale-ramp-plan.json", null);
  if (pathname === "/api/seed-batch-pack") return readJson("data/seed-batch-pack.json", null);
  if (pathname === "/api/content-ops-plan") return readJson("data/content-ops-plan.json", null);
  if (pathname === "/api/account-content-matrix") return readJson("data/account-content-matrix.json", null);
  if (pathname === "/api/account-refill-workbench") return readJson("data/account-refill-workbench.json", null);
  if (pathname === "/api/account-conflict-radar") return readJson("data/account-conflict-radar.json", null);
  if (pathname === "/api/supply-gap-filler") return readJson("data/supply-gap-filler.json", null);
  if (pathname === "/api/source-network") return sourceNetworkPayload();
  if (pathname === "/api/content-calendar") {
    const latest = await loadLatest();
    return await readJson("data/content-calendar/latest.json", latest?.contentCalendar ?? null);
  }
  if (pathname === "/api/source-import-pack") return readJson("data/source-import-pack/latest.json", null);
  if (pathname === "/api/settings") return settingsPayload();
  if (pathname === "/api/weekly-summary") return weeklySummaryPayload();
  if (pathname === "/api/decision-report") return decisionReportPayload();
  if (pathname === "/api/feedback-ops") return feedbackOpsPayload();
  if (pathname === "/api/learning-loop") return learningLoopPayload();
  if (pathname === "/api/x/status") return xStatusWithAccounts();
  throw new Error(`Unknown API route: ${pathname}`);
}

export function guardD1ReservedRoute(pathname) {
  if (getAppStorageMode() !== "d1") return;
  if (pathname.startsWith("/api/manager") || pathname.startsWith("/api/staff")) {
    throw new Error("APP_STORAGE_MODE=d1 is reserved for app.guamee.org D1 MVP. This local server has no D1 binding yet; keep APP_STORAGE_MODE=json for the current dashboard.");
  }
}

export function defaultGlobalPublishAccountId(accountConfig) {
  const configuredId = String(process.env.X_DEFAULT_ACCOUNT_ID || "").trim();
  if (configuredId) {
    const account = findAccountById(accountConfig, configuredId);
    if (account?.active) return account.id;
  }
  return accountConfig.accounts.find((account) => account.active)?.id || "";
}

async function sourceNetworkPayload() {
  const [config, registry, quality, supply] = await Promise.all([
    loadSourceNetworkConfig(),
    readJson("data/source-registry.json", null),
    readJson("data/source-quality.json", null),
    readJson("data/source-supply.json", null)
  ]);
  return { config, registry, quality, supply };
}

async function settingsPayload() {
  const [latest, history, voice, affiliateLinks, feedback, queues, reviews, affiliateResearch, candidateInbox, accountPosts] = await Promise.all([
    loadLatest(),
    loadHistoryData(),
    loadVoiceConfig(),
    loadAffiliateLinks(),
    loadFeedback(),
    loadQueues(),
    loadReviewPages(),
    loadAffiliateResearch(),
    loadCandidateInbox(),
    loadAccountPosts()
  ]);
  return {
    latestDate: latest?.date ?? null,
    historyCount: history.tools?.length ?? 0,
    forbiddenWords: voice.style?.avoid ?? [],
    maxTweetCharacters: voice.style?.maxTweetCharacters ?? 260,
    affiliateLinks: affiliateLinks.links ?? [],
    feedbackCount: feedback.entries?.length ?? 0,
    accountPostCount: accountPosts.items?.length ?? 0,
    queueCount: queues.items?.length ?? 0,
    candidateInboxCount: candidateInbox.items?.length ?? 0,
    reviewPageCount: reviews.items?.length ?? 0,
    affiliateResearchCount: affiliateResearch.items?.length ?? 0
  };
}

async function weeklySummaryPayload() {
  const [latest, history, feedback, queues, affiliateLinks, weekly] = await Promise.all([
    loadLatest(),
    loadHistoryData(),
    loadFeedback(),
    loadQueues(),
    loadAffiliateLinks(),
    buildWeeklyReport()
  ]);
  return {
    ...weekly.data,
    latestDate: latest?.date ?? null,
    historyCount: history.tools?.length ?? 0,
    feedbackCount: feedback.entries?.length ?? 0,
    queueCount: queues.items?.length ?? 0,
    suggestions: buildPromotionSuggestions({ latest, history, feedback, affiliateLinks }).slice(0, 10)
  };
}

async function decisionReportPayload() {
  const [latest, history, feedback, queues, affiliateLinks] = await Promise.all([
    loadLatest(),
    loadHistoryData(),
    loadFeedback(),
    loadQueues(),
    loadAffiliateLinks()
  ]);
  return buildDecisionReport({ latest, history, feedback, queues, affiliateLinks });
}

async function feedbackOpsPayload() {
  const [latest, feedback, accountPosts, accountConfig] = await Promise.all([
    loadLatest(),
    loadFeedback(),
    loadAccountPosts(),
    loadXAccountsConfig()
  ]);
  return buildFeedbackOps({
    date: latest?.date ?? todayString(),
    latest,
    feedback,
    accountPosts,
    accountConfig
  });
}

async function learningLoopPayload() {
  const [latest, feedback, accountPosts, accountConfig] = await Promise.all([
    loadLatest(),
    loadFeedback(),
    loadAccountPosts(),
    loadXAccountsConfig()
  ]);
  const ops = buildFeedbackOps({
    date: latest?.date ?? todayString(),
    latest,
    feedback,
    accountPosts,
    accountConfig
  });
  return {
    version: 1,
    ...buildLearningLoop({ ops })
  };
}

async function xStatusWithAccounts() {
  await loadLocalEnv();
  const config = normalizeAccountConfig(await loadXAccountsConfig());
  const globalStatus = getXPublishStatus();
  const accountStatuses = config.accounts.map((account) => ({
    account,
    authStatus: getAccountXPublishStatus(account.id)
  }));
  const scopedReadyAccount = accountStatuses.find(({ account, authStatus }) => account.active && authStatus.publishReady);
  const globalFallbackAccountId = !scopedReadyAccount && globalStatus.publishReady
    ? defaultGlobalPublishAccountId(config)
    : "";
  const currentPublishAccountId = scopedReadyAccount?.account.id || globalFallbackAccountId || "";
  return {
    ...globalStatus,
    currentPublishAccountId,
    globalFallbackAccountId,
    accounts: accountStatuses.map(({ account, authStatus }) => ({
      accountId: account.id,
      displayName: account.displayName,
      handle: account.handle,
      active: account.active,
      authStatus: account.id === globalFallbackAccountId
        ? getAccountXPublishStatus(account.id, process.env, new Date(), { useGlobalFallback: true })
        : authStatus
    }))
  };
}

async function filteredPublishJobs(workspaceId = "") {
  const jobs = await loadPublishCollection(PUBLISH_FILES.publishJobs);
  if (!workspaceId) return jobs;
  return {
    ...jobs,
    items: jobs.items.filter((job) => (job.workspaceId || "workspace_default") === workspaceId)
  };
}
