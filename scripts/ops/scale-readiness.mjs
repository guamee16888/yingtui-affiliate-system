import { readJson, writeJsonAtomic, writeTextAtomic } from "../lib/file-store.mjs";
import { buildFeedbackOps } from "../lib/feedback-ops.mjs";
import { buildScaleReadiness, renderScaleReadinessMarkdown } from "../lib/scale-readiness.mjs";

const latest = await readJson("data/latest.json", null);
if (!latest) throw new Error("latest.json missing. Run npm run daily first.");

const [feedback, accountPosts, accountConfig, contentCalendar, sourceImportPack, accountContentMatrix] = await Promise.all([
  readJson("data/feedback.json", { entries: [] }),
  readJson("data/account-posts.json", { items: [] }),
  readJson("config/x-accounts.json", { accounts: [] }),
  readJson("data/content-calendar/latest.json", latest.contentCalendar ?? null),
  readJson("data/source-import-pack/latest.json", null),
  readJson("data/account-content-matrix.json", null)
]);

const feedbackOps = buildFeedbackOps({
  date: latest.date,
  latest,
  feedback,
  accountPosts,
  accountConfig
});
const report = buildScaleReadiness({
  date: latest.date,
  latest,
  feedbackOps,
  accountConfig,
  contentCalendar,
  sourceImportPack,
  accountContentMatrix
});
const jsonPath = "data/scale-readiness.json";
const markdownPath = `output/${latest.date}-scale-readiness.md`;
const markdown = renderScaleReadinessMarkdown(report);

await writeJsonAtomic(jsonPath, report);
await writeTextAtomic(markdownPath, markdown);

console.log(markdown);
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);
