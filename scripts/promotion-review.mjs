import {
  loadAffiliateLinks,
  loadFeedback,
  loadHistoryData,
  loadLatest,
  loadQueues
} from "./lib/data-store.mjs";
import { writeJsonAtomic, writeTextAtomic } from "./lib/file-store.mjs";
import { buildPromotionReviewQueue, renderPromotionReviewMarkdown } from "./lib/promotion-engine.mjs";

const [latest, history, feedback, queues, affiliateLinks] = await Promise.all([
  loadLatest(),
  loadHistoryData(),
  loadFeedback(),
  loadQueues(),
  loadAffiliateLinks()
]);

if (!latest) throw new Error("latest.json missing. Run npm run daily first.");

const review = buildPromotionReviewQueue({
  latest,
  history,
  feedback,
  queues,
  affiliateLinks
});
const jsonPath = "data/promotion-review.json";
const markdownPath = `output/${latest.date}-promotion-review.md`;
const markdown = renderPromotionReviewMarkdown(review);

await writeJsonAtomic(jsonPath, {
  version: 1,
  ...review
});
await writeTextAtomic(markdownPath, markdown);

console.log(markdown);
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);
