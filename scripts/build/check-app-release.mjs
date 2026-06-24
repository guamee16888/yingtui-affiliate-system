import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rootDir } from "../lib/file-store.mjs";

const defaultDistDir = path.join(rootDir, "dist");

export async function validateAppRelease({ distDir = defaultDistDir } = {}) {
  const errors = [];
  await mustExist(errors, distDir, "index.html");
  await mustExist(errors, distDir, "styles.css");
  await mustExist(errors, distDir, "manager/index.html");
  await mustExist(errors, distDir, "manager/js/app.js");
  await mustExist(errors, distDir, "manager/style.css");
  for (const name of ["dashboard", "staff", "data", "output", "config", "db"]) {
    await mustNotExist(errors, distDir, name);
  }

  const managerJs = await readDist(distDir, "manager/js/app.js");
  const rootIndex = await readDist(distDir, "index.html");
  if (!managerJs.includes("真实工作区") && !managerJs.includes("Workspace App Mode")) {
    errors.push("App manager page must include real workspace mode wording.");
  }
  if (!managerJs.includes("请先登录 app.guamee.org")) {
    errors.push("App manager page must show a login-needed state.");
  }
  if (!rootIndex.includes("AI Creator OS App")) errors.push("App root must include AI Creator OS App.");
  if (!rootIndex.includes("/manager/?appMode=1")) errors.push("App root must send customers to manager app mode.");
  if (/准备中|Planned|placeholder build/i.test(rootIndex)) {
    errors.push("App root must not show placeholder or planned-state wording.");
  }

  const files = await listFiles(distDir);
  for (const file of files) {
    const relative = path.relative(distDir, file);
    const text = await readFile(file, "utf8").catch(() => "");
    if (/X_ACCESS_TOKEN|X_REFRESH_TOKEN|refresh_token|access_token|api[_-]?key|client_secret|bearer\s+[a-z0-9._-]+/i.test(text)) {
      errors.push(`Sensitive token-looking text found: ${relative}`);
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

export function printReleaseReport(result, label = "App release check") {
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
    errors.push(`App dist must not include: ${file}`);
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
  const result = await validateAppRelease();
  printReleaseReport(result);
  if (!result.ok) process.exitCode = 1;
}
