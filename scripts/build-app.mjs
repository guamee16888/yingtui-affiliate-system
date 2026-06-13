import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const defaultDistDir = path.join(rootDir, "dist");

export async function buildApp({ distDir = defaultDistDir } = {}) {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  await cp(path.join(rootDir, "app-placeholder"), distDir, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.DS_Store`)
  });
  await writeFile(path.join(distDir, "index.html"), appEntryHtml(), "utf8");
  await cp(path.join(rootDir, "manager"), path.join(distDir, "manager"), {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}.DS_Store`)
  });

  console.log(`Built app in ${distDir}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildApp();
}

function appEntryHtml() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0; url=/manager/?appMode=1" />
    <title>AI Creator OS App</title>
    <link rel="stylesheet" href="./styles.css" />
    <script>
      window.location.replace("/manager/?appMode=1");
    </script>
  </head>
  <body>
    <main class="shell" aria-labelledby="page-title">
      <section class="panel">
        <p class="eyebrow">Workspace App</p>
        <h1 id="page-title">AI Creator OS App</h1>
        <p class="lede">正在进入客户管理工作台。</p>
        <p class="note">如果页面没有自动跳转，请打开管理端继续审核任务、分配账号和回填反馈。</p>
        <p><a class="button" href="/manager/?appMode=1">进入管理端</a></p>
      </section>
    </main>
  </body>
</html>
`;
}
