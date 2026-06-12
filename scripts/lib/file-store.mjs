import { access, copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { todayString } from "./ids.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, "../..");

export function resolveProjectPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
}

export async function ensureDir(dirPath) {
  await mkdir(resolveProjectPath(dirPath), { recursive: true });
}

export async function readText(filePath, fallback = "") {
  try {
    return await readFile(resolveProjectPath(filePath), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeTextAtomic(filePath, text) {
  const target = resolveProjectPath(filePath);
  await mkdir(path.dirname(target), { recursive: true });
  await backupJson(filePath);
  const temp = `${target}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(temp, text, "utf8");
  await rename(temp, target);
}

export async function readJson(filePath, fallback = null) {
  const target = resolveProjectPath(filePath);

  try {
    const text = await readFile(target, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    if (error instanceof SyntaxError) {
      throw new Error(`JSON parse failed for ${filePath}. Original file was kept unchanged. ${error.message}`);
    }
    throw error;
  }
}

export async function writeJsonAtomic(filePath, data) {
  const target = resolveProjectPath(filePath);
  await mkdir(path.dirname(target), { recursive: true });
  await backupJson(filePath);
  const temp = `${target}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temp, target);
}

export async function backupJson(filePath) {
  const target = resolveProjectPath(filePath);
  if (!target.endsWith(".json")) return null;

  try {
    await access(target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }

  const backupDir = path.join(rootDir, "data/backups", todayString());
  await mkdir(backupDir, { recursive: true });
  const safeName = path.relative(rootDir, target).replace(/[/\\:]/g, "__");
  const backupPath = path.join(backupDir, `${Date.now()}-${safeName}`);
  await copyFile(target, backupPath);
  return backupPath;
}
