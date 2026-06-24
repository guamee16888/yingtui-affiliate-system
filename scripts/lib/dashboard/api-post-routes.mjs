import {
  deleteFeedback,
  revokeDesktopXOAuth,
  upsertAffiliateResearch,
  upsertCandidate,
  upsertQueueItem,
  updateCandidateStatus,
  updateQueueStatus
} from "../storage/interface.mjs";
import { generateWeeklyReport } from "../weekly-report.mjs";
import { updateStaffTaskAction } from "../staff-system.mjs";
import { updateManagerTaskAction, updateManagerTaskBatchAction } from "../manager-system.mjs";
import {
  dryRunPublishJobs,
  preparePublishJobs,
  runPublishJobs,
  updateAccountPublishMode,
  updatePublishJobStatus
} from "../publish-engine.mjs";
import { ingestManualCandidates, seedSourceLanes } from "../source-lanes.mjs";
import {
  refreshSourceNetworkReports,
  updateSourceNetworkSourceStatus,
  upsertSourceNetworkSource
} from "../source-network.mjs";
import { guardD1ReservedRoute } from "./api-get-routes.mjs";
import {
  importCandidatePaste,
  previewCandidatePaste,
  validateCandidate
} from "./candidate-import-workflows.mjs";
import {
  exportTodayPlan,
  generateReviewOutline,
  importFeedbackCsv,
  previewFeedbackCsv,
  publishXPost,
  upsertFeedbackWithAccount
} from "./publish-feedback-workflows.mjs";
import {
  runAccountRefillWorkbenchGeneration,
  runAffiliateResearchWorkbenchGeneration,
  runContentCalendarGeneration,
  runDailyGeneration,
  runLearningLoopGeneration,
  runRoadmapGeneration,
  runSourceImportPackGeneration
} from "./script-runs.mjs";

export function handleDashboardApiPost(pathname, body) {
  if (pathname === "/api/oauth/x/revoke") return revokeDesktopXOAuth({ userId: body.actorUserId || "user_owner" });
  guardD1ReservedRoute(pathname);
  if (pathname === "/api/feedback/upsert") return upsertFeedbackWithAccount(body);
  if (pathname === "/api/candidate-inbox/upsert") return upsertCandidate(validateCandidate(body));
  if (pathname === "/api/candidate-inbox/preview-paste") return previewCandidatePaste(body);
  if (pathname === "/api/candidate-inbox/import-paste") return importCandidatePaste(body);
  if (pathname === "/api/candidate-inbox/status") return updateCandidateStatus(body.id, body.status);
  if (pathname === "/api/feedback/preview-csv") return previewFeedbackCsv(body);
  if (pathname === "/api/feedback/import-csv") return importFeedbackCsv(body);
  if (pathname === "/api/feedback/delete") return deleteFeedback(body.id);
  if (pathname === "/api/queue/upsert") return upsertQueueItem(validateQueue(body));
  if (pathname === "/api/queue/status") return updateQueueStatus(body.id, body.status);
  if (pathname === "/api/affiliate-research/upsert") return upsertAffiliateResearch(validateAffiliateResearch(body));
  if (pathname === "/api/review-outline/generate") return generateReviewOutline(body.toolName);
  if (pathname === "/api/export/today-plan") return exportTodayPlan();
  if (pathname === "/api/weekly/generate") return generateWeeklyReport();
  if (pathname === "/api/daily/run") return runDailyGeneration();
  if (pathname === "/api/content-calendar/run") return runContentCalendarGeneration();
  if (pathname === "/api/source-import-pack/run") return runSourceImportPackGeneration();
  if (pathname === "/api/source-network/refresh") return refreshSourceNetworkReports();
  if (pathname === "/api/source-network/source") return upsertSourceNetworkSource(body);
  if (pathname === "/api/source-network/source/status") return updateSourceNetworkSourceStatus(body);
  if (pathname === "/api/account-refill-workbench/run") return runAccountRefillWorkbenchGeneration();
  if (pathname === "/api/affiliate-research-workbench/run") return runAffiliateResearchWorkbenchGeneration();
  if (pathname === "/api/learning-loop/run") return runLearningLoopGeneration();
  if (pathname === "/api/roadmap/generate") return runRoadmapGeneration();
  if (pathname === "/api/staff/task") return updateStaffTaskAction(body);
  if (pathname === "/api/manager/task") return updateManagerTaskAction(body);
  if (pathname === "/api/manager/task/batch") return updateManagerTaskBatchAction(body);
  if (pathname === "/api/lanes/seed") return seedSourceLanes();
  if (pathname === "/api/candidates/ingest") return ingestManualCandidates();
  if (pathname === "/api/publish/prepare") return preparePublishJobs(body);
  if (pathname === "/api/publish/dry-run") return dryRunPublishJobs(body);
  if (pathname === "/api/publish/run") return runPublishJobs({ live: Boolean(body.live), actorRole: body.role || "admin" });
  if (pathname === "/api/publish/job/cancel") return updatePublishJobStatus({ ...body, action: "cancel" });
  if (pathname === "/api/publish/job/retry") return updatePublishJobStatus({ ...body, action: "retry" });
  if (pathname === "/api/account/publish-mode") return updateAccountPublishMode(body);
  if (pathname === "/api/x/publish") return publishXPost(body);
  throw new Error(`Unknown API route: ${pathname}`);
}

function validateQueue(body) {
  if (!body.toolName || !body.toolUrl || !body.type) {
    throw new Error("toolName, toolUrl and type are required");
  }
  return body;
}

function validateAffiliateResearch(body) {
  if (!body.toolName || !body.toolUrl) throw new Error("toolName and toolUrl are required");
  return body;
}
