import { readJson, writeJsonAtomic, writeTextAtomic } from "./lib/file-store.mjs";
import { buildProductRoadmap, renderProductRoadmapMarkdown } from "./lib/product-roadmap.mjs";

const latest = await readJson("data/latest.json", null);
if (!latest) throw new Error("latest.json missing. Run npm run daily first.");

const [feedback, queues, affiliateResearch, accountPosts, affiliateLinks, contentCalendar] = await Promise.all([
  readJson("data/feedback.json", { entries: [] }),
  readJson("data/queues.json", { items: [] }),
  readJson("data/affiliate-research.json", { items: [] }),
  readJson("data/account-posts.json", { items: [] }),
  readJson("config/affiliate-links.json", { links: [] }),
  readJson("data/content-calendar/latest.json", latest.contentCalendar ?? null)
]);
const roadmap = buildProductRoadmap({
  date: latest.date,
  latest,
  feedback,
  queues,
  affiliateResearch,
  accountPosts,
  affiliateLinks,
  contentCalendar
});
const jsonPath = "data/product-roadmap.json";
const markdownPath = `output/${latest.date}-product-roadmap.md`;
const markdown = renderProductRoadmapMarkdown(roadmap);

await writeJsonAtomic(jsonPath, {
  version: 1,
  ...roadmap
});
await writeTextAtomic(markdownPath, markdown);

console.log(markdown);
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);
