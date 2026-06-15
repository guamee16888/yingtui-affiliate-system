import { spawn } from "node:child_process";
import { access, copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist-desktop");
const releaseDir = path.join(rootDir, "release-local", "mac-trial");

const pkg = JSON.parse(await readFile(path.join(rootDir, "package.json"), "utf8"));
const version = pkg.version || "0.0.0";

export async function releaseMacTrial() {
  await run("node", ["scripts/generate-mac-icon.mjs"]);
  await run(resolveBin("electron-builder"), ["--config", "electron-builder.yml", "--mac"]);
  await run("node", ["scripts/desktop-package-check.mjs"]);

  await mkdir(releaseDir, { recursive: true });
  await cleanReleaseDir();
  const artifacts = await copyMacArtifacts();
  const readmePath = path.join(releaseDir, "README-MAC-TRIAL.md");
  await writeFile(readmePath, macTrialReadme(artifacts), "utf8");

  console.log("Mac trial release prepared");
  console.log(`- ${path.relative(rootDir, artifacts.dmg)}`);
  console.log(`- ${path.relative(rootDir, artifacts.zip)}`);
  console.log(`- ${path.relative(rootDir, readmePath)}`);
  return { ...artifacts, readmePath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  releaseMacTrial().catch((error) => {
    console.error(`Mac trial release failed: ${error.message}`);
    process.exit(1);
  });
}

async function cleanReleaseDir() {
  try {
    const entries = await readdir(releaseDir);
    await Promise.all(entries.map((entry) => rm(path.join(releaseDir, entry), { recursive: true, force: true })));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function copyMacArtifacts() {
  const files = await readdir(distDir);
  const dmgName = findArtifact(files, ".dmg");
  const zipName = findArtifact(files, ".zip");
  const dmg = path.join(releaseDir, `AI-Creator-OS-${version}-mac-arm64.dmg`);
  const zip = path.join(releaseDir, `AI-Creator-OS-${version}-mac-arm64.zip`);
  await copyFile(path.join(distDir, dmgName), dmg);
  await copyFile(path.join(distDir, zipName), zip);
  return { dmg, zip };
}

function findArtifact(files, ext) {
  const expected = `AI-Creator-OS-${version}-mac-arm64${ext}`;
  if (files.includes(expected)) return expected;
  const match = files.find((file) => file.startsWith(`AI-Creator-OS-${version}-mac-`) && file.endsWith(ext));
  if (!match) throw new Error(`Missing ${ext} artifact in dist-desktop. Run desktop:pack:mac first.`);
  return match;
}

function macTrialReadme({ dmg, zip }) {
  return `# AI Creator OS Desktop Mac Trial

这是本机试用版，只给你自己在 Mac 上安装和测试。

## 安装

1. 优先打开 \`${path.basename(dmg)}\`。
2. 把 \`AI Creator OS.app\` 拖进 Applications。
3. 双击打开 \`AI Creator OS\`。

如果 DMG 打不开，也可以解压 \`${path.basename(zip)}\` 后直接打开里面的 \`AI Creator OS.app\`。

## 第一次打不开怎么办

当前试用包没有签名、公证。macOS 可能提示无法验证开发者。

处理方式：

1. 打开系统设置。
2. 进入隐私与安全性。
3. 找到 AI Creator OS 的拦截提示。
4. 点仍要打开。

也可以在 Finder 里右键 App，选择打开。

## 数据保存在哪里

运行数据保存在：

\`\`\`text
~/Library/Application Support/AI Creator OS/
\`\`\`

这里包含本地账号列表、任务、反馈、目标关系、日志和备份。它不会写入项目 repo 的 \`data/\`。

## 怎么重置样例数据

打开 App 后，在设置页的本地数据区域点击：

\`\`\`text
重置样例数据
\`\`\`

重置会覆盖当前本地数据。重要数据请先导出备份。

## 怎么打开数据目录

在 App 内点击：

\`\`\`text
打开数据目录
\`\`\`

或者在 macOS 菜单栏里选择：

\`\`\`text
AI Creator OS → 打开数据目录
\`\`\`

## 怎么导出备份

在 App 内点击：

\`\`\`text
导出备份
\`\`\`

备份会生成 JSON package，默认放在 appData 的 \`backups/\` 目录。

## 当前不能做什么

- 不能自动发推。
- 不能自动关注、点赞或评论。
- 不能接 X OAuth。
- 不能导入 X 密码、cookie、代理或指纹。
- 不能当 Windows 试用包使用。

## 怎么卸载

1. 删除 \`AI Creator OS.app\`。
2. 如果要清空本地数据，删除：

\`\`\`text
~/Library/Application Support/AI Creator OS/
\`\`\`

## 本地文件

- DMG: \`${path.basename(dmg)}\`
- ZIP: \`${path.basename(zip)}\`
- Version: \`${version}\`
`;
}

function resolveBin(name) {
  return path.join(rootDir, "node_modules", ".bin", name);
}

async function run(command, args) {
  await access(command).catch(() => {
    if (command.includes(path.sep)) throw new Error(`Missing executable: ${command}`);
  });
  console.log(`$ ${[path.basename(command), ...args].join(" ")}`);
  await execFilePromise(command, args, { cwd: rootDir });
}

function execFilePromise(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: "inherit" });
    child.on("error", (error) => {
      reject(new Error(`${path.basename(command)} failed: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(command)} failed with exit code ${code}`));
    });
  });
}
