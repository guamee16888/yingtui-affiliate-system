import { loadLatest } from "../lib/storage/interface.mjs";
import { formatTodayPlanMarkdown } from "../lib/formatters.mjs";
import { writeTextAtomic } from "../lib/file-store.mjs";

const latest = await loadLatest();
if (!latest) throw new Error("latest.json missing. Run npm run daily first.");

const posts = latest.actionList
  .filter((action) => action.type === "post")
  .slice(0, 3)
  .map((action) => {
    const tool = latest.tools.find((item) => item.name === action.toolName);
    return {
      toolName: action.toolName,
      copyText: tool?.copyVariants?.shortPost ?? action.reason
    };
  });
const affiliateAction = latest.actionList.find((action) => action.type === "research affiliate");
const longformAction = latest.actionList.find((action) => action.type === "longform");
const plan = {
  date: latest.date,
  posts,
  affiliate: affiliateAction ? {
    toolName: affiliateAction.toolName,
    searchQuery: `"${affiliateAction.toolName}" affiliate program`,
    reason: affiliateAction.reason
  } : null,
  longform: longformAction ? {
    toolName: longformAction.toolName,
    reason: longformAction.reason
  } : null
};
const markdown = formatTodayPlanMarkdown(plan);
const filePath = `output/${latest.date}-today-plan.md`;
await writeTextAtomic(filePath, markdown);
console.log(markdown);
console.log(`\nWrote ${filePath}`);
