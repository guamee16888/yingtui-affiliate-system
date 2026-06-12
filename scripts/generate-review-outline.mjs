import { readFile } from "node:fs/promises";
import { buildReviewOutline, buildReviewRecord, reviewFilePath } from "./lib/review-outline.mjs";
import { loadLatest, loadReviewPages, saveReviewPages } from "./lib/data-store.mjs";
import { writeTextAtomic } from "./lib/file-store.mjs";

function parseToolName(argv) {
  const index = argv.indexOf("--tool");
  return index >= 0 ? argv[index + 1] : "";
}

const toolName = parseToolName(process.argv.slice(2));
const latest = await loadLatest();
const tool = latest?.tools?.find((item) => item.name === toolName) ?? latest?.tools?.[0];

if (!tool) {
  throw new Error("No tool available. Run npm run daily first.");
}

if (toolName && tool.name !== toolName) {
  throw new Error(`Tool not found in latest.json: ${toolName}`);
}

const filePath = reviewFilePath(tool, latest.date);
const markdown = buildReviewOutline(tool, tool.affiliateLink);
await writeTextAtomic(filePath, markdown);
const reviewPages = await loadReviewPages();
const record = buildReviewRecord(tool, filePath, tool.affiliateLink);
const items = reviewPages.items.filter((item) => item.id !== record.id);
items.push(record);
await saveReviewPages({ ...reviewPages, items });

console.log(`Wrote ${filePath}`);
console.log(await readFile(filePath, "utf8"));
