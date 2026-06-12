import { buildAccountContentMatrix, renderAccountContentMatrixMarkdown } from "./lib/account-content-matrix.mjs";
import { loadFeedback, loadLatest, loadXAccountsConfig } from "./lib/data-store.mjs";
import { readJson, writeJsonAtomic, writeTextAtomic } from "./lib/file-store.mjs";
import { buildFeedbackOps } from "./lib/feedback-ops.mjs";

const latest = await loadLatest();
if (!latest) throw new Error("data/latest.json missing. Run npm run daily first.");

const [accountConfig, draftPlan, contentCalendar, feedback] = await Promise.all([
  loadXAccountsConfig(),
  readJson("data/draft-plans/latest.json", latest.draftPlan ?? null),
  readJson("data/content-calendar/latest.json", latest.contentCalendar ?? null),
  loadFeedback()
]);
const feedbackOps = latest.feedbackOps ?? buildFeedbackOps({ feedback, accountConfig });
const matrix = buildAccountContentMatrix({
  date: latest.date,
  latest,
  accountConfig,
  draftPlan,
  contentCalendar,
  feedbackOps
});
const jsonPath = "data/account-content-matrix.json";
const markdownPath = `output/${latest.date}-account-content-matrix.md`;

await writeJsonAtomic(jsonPath, matrix);
await writeTextAtomic(markdownPath, renderAccountContentMatrixMarkdown(matrix));

console.log(renderAccountContentMatrixMarkdown(matrix));
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);
