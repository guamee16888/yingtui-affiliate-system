import { access, copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { todayString } from "./ids.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, "../..");

function runtimeDataRoot() {
  return process.env.AI_CREATOR_OS_DATA_DIR
    ? path.resolve(process.env.AI_CREATOR_OS_DATA_DIR)
    : "";
}

function shouldUseRuntimeDataRoot(filePath) {
  if (path.isAbsolute(filePath)) return false;
  const [topLevel] = filePath.split(/[\\/]/);
  return Boolean(runtimeDataRoot()) && ["data", "config", "output"].includes(topLevel);
}

export function resolveProjectPath(filePath) {
  if (shouldUseRuntimeDataRoot(filePath)) return path.join(runtimeDataRoot(), filePath);
  return path.isAbsolute(filePath) ? filePath : path.join(rootDir, filePath);
}

function assertProjectWritePath(filePath) {
  const target = resolveProjectPath(filePath);
  const baseDir = shouldUseRuntimeDataRoot(filePath) ? runtimeDataRoot() : rootDir;
  const relative = path.relative(baseDir, target);
  const allowed = ["data", "config", "output"];
  if (relative.startsWith("..") || path.isAbsolute(relative) || !allowed.includes(relative.split(path.sep)[0])) {
    throw new Error(`Refusing to write outside project data/config/output: ${filePath}`);
  }
  return target;
}

export async function ensureDir(dirPath) {
  await mkdir(assertProjectWritePath(dirPath), { recursive: true });
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
  const target = assertProjectWritePath(filePath);
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
      throw new Error(`JSON parse failed for ${filePath}. Original file was kept unchanged. ${error.message}`, { cause: error });
    }
    throw error;
  }
}

export async function writeJsonAtomic(filePath, data) {
  const target = assertProjectWritePath(filePath);
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

  const backupRoot = shouldUseRuntimeDataRoot(filePath) ? runtimeDataRoot() : rootDir;
  const backupDir = path.join(backupRoot, "data/backups", todayString());
  await mkdir(backupDir, { recursive: true });
  const safeName = path.relative(backupRoot, target).replace(/[/\\:]/g, "__");
  const backupPath = path.join(backupDir, `${Date.now()}-${safeName}`);
  await copyFile(target, backupPath);
  return backupPath;
}
