import { readJson, writeJsonAtomic, writeTextAtomic } from "./lib/file-store.mjs";
import { buildDraftPlan, renderDraftPlanMarkdown } from "./lib/draft-planner.mjs";

const latest = await readJson("data/latest.json", null);
if (!latest) throw new Error("latest.json missing. Run npm run daily first.");

const plan = latest.draftPlan ?? buildDraftPlan({
  date: latest.date,
  picked: latest.tools ?? [],
  accountStrategy: latest.accountStrategy,
  targetPerAccount: latest.supplyPlan?.targetPerAccount ?? 10
});
const jsonPath = `data/draft-plans/${latest.date}.json`;
const latestPath = "data/draft-plans/latest.json";
const markdownPath = `output/${latest.date}-draft-plan.md`;
const markdown = renderDraftPlanMarkdown(plan);

await writeJsonAtomic(jsonPath, {
  version: 1,
  generatedAt: new Date().toISOString(),
  ...plan
});
await writeJsonAtomic(latestPath, {
  version: 1,
  generatedAt: new Date().toISOString(),
  ...plan
});
await writeTextAtomic(markdownPath, markdown);

console.log(markdown);
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${latestPath}`);
console.log(`Wrote ${markdownPath}`);
