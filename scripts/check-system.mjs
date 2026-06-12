import { access } from "node:fs/promises";
import path from "node:path";
import { readJson, rootDir } from "./lib/file-store.mjs";

const requiredFiles = [
  "package.json",
  "data/latest.json",
  "data/history.json",
  "data/feedback.json",
  "data/queues.json",
  "data/account-posts.json",
  "data/source-candidates.json",
  "data/affiliate-research.json",
  "data/review-pages.json",
  "config/affiliate-links.json",
  "config/x-accounts.json",
  "config/content-sources.json",
  "config/voice.json",
  "dashboard/index.html",
  "dashboard/js/app.js",
  "dashboard/style.css"
];
const requiredScripts = [
  "daily",
  "daily:top10",
  "dashboard",
  "history",
  "affiliate-queue",
  "affiliate:research",
  "sources",
  "source-discovery",
  "source-health",
  "source-queue",
  "source-pack",
  "draft-plan",
  "content-calendar",
  "roadmap",
  "accounts",
  "feedback",
  "feedback-ops",
  "decisions",
  "promote",
  "promotion-review",
  "review:queue",
  "review:generate",
  "today-plan",
  "weekly",
  "check",
  "test"
];

const errors = [];

for (const file of requiredFiles) {
  try {
    await access(path.join(rootDir, file));
  } catch {
    errors.push(`Missing required file: ${file}`);
  }
}

const pkg = await readJson("package.json", { scripts: {} });
for (const script of requiredScripts) {
  if (!pkg.scripts?.[script]) errors.push(`Missing package script: ${script}`);
}

const latest = await readJson("data/latest.json", null);
if (!latest?.date || !Array.isArray(latest.tools)) errors.push("latest.json structure is invalid");
if (!latest?.accountStrategy) errors.push("latest.json accountStrategy is missing. Run npm run daily.");
if (!latest?.sourceHealth) errors.push("latest.json sourceHealth is missing. Run npm run daily.");
if (!latest?.sourceDiscovery) errors.push("latest.json sourceDiscovery is missing. Run npm run daily.");
if (!latest?.contentCalendar) errors.push("latest.json contentCalendar is missing. Run npm run daily.");
if (!latest?.promotionReview) errors.push("latest.json promotionReview is missing. Run npm run daily.");
if (!latest?.feedbackOps) errors.push("latest.json feedbackOps is missing. Run npm run daily.");

const xAccounts = await readJson("config/x-accounts.json", { accounts: [] });
if (!Array.isArray(xAccounts.accounts) || xAccounts.accounts.length < 1) errors.push("x-accounts config has no accounts");
if ((xAccounts.accounts ?? []).length > Number(xAccounts.rotationPolicy?.maxAccounts ?? 10)) {
  errors.push("x-accounts config exceeds maxAccounts");
}

const accountPosts = await readJson("data/account-posts.json", { items: [] });
if (!Array.isArray(accountPosts.items)) errors.push("account-posts.json structure is invalid");

const sourceCandidates = await readJson("data/source-candidates.json", { items: [] });
if (!Array.isArray(sourceCandidates.items)) errors.push("source-candidates.json structure is invalid");

const contentSources = await readJson("config/content-sources.json", { sources: [], circles: [], dailyTargets: {} });
if (!Array.isArray(contentSources.sources)) errors.push("content-sources config has invalid sources");
if (!Array.isArray(contentSources.circles) || contentSources.circles.length < 4) errors.push("content-sources config should define the four target circles");

const voice = await readJson("config/voice.json", { style: { avoid: [] } });
const forbidden = voice.style?.avoid ?? [];
for (const tool of latest?.tools ?? []) {
  for (const text of Object.values(tool.copyVariants ?? {})) {
    for (const word of forbidden) {
      if (String(text).toLowerCase().includes(String(word).toLowerCase())) {
        errors.push(`Forbidden word "${word}" found in copy for ${tool.name}`);
      }
    }
    if (/example\.com\/\?ref=your-id/i.test(text)) errors.push(`Fake affiliate link found in copy for ${tool.name}`);
  }
}

const history = await readJson("data/history.json", { tools: [] });
if ((history.tools ?? []).some((tool) => /Sample/i.test(tool.toolName ?? ""))) {
  errors.push("history appears to contain fallback sample tools");
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("System check passed");
}
