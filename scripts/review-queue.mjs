import { loadReviewPages } from "./lib/data-store.mjs";

const reviewPages = await loadReviewPages();
console.log("# Review Page Queue\n");
console.log(reviewPages.items.length
  ? reviewPages.items.map((item) => `- ${item.toolName} — ${item.status} — ${item.filePath}`).join("\n")
  : "暂无测评页大纲。运行 `npm run review:generate -- --tool \"Tool Name\"`。");
