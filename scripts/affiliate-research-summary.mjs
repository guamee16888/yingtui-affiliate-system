import { readJson, writeJsonAtomic, writeTextAtomic } from "./lib/file-store.mjs";
import { buildAffiliateResearchWorkbench, renderAffiliateResearchWorkbenchMarkdown } from "./lib/affiliate-research-workbench.mjs";

const latest = await readJson("data/latest.json", null);
if (!latest) throw new Error("latest.json missing. Run npm run daily first.");

const [affiliateResearch, affiliateLinks, queues] = await Promise.all([
  readJson("data/affiliate-research.json", { items: [] }),
  readJson("config/affiliate-links.json", { links: [] }),
  readJson("data/queues.json", { items: [] })
]);

const workbench = buildAffiliateResearchWorkbench({
  date: latest.date,
  latest,
  affiliateResearch,
  affiliateLinks,
  queues
});
const jsonPath = "data/affiliate-research-workbench.json";
const markdownPath = `output/${latest.date}-affiliate-research-workbench.md`;
const markdown = renderAffiliateResearchWorkbenchMarkdown(workbench);

await writeJsonAtomic(jsonPath, workbench);
await writeTextAtomic(markdownPath, markdown);

console.log(markdown);
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);
