import { readJson, writeJsonAtomic, writeTextAtomic } from "./lib/file-store.mjs";
import { loadAccountPosts, loadFeedback, loadXAccountsConfig } from "./lib/data-store.mjs";
import { buildFeedbackOps, renderFeedbackOpsMarkdown } from "./lib/feedback-ops.mjs";

const [latest, feedback, accountPosts, accountConfig] = await Promise.all([
  readJson("data/latest.json", null),
  loadFeedback(),
  loadAccountPosts(),
  loadXAccountsConfig()
]);

if (!latest) throw new Error("latest.json missing. Run npm run daily first.");

const ops = buildFeedbackOps({
  date: latest.date,
  latest,
  feedback,
  accountPosts,
  accountConfig
});
const jsonPath = "data/feedback-ops.json";
const markdownPath = `output/${latest.date}-feedback-ops.md`;
const markdown = renderFeedbackOpsMarkdown(ops);

await writeJsonAtomic(jsonPath, {
  version: 1,
  ...ops
});
await writeTextAtomic(markdownPath, markdown);

console.log(markdown);
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);
