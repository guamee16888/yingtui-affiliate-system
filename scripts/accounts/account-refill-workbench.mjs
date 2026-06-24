import { readJson, writeJsonAtomic, writeTextAtomic } from "../lib/file-store.mjs";
import { buildAccountRefillWorkbench, renderAccountRefillWorkbenchMarkdown } from "../lib/account-refill-workbench.mjs";
import { todayString } from "../lib/ids.mjs";

const latest = await readJson("data/latest.json", null);
const matrix = await readJson("data/account-content-matrix.json", null);

if (!matrix) {
  console.error("Account content matrix is missing. Run npm run daily or npm run account-matrix first.");
  process.exitCode = 1;
} else {
  const date = matrix.date || latest?.date || todayString();
  const workbench = buildAccountRefillWorkbench({
    date,
    accountContentMatrix: matrix
  });
  const jsonPath = "data/account-refill-workbench.json";
  const markdownPath = `output/${date}-account-refill-workbench.md`;

  await writeJsonAtomic(jsonPath, workbench);
  await writeTextAtomic(markdownPath, renderAccountRefillWorkbenchMarkdown(workbench));

  console.log(renderAccountRefillWorkbenchMarkdown(workbench));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${markdownPath}`);
}
