import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rootDir } from "../lib/file-store.mjs";

const defaultDistDir = path.join(rootDir, "dist");

export async function validateAppPlaceholderRelease({ distDir = defaultDistDir } = {}) {
  const errors = [];
  await mustExist(errors, distDir, "index.html");
  await mustExist(errors, distDir, "styles.css");
  for (const name of ["dashboard", "manager", "staff", "data", "output", "config", "db"]) {
    await mustNotExist(errors, distDir, name);
  }

  const index = await readDist(distDir, "index.html");
  if (!index.includes("AI Creator OS App")) errors.push("App placeholder must include AI Creator OS App.");
  if (!index.includes("受保护应用预览")) errors.push("App placeholder must include 受保护应用预览.");
  if (!index.includes("app.guamee.org")) errors.push("App placeholder must explain app.guamee.org.");
  if (!index.includes("Cloudflare Access")) errors.push("App placeholder must mention Cloudflare Access.");

  const files = await listFiles(distDir);
  for (const file of files) {
    const relative = path.relative(distDir, file);
    const text = await readFile(file, "utf8").catch(() => "");
    if (/X_ACCESS_TOKEN|X_REFRESH_TOKEN|refresh_token|access_token|api[_-]?key|client_secret|bearer\s+[a-z0-9._-]+|token_ref/i.test(text)) {
      errors.push(`Sensitive token-looking text found: ${relative}`);
    }
    if (/x\.com\/[^"'\s]+\/status\/\d+|twitter\.com\/[^"'\s]+\/status\/\d+/i.test(text)) {
      errors.push(`Posted X URL found: ${relative}`);
    }
    if (/postedUrl|affiliate(Link|Url)|live publish/i.test(text)) {
      errors.push(`Operational data or live publish wording found: ${relative}`);
    }
    if (/"handle"\s*:\s*"@?[^"]+"/i.test(text)) {
      errors.push(`Real-looking X handle found: ${relative}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function printReleaseReport(result, label = "App placeholder release check") {
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
    errors.push(`App placeholder dist must not include: ${file}`);
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
  const result = await validateAppPlaceholderRelease();
  printReleaseReport(result);
  if (!result.ok) process.exitCode = 1;
}
