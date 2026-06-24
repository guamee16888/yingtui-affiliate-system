import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rootDir } from "../lib/file-store.mjs";

const defaultDistDir = path.join(rootDir, "dist");

export async function validatePublicRelease({ distDir = defaultDistDir } = {}) {
  const errors = [];
  await mustExist(errors, distDir, "index.html");
  await mustExist(errors, distDir, "public/styles.css");
  await mustExist(errors, distDir, "manager/index.html");
  await mustExist(errors, distDir, "data/demo-manager-summary.json");
  await mustNotExist(errors, distDir, "dashboard");
  await mustNotExist(errors, distDir, "staff");
  await mustNotExist(errors, distDir, "output");

  const rootIndex = await readDist(distDir, "index.html");
  if (rootIndex.includes("/dashboard") || rootIndex.includes("/staff")) {
    errors.push("Public root must not link to dashboard or staff.");
  }
  if (rootIndex.includes("admin.guamee.org")) {
    errors.push("Public root must not expose the private admin domain.");
  }
  if (rootIndex.includes("app.guamee.org")) {
    errors.push("Public root must not expose the future app domain.");
  }

  const dataFiles = await listFiles(path.join(distDir, "data"));
  const allowedData = new Set(["demo-manager-summary.json"]);
  for (const file of dataFiles) {
    const relative = path.relative(path.join(distDir, "data"), file);
    if (!allowedData.has(relative)) errors.push(`Public dist contains non-demo data file: data/${relative}`);
  }

  const files = await listFiles(distDir);
  const sensitiveErrors = await scanFiles(files, { dataOnly: false });
  errors.push(...sensitiveErrors);

  return { ok: errors.length === 0, errors };
}

export function printReleaseReport(result, label = "Public release check") {
  if (result.errors.length) {
    for (const error of result.errors) console.error(`✗ ${error}`);
  } else {
    console.log(`${label} passed`);
  }
}

async function scanFiles(files, { dataOnly }) {
  const errors = [];
  for (const file of files) {
    const normalized = file.split(path.sep).join("/");
    if (dataOnly && !normalized.includes("/data/")) continue;
    const text = await readFile(file, "utf8").catch(() => "");
    if (/X_ACCESS_TOKEN|X_REFRESH_TOKEN|refresh_token|access_token|api[_-]?key|client_secret|bearer\s+[a-z0-9._-]+/i.test(text)) {
      errors.push(`Sensitive token-looking text found: ${normalized}`);
    }
    if (/x\.com\/[^"'\s]+\/status\/\d+|twitter\.com\/[^"'\s]+\/status\/\d+/i.test(text)) {
      errors.push(`Posted X URL found: ${normalized}`);
    }
    if (/"postedUrl"\s*:\s*"https?:\/\//i.test(text)) {
      errors.push(`Real postedUrl found: ${normalized}`);
    }
    if (/"affiliate(Link|Url)"\s*:\s*"https?:\/\//i.test(text)) {
      errors.push(`Real affiliate link found: ${normalized}`);
    }
  }
  return errors;
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
    errors.push(`Public dist must not include: ${file}`);
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
  const result = await validatePublicRelease();
  printReleaseReport(result);
  if (!result.ok) process.exitCode = 1;
}
