import { readJson } from "./lib/file-store.mjs";
import { renderOpenClawReportMarkdown, writeOpenClawReportMarkdown } from "./lib/openclaw-source-hunter.mjs";

const report = await readJson("data/openclaw-source-hunter-latest.json", null);
const markdown = renderOpenClawReportMarkdown(report);
if (report) {
  const file = await writeOpenClawReportMarkdown(report);
  console.log(markdown);
  console.log(`\nWrote ${file.markdownPath}`);
} else {
  console.log(markdown);
}
