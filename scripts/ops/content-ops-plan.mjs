import { readJson, writeJsonAtomic, writeTextAtomic } from "../lib/file-store.mjs";
import { buildContentOpsPlan, renderContentOpsPlanMarkdown } from "../lib/content-ops-plan.mjs";
import { todayString } from "../lib/ids.mjs";

const latest = await readJson("data/latest.json", null);
if (!latest) throw new Error("latest.json missing. Run npm run daily first.");

const [scaleReadiness, accountRefillWorkbench, sourceImportPack] = await Promise.all([
  readJson("data/scale-readiness.json", null),
  readJson("data/account-refill-workbench.json", null),
  readJson("data/source-import-pack/latest.json", null)
]);
const date = latest.date || scaleReadiness?.date || todayString();
const plan = buildContentOpsPlan({
  date,
  latest,
  scaleReadiness,
  accountRefillWorkbench,
  sourceImportPack
});
const jsonPath = "data/content-ops-plan.json";
const markdownPath = `output/${date}-content-ops-plan.md`;

await writeJsonAtomic(jsonPath, plan);
await writeTextAtomic(markdownPath, renderContentOpsPlanMarkdown(plan));

console.log(renderContentOpsPlanMarkdown(plan));
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);
