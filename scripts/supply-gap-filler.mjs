import { readJson, writeJsonAtomic, writeTextAtomic } from "./lib/file-store.mjs";
import { todayString } from "./lib/ids.mjs";
import { buildAccountRefillWorkbench } from "./lib/account-refill-workbench.mjs";
import { buildSourceImportPack, loadContentSourceConfig } from "./lib/content-source-system.mjs";
import { buildSupplyGapFiller, renderSupplyGapFillerMarkdown } from "./lib/supply-gap-filler.mjs";

const latest = await readJson("data/latest.json", null);
const accountContentMatrix = await readJson("data/account-content-matrix.json", null);
const accountRefillWorkbench = await readJson("data/account-refill-workbench.json", null)
  ?? (accountContentMatrix ? buildAccountRefillWorkbench({
    date: accountContentMatrix.date || latest?.date || todayString(),
    accountContentMatrix
  }) : null);
const contentSourceConfig = await loadContentSourceConfig([]);
const date = latest?.date || accountRefillWorkbench?.date || accountContentMatrix?.date || todayString();
const savedSourceImportPack = await readJson("data/source-import-pack/latest.json", null);
const sourceImportPack = savedSourceImportPack?.date === date
  ? savedSourceImportPack
  : buildSourceImportPack({
    date,
    sourceQualityQueue: latest?.sourceQualityQueue ?? null,
    contentSourceConfig,
    totalRows: 100,
    csvPath: `output/source-import-pack/${date}-source-import-template.csv`,
    guidePath: `output/source-import-pack/${date}-source-import-guide.md`
  });

const plan = buildSupplyGapFiller({
  date,
  latest,
  sourceImportPack,
  accountRefillWorkbench,
  accountContentMatrix,
  contentSourceConfig
});
const jsonPath = "data/supply-gap-filler.json";
const markdownPath = `output/${date}-supply-gap-filler.md`;

await writeJsonAtomic(jsonPath, plan);
await writeTextAtomic(markdownPath, renderSupplyGapFillerMarkdown(plan));

console.log(renderSupplyGapFillerMarkdown(plan));
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);
