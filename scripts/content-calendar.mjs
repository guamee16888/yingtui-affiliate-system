import { readJson, writeJsonAtomic, writeTextAtomic } from "./lib/file-store.mjs";
import { buildContentCalendar, renderContentCalendarMarkdown } from "./lib/content-calendar.mjs";

const latest = await readJson("data/latest.json", null);
if (!latest) throw new Error("latest.json missing. Run npm run daily first.");

const calendar = latest.contentCalendar?.scalePlan ? latest.contentCalendar : buildContentCalendar({
  date: latest.date,
  draftPlan: latest.draftPlan,
  accountStrategy: latest.accountStrategy
});
const jsonPath = `data/content-calendar/${latest.date}.json`;
const latestPath = "data/content-calendar/latest.json";
const markdownPath = `output/${latest.date}-content-calendar.md`;
const markdown = renderContentCalendarMarkdown(calendar);

await writeJsonAtomic(jsonPath, {
  version: 1,
  generatedAt: new Date().toISOString(),
  ...calendar
});
await writeJsonAtomic(latestPath, {
  version: 1,
  generatedAt: new Date().toISOString(),
  ...calendar
});
await writeTextAtomic(markdownPath, markdown);

console.log(markdown);
console.log(`\nWrote ${jsonPath}`);
console.log(`Wrote ${latestPath}`);
console.log(`Wrote ${markdownPath}`);
