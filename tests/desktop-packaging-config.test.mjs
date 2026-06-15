import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("electron-builder desktop packaging config is product-shaped", async () => {
  const config = await readFile("electron-builder.yml", "utf8");
  assert.match(config, /appId:\s*org\.guamee\.aicreatoros\.desktop/);
  assert.match(config, /productName:\s*AI Creator OS/);
  assert.match(config, /artifactName:\s*AI-Creator-OS-\$\{version\}-\$\{os\}-\$\{arch\}\.\$\{ext\}/);
  assert.match(config, /output:\s*dist-desktop/);
  assert.match(config, /publish:\s*null/);
});

test("electron-builder targets include mac and windows smoke formats", async () => {
  const config = await readFile("electron-builder.yml", "utf8");
  for (const target of ["dmg", "zip", "dir", "nsis", "portable"]) {
    assert.match(config, new RegExp(`- ${target}\\b`));
  }
});

test("desktop packaging excludes runtime data and private web surfaces", async () => {
  const config = await readFile("electron-builder.yml", "utf8");
  for (const excluded of ["!data/**", "!output/**", "!config/**", "!dashboard/**", "!staff/**", "!release-local/**"]) {
    assert.match(config, new RegExp(escapeRegExp(excluded)));
  }
});

test("desktop artifacts are ignored by git", async () => {
  const gitignore = await readFile(".gitignore", "utf8");
  for (const ignored of ["dist-desktop/", "release/", "release-local/", "*.dmg", "*.exe", "*.zip", "*.app", "*.AppImage"]) {
    assert.match(gitignore, new RegExp(escapeRegExp(ignored)));
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
