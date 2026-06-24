import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rootDir } from "../lib/file-store.mjs";

const defaultDistDir = path.join(rootDir, "dist");

export async function validateAdminRelease({ distDir = defaultDistDir } = {}) {
  const errors = [];
  await mustExist(errors, distDir, "index.html");
  await mustExist(errors, distDir, "dashboard/index.html");
  await mustExist(errors, distDir, "dashboard/js/app.js");
  await mustExist(errors, distDir, "manager/index.html");
  await mustExist(errors, distDir, "data/latest.json");
  await mustExist(errors, distDir, "data/publish-settings.json");
  await mustNotExist(errors, distDir, "output");

  const dashboardIndex = await readDist(distDir, "dashboard/index.html");
  if (!dashboardIndex.includes("受保护总后台演示")) {
    errors.push("Admin dashboard must display 受保护总后台演示.");
  }
  if (!dashboardIndex.includes("Cloudflare Access")) {
    errors.push("Admin dashboard must explain Cloudflare Access protection.");
  }

  const publishSettings = await readJson(path.join(distDir, "data/publish-settings.json"));
  const settings = publishSettings.settings ?? {};
  if (settings.globalAutoPublishEnabled !== false) errors.push("Admin demo must set globalAutoPublishEnabled=false.");
  if (settings.dryRunByDefault !== true) errors.push("Admin demo must keep dryRunByDefault=true.");
  if ((settings.allowedPublishModes ?? []).includes("auto")) errors.push("Admin demo must not allow auto publish mode.");

  const dataFiles = await listFiles(path.join(distDir, "data"));
  for (const file of dataFiles) {
    const text = await readFile(file, "utf8").catch(() => "");
    const relative = path.relative(distDir, file);
    if (/X_ACCESS_TOKEN|X_REFRESH_TOKEN|refresh_token|access_token|api[_-]?key|client_secret|bearer\s+[a-z0-9._-]+/i.test(text)) {
      errors.push(`Sensitive token-looking data found: ${relative}`);
    }
    if (/x\.com\/[^"'\s]+\/status\/\d+|twitter\.com\/[^"'\s]+\/status\/\d+/i.test(text)) {
      errors.push(`Posted X URL found: ${relative}`);
    }
    if (/"postedUrl"\s*:\s*"https?:\/\//i.test(text)) {
      errors.push(`Real postedUrl found: ${relative}`);
    }
    if (/"affiliate(Link|Url)"\s*:\s*"https?:\/\//i.test(text)) {
      errors.push(`Real affiliate link found: ${relative}`);
    }
    if (/"handle"\s*:\s*"@?[^"]+"/i.test(text)) {
      errors.push(`Real-looking X handle found: ${relative}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function printReleaseReport(result, label = "Admin release check") {
  if (result.errors.length) {
    for (const error of result.errors) console.error(`✗ ${error}`);
  } else {
    console.log(`${label} passed`);
  }
}

async function mustExist(errors, distDir, file) {
  try {
    await access(path.join(distDir, file));
  } catch {
    errors.push(`Missing dist file: ${file}`);
  }
}

async function mustNotExist(errors, distDir, file) {
  try {
    await access(path.join(distDir, file));
    errors.push(`Admin demo dist must not include: ${file}`);
  } catch {
    // Expected.
  }
}

async function readDist(distDir, file) {
  try {
    return await readFile(path.join(distDir, file), "utf8");
  } catch {
    return "";
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return {};
  }
}

async function listFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...await listFiles(fullPath));
      else if (!entry.name.includes(".DS_Store")) files.push(fullPath);
    }
    return files;
  } catch {
    return [];
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateAdminRelease();
  printReleaseReport(result);
  if (!result.ok) process.exitCode = 1;
}
