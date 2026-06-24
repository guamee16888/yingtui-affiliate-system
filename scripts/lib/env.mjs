import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const defaultEnvPath = path.resolve(".env");

export async function loadLocalEnv(filePath = defaultEnvPath, target = process.env) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
  const values = parseDotEnv(text);
  for (const [key, value] of Object.entries(values)) {
    if (target[key] === undefined) target[key] = value;
  }
  return values;
}

export function parseDotEnv(text) {
  const values = {};
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = unquoteEnvValue(match[2].trim());
  }
  return values;
}

export function mergeDotEnvText(existingText, updates) {
  const lines = String(existingText ?? "").split(/\r?\n/);
  const seen = new Set();
  const nextLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || !(match[1] in updates)) return line;
    seen.add(match[1]);
    return `${match[1]}=${quoteEnvValue(updates[match[1]])}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) nextLines.push(`${key}=${quoteEnvValue(value)}`);
  }
  return `${nextLines.filter((line, index, array) => line || index < array.length - 1).join("\n")}\n`;
}

export async function updateDotEnv(updates, filePath = defaultEnvPath) {
  let existingText = "";
  try {
    existingText = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await writeFile(filePath, mergeDotEnvText(existingText, updates), "utf8");
}

function unquoteEnvValue(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function quoteEnvValue(value) {
  return JSON.stringify(String(value ?? ""));
}
