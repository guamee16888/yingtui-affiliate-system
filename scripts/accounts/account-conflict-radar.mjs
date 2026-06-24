import { loadAccountPosts, loadFeedback, loadLatest, loadXAccountsConfig } from "../lib/storage/interface.mjs";
import { writeJsonAtomic, writeTextAtomic } from "../lib/file-store.mjs";
import { buildAccountConflictRadar, renderAccountConflictRadarMarkdown } from "../lib/account-conflict-radar.mjs";
import { todayString } from "../lib/ids.mjs";

const [latest, accountPosts, feedback, accountConfig] = await Promise.all([
  loadLatest(),
  loadAccountPosts(),
  loadFeedback(),
  loadXAccountsConfig()
]);

const date = latest?.date ?? todayString();
const radar = buildAccountConflictRadar({
  date,
  latest,
  accountPosts,
  feedback,
  accountConfig
});
const jsonPath = "data/account-conflict-radar.json";
const markdownPath = `output/${date}-account-conflict-radar.md`;

await writeJsonAtomic(jsonPath, radar);
await writeTextAtomic(markdownPath, renderAccountConflictRadarMarkdown(radar));

console.log(renderAccountConflictRadarMarkdown(radar));
console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${markdownPath}`);
