import { loadLatest } from "../lib/storage/interface.mjs";
import { readJson, writeJsonAtomic, writeTextAtomic } from "../lib/file-store.mjs";
import { buildScaleRampPlan, renderScaleRampPlanMarkdown } from "../lib/scale-ramp-plan.mjs";

const latest = await loadLatest();
if (!latest) throw new Error("data/latest.json missing. Run npm run daily first.");

const [accountContentMatrix, scaleReadiness] = await Promise.all([
  readJson("data/account-content-matrix.json", null),
  readJson("data/scale-readiness.json", null)
]);

const plan = buildScaleRampPlan({
  date: latest.date,
  accountContentMatrix,
  scaleReadiness
});
const jsonPath = "data/scale-ramp-plan.json";
const markdownPath = `output/${latest.date}-scale-ramp-plan.md`;

await writeJsonAtomic(jsonPath, plan);
await writeTextAtomic(markdownPath, renderScaleRampPlanMarkdown(plan));

console.log(renderScaleRampPlanMarkdown(plan));
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);
