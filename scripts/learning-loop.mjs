import { readJson, writeJsonAtomic, writeTextAtomic } from "./lib/file-store.mjs";
import { loadAccountPosts, loadFeedback, loadXAccountsConfig } from "./lib/data-store.mjs";
import { buildFeedbackOps, buildLearningLoop, renderLearningLoopMarkdown } from "./lib/feedback-ops.mjs";

const [latest, feedback, accountPosts, accountConfig, existingOps] = await Promise.all([
  readJson("data/latest.json", null),
  loadFeedback(),
  loadAccountPosts(),
  loadXAccountsConfig(),
  readJson("data/feedback-ops.json", null)
]);

if (!latest) throw new Error("latest.json missing. Run npm run daily first.");

const ops = existingOps?.date === latest.date
  ? existingOps
  : buildFeedbackOps({
    date: latest.date,
    latest,
    feedback,
    accountPosts,
    accountConfig
  });
const loop = buildLearningLoop({ ops });
const jsonPath = "data/learning-loop.json";
const markdownPath = `output/${latest.date}-learning-loop.md`;
const markdown = renderLearningLoopMarkdown(loop);

await writeJsonAtomic(jsonPath, {
  version: 1,
  ...loop
});
await writeTextAtomic(markdownPath, markdown);

console.log(markdown);
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);
