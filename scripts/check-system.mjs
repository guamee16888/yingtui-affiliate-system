import { access } from "node:fs/promises";
import path from "node:path";
import { readJson, rootDir } from "./lib/file-store.mjs";

const requiredFiles = [
  "package.json",
  "data/latest.json",
  "data/history.json",
  "data/feedback.json",
  "data/queues.json",
  "data/affiliate-research.json",
  "data/review-pages.json",
  "config/affiliate-links.json",
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
  "feedback",
  "decisions",
  "promote",
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
