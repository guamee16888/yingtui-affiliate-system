# AI Creator OS

AI Creator OS 用来管理多账号 X 内容运营：选题、文案、任务、发布、去重、反馈、复盘。

An operating system for managing multi-account X content workflows. Built for AI founders, indie hackers, SaaS builders, crypto builders, affiliate marketers, and content operators who need a serious workflow without handing their accounts or data to a third-party SaaS.

**Keywords:** AI Twitter automation, multi-account X content ops, AI tweet planner, affiliate marketing system, Product Hunt radar, SaaS founder content, indie hacker content, crypto builder content, review-first publishing, manual-confirm tweet automation, X growth workflow.

**Live Demo:** [guamee.org](https://guamee.org)

**GitHub:** [guamee16888/yingtui-affiliate-system](https://github.com/guamee16888/yingtui-affiliate-system)

**Contact:** Telegram [@valuator8](https://t.me/valuator8)

## 项目说明

这是一个本地 AI Creator OS。它每天从 Product Hunt 和候选池找新工具/新话题，给工具打分，生成自然英文 X 文案，并把发推反馈、Affiliate 研究、长线程候选、SEO 测评页候选和每周复盘都沉淀到本地 JSON。

它适合现在这个阶段：先验证哪些小工具有人点、有人问、有人收藏，再决定要不要做长推、测评页或 Affiliate 转化。

它不会绕过 X 规则，不接数据库，不登录，不上传数据，不保证收益，也不会编造 affiliate link、价格、佣金、点击量或收入。Dashboard 支持手动确认发布；新增的发布队列默认 dry-run，`globalAutoPublishEnabled` 默认关闭，未审核、重复、超 280 字或未授权的任务不会 live 发布。

## 产品入口边界

当前固定成三层：

```text
guamee.org
= 公开官网 + sanitized 演示模式管理端 Demo

admin.guamee.org
= Cloudflare Access 保护的老板总后台 Demo，只给我自己或平台 admin 看

app.guamee.org
= 受保护真实客户后台 staging；Pages Functions + D1 地基阶段
```

重要边界：

- `guamee.org` 不展示老板总后台，不展示员工端入口，不打包真实 `data/`、`output/` 或 `.env`。
- `/dashboard` 是本地老板策略台，未来只应该放在 `admin.guamee.org` 这种私有入口后面。
- 公开 Demo 只展示 `/manager/?workspaceId=workspace_default`，而且只使用演示模式示例数据。
- 真实客户/团队以后进 `app.guamee.org`。第一版可以把管理端和执行人员操作合在同一个 workspace 管理端里，不必公开拆成 manager/staff 两个入口。
- `app.guamee.org` 当前开始进入 staging：部署 `build:app`，放在 Cloudflare Access 后面，使用 Pages Functions + D1。
- 每个 workspace 默认控制 30 个以内 X 账号。员工或执行人员处理这 30 个账号内的任务，但不拥有平台总后台。

## Local Runtime Data

本地跑 `npm run daily` 会更新运营数据，例如 `data/latest.json`、`data/daily/` 和 `output/` 里的每日报告。这些数据是你的运营资产，不是产品代码，不应该提交到 GitHub。

如果需要备份，把运行产物放到仓库外部，例如：

```text
/Users/dadada/Documents/英推-runtime-backups/YYYY-MM-DD-HHMMSS/
```

公开部署只走 sanitized build：`guamee.org` 使用演示数据，`admin.guamee.org` 使用 Access 保护的 admin demo。真实运营数据现在应该保存在本地，未来再进入私有 D1/Postgres。

提交前建议运行：

```bash
npm run git:safety
npm run release:check:public
npm run check
npm test
```

详细说明见 [docs/ops/local-runtime-data.md](docs/ops/local-runtime-data.md)。

## D1 Local MVP

D1 Local MVP 是给未来 `app.guamee.org` 准备的数据库地基。当前默认仍然是本地 JSON 模式：

```text
APP_STORAGE_MODE=json
```

JSON 适合现在的本地单人开发、公开 demo 构建和快速验证；D1 是未来真实 workspace、manager/staff 写入、审计日志、任务审核和反馈闭环的主数据库。本轮只做 local D1，不操作远程 D1，不接真实登录，不接 X live publish。

本地命令：

```bash
npm run d1:status
npm run d1:migrate:local
npm run d1:seed:local
npm run d1:migrate:dry-run
npm run d1:export-sql
npm run d1:import:local
```

说明：

- `db/migrations/0001_initial.sql` 是真实可执行的本地 D1 schema。
- `db/seed/demo.sql` 是无 token、无 secret、无真实 posted URL 的 demo seed。
- `npm run d1:migrate:dry-run` 只读取 JSON 并输出映射统计，不写数据库。
- `npm run d1:export-sql` 会生成 `db/seed/from-json.sql`，该文件已加入 `.gitignore`，不要提交真实运营数据导出的 SQL。
- `x_connections` 只允许保存 `token_ref`、`status`、`scopes_json`、`last_verified_at`，不保存 X token 明文。
- static `guamee.org` 和 admin demo 不会因为 D1 Local MVP 获得写入能力。

## App API MVP

`app.guamee.org` 是未来真实客户后台。第一版 App API 只做最小可写闭环：

- `GET /api/app/v1/session`
- `GET /api/app/v1/workspace`
- `GET /api/app/v1/manager/summary`
- `GET /api/app/v1/manager/tasks`
- `GET /api/app/v1/manager/accounts`
- `GET /api/app/v1/manager/feedback-debt`
- `POST /api/app/v1/manager/tasks/approve`
- `POST /api/app/v1/manager/tasks/reject`
- `POST /api/app/v1/manager/feedback`

本地开发可以用：

```text
http://127.0.0.1:4175/manager/?appMode=1&devEmail=owner@guamee.local
```

`devEmail` 只允许本地开发。`NODE_ENV=production`、`APP_ENV=production` 或 `APP_ENV=staging` 时会拒绝。

默认 storage 仍然是：

```text
APP_STORAGE_MODE=json
```

线上 staging 不信任普通 email header。`app.guamee.org` 必须通过 Cloudflare Access JWT 获取邮箱，后端验证 `Cf-Access-Jwt-Assertion` 后再查 D1 中的 user/workspace。

当前仍然不做 X live publish、自动发推、公开注册、复杂计费或 Discord 登录。

App build 命令：

```bash
npm run build:app
npm run release:check:app
```

`build:app` 包含 app placeholder 和 manager 页面，不包含 `/dashboard`、`/staff`、真实 `data/`、`output/`、token、secret、真实 posted URL 或真实 affiliate link。

## App Cloudflare Staging

`app.guamee.org` 的下一阶段是 Cloudflare Pages Functions + D1 staging：

```text
app.guamee.org
= Cloudflare Access protected
= Pages project build: npm run build:app
= Pages Functions route: /api/app/v1/*
= D1 binding: DB
= APP_ENV=staging
= APP_STORAGE_MODE=d1
```

新增命令：

```bash
npm run app:d1:status
npm run app:d1:create:staging -- --yes
npm run app:d1:migrate:staging -- --yes
npm run app:d1:seed:staging -- --yes
npm run app:seed:staging-sql
npm run verify:app-staging
```

说明：

- staging D1 数据库名：`ai_creator_os_app_staging`。
- `wrangler.jsonc` 里的 staging `database_id` 先保留 `<fill-after-create>`，创建 D1 后再填真实 ID。
- `db/seed/app-staging-demo.sql` 只包含安全 demo workspace、demo 用户、demo 账号和 demo 任务。
- staging seed 不包含 token、secret、真实 X handle、真实 posted URL、affiliate link 或本地 `output` markdown。
- 线上 app API 只在 `/api/app/v1/*` 下运行，不把 `/dashboard` 放进 app build。
- 远程 D1 create/migrate/seed 命令都要求显式 `--yes`。

部署说明见：

- [docs/deployment/app-cloudflare-staging.md](docs/deployment/app-cloudflare-staging.md)
- [docs/deployment/app-pages-project.md](docs/deployment/app-pages-project.md)
- [docs/deployment/app-access-d1-checklist.md](docs/deployment/app-access-d1-checklist.md)

## 快速开始

```bash
npm install
npm run daily
npm run x:auth
npm start
```

打开：

```text
http://127.0.0.1:4173/dashboard/
```

如果只想看 Markdown：

```text
output/YYYY-MM-DD-daily-x-pack.md
```

## 每天怎么用

1. 跑 `npm run daily`，生成今天的工具评分和英文文案。
2. 跑 `npm start`，自动找可用端口并打开本地页面。
3. 先看「今天打开后先看这里」。如果提示数据超过 6 小时，点 `刷新 Live Feed`。
4. 打开「账号策略」看 `Supply coverage`：如果 20×10 目标缺口很大，先补来源，不要硬发。
5. 跑 `npm run source-health`，先看哪些来源健康、哪些来源噪音大，需要调参或关闭。
6. 跑 `npm run source-queue`，看今天最缺 AI/Indie/SaaS/Crypto 哪类来源。
7. 跑 `npm run source-discovery`，打开按圈子生成的 X/Google/HN/Product Hunt/CoinDesk 搜索入口。
8. 跑 `npm run source-workbench`，把供给缺口、搜索入口、CSV 模板和来源健康度生成一份总报告。
9. 跑 `npm run source-pack`，拿 100 行 CSV 模板去外部补题。
   也可以在 Dashboard 的「来源补给」里点 `生成 100 行补题包`，直接看到按圈子分配的补题任务和 CSV/guide 入口；填完 CSV 后可直接在这一页粘贴预览评分并导入候选池。
10. 跑 `npm run supply-gap`，把圈层缺口、账号缺口和 100 行 source pack 合并成今天最该补的几批内容。
11. 如果你从 X、newsletter、微信群或官网看到新工具/话题，先放进「来源补给」或「候选收集」，并标好 circle，再点 `刷新 Live Feed` 让它参与评分。
12. 跑 `npm run draft-plan`，看每个账号今天能拿到哪些不重复候选。
13. 跑 `npm run content-calendar` 或打开「内容日历」，确认 20 个账号的目标能不能被冷却时间和当天草稿真实容纳。
14. 跑 `npm run account-matrix` 或打开「账号策略」里的 `Account content matrix`，看每个账号缺候选、缺新鲜内容、缺草稿还是缺排期。
15. 看「账号策略」里的 `Account refill workbench`，先处理今天前 5 个补给账号：打开搜索组、填真实候选、粘到候选收集预览。
16. 看「今日行动」顶部的 `Today operating target` 和 `Supply gap filler`，按它给出的真实上限发帖、补账号候选和补圈层来源，不要盯 200 条配置目标硬推。
17. 跑 `npm run scale-ramp` 或看「账号策略」里的 `Scale ramp plan`，先确定今天只启动哪 3 个种子账号、最多安全测试几条。
18. 跑 `npm run seed-pack` 或看「账号策略」里的 `Seed batch pack`，按当前种子账号生成可填写 CSV。
19. 跑 `npm run roadmap`，看除了 X 账号切换以外，产品级还卡在哪里。
20. 打开 Dashboard 的「产品路线图」，先看 Top blockers 和 Next sprint，不要被十几个 Tab 拖散。
21. 跑 `npm run promotion-review`，把值得进入联盟研究、长推、测评页或观察的候选集中审核。
22. 打开「账号策略」，看每条候选建议发到哪个账号画像；现在只是分配建议，不做多账号授权。
23. 打开「发布审核」，先看顶部 `Feedback command`。它会直接告诉你待补反馈、最老反馈债、今天还能安全新发几条、现在有几条 ready。
24. 再看 `Seed publish queue`。它会把今天最值得测的 1-3 条集中到一起，并显示账号、文案角度、safe gate 和待补反馈状态。
25. 如果 `Seed publish queue` 给出新鲜发布候选，复制文案或点「发布前确认」手动确认发布。
26. 如果你是在 X 页面手动发的，回到 Dashboard 点对应文案的「标记已发」。
26. 第二天或几个小时后先清空「待补反馈」，填 impressions、likes、bookmarks、replies、clicks 等。
27. 跑 `npm run learning-loop` 或看「反馈启动台」，确认今天最多还能安全新发几条、哪几条是 seed test、哪些已发内容必须先补 X Analytics。
28. 跑 `npm run feedback-ops` 或看「反馈学习闭环」，确认账号、angle、来源开始有真实表现数据。
29. 跑 `npm run scale` 或看「今日行动」里的放量准备度，确认今天卡在反馈、来源、排期还是授权。
30. 看「跟进队列」「联盟研究」「测评页候选」，只把有反馈的工具继续推进。
31. 对值得做测评页的工具点「生成测评页大纲」。
32. 每周跑 `npm run weekly` 或页面里的「生成周报」做复盘。

不要一开始就自动化发推。这个系统的核心是选题验证，不是批量制造内容。

## Foundation v4: 中心化数据与全局去重

Foundation v4 是多人化之前的地基。它解决的不是页面美观，而是一个更关键的问题：未来不能让每个员工各自复制一套系统、各自跑 `daily`、各自生成工具池和文案池。

正确的数据主线是：

```text
sources / latest
→ tools
→ topics
→ copy-library
→ duplicate-checker
→ post-tasks
→ post-ledger
→ feedback
→ weekly / affiliate / review
```

含义：

- `data/tools.json`：中心化工具池，同一个工具只保留一个 `toolId`。
- `data/topics.json`：中心化选题池，同一个工具可以有多个角度，但角度要可去重。
- `data/copy-library.json`：中心化文案库，每条文案有 `copyId`、`normalizedTextHash` 和相似度指纹。
- `data/post-tasks.json`：中心化发文任务池。未来员工只操作分配给自己的任务。
- `data/post-ledger.json`：中心化发布账本。所有账号发过什么、哪个工具、哪个链接、哪段文案，都从这里查。
- `scripts/lib/duplicate-checker.mjs`：全局去重闸门，检查工具、选题、文案、账号、员工、链接和任务风险。

现在仍然不做这些事：

- 不做无审核、无去重、无频控的自动发推。
- 不做批量重复发布。
- 不自动点赞、关注、评论。
- 不规避平台规则。
- 不保证收益。
- 不给员工看全局策略台。
- 不编造 affiliate link。

迁移旧数据到中心化文件：

```bash
npm run core:migrate
```

生成中心化任务池：

```bash
npm run tasks:generate
```

查看任务池：

```bash
npm run tasks:summary
```

查看员工工作台摘要：

```bash
npm run staff:summary
```

查看主管审核台摘要：

```bash
npm run manager:summary
```

查看发布账本：

```bash
npm run ledger:summary
```

检查系统：

```bash
npm run check
```

P1 员工工作台已经有手动版：

```text
http://127.0.0.1:4173/staff/
```

它只做员工自己的账号和任务：查看待处理文案、检查 X weighted 字符数、复制文案、标记已复制、手动标记已发、跳过任务。它不做主管台、不自动发推、不接数据库，也不会绕过中心化任务池和发布账本。

P1 Manager Review 已经有极简版：

```text
http://127.0.0.1:4173/manager/
```

它只看当前 workspace 的 `post-tasks`，支持主管批准、拒绝、分配账号、分配员工。它不看平台全局数据源，不看老板策略台，不自动发推，不接数据库。任务流转变成：

```text
raw candidate
→ topic / copy / task
→ manager approve / reject / assign
→ staff copy / manual post
→ feedback
```

未来做合规排程或多账号授权前，先保证这些中心化命令稳定。员工可以独立操作自己被分配的账号任务，但数据源不能独立。

## Workspace & Content Lanes

AI Creator OS 现在按域名和权限分层：

- `/dashboard` 是平台总后台，只给老板/admin 使用。它能看全局数据源、内容线、工具池、任务池、发布队列、post-ledger、duplicate risk、所有 workspace 概览和系统配置。公开站不应该暴露这个入口，未来放在 `admin.guamee.org` 后面。
- `/manager/?workspaceId=workspace_default` 是 workspace 管理端，只能看当前 workspace 的账号、执行人员、任务、publish jobs、反馈和已订阅内容线。它不显示其他 workspace，不显示平台数据源 API key，也不显示全局账本全量。公开 Demo 只暴露这个入口，并使用示例数据。
- `/staff/?workspaceId=workspace_default&userId=user_owner` 仍保留为本地实现面，但不作为公开产品入口。未来真实应用可以把员工执行放进同一个 workspace 管理流程里，让团队共同管理 30 个以内账号。

Workspace & Content Lanes 解决的是商业化之后最容易乱的问题：客户管理端可以分开，但数据源不能每个客户单独接一套。客户只订阅内容线，不拥有平台 source connectors。

正确结构是：

```text
平台级 source connectors
→ 平台级 source feeds
→ 平台级 raw candidates
→ content lanes 分类
→ workspace 订阅自己启用的 lanes
→ 后续再生成 topics / copy / post-tasks
```

现在有四条内容线：

- `ai_startups`：AI 创业圈，偏 AI product、agent、workflow、automation、founder insight。
- `indie_builders`：独立开发者圈，偏 solo founder、build in public、small tool、launch、revenue、workflow。
- `saas_founders`：SaaS 创始人圈，偏 pricing、onboarding、churn、PLG、sales、founder ops。
- `crypto_builders`：Crypto builder 圈，偏 onchain data、wallet UX、security、infra、dev tooling、community ops；默认拦截 price prediction、pump、signal、financial advice。

如果一个 SaaS 客户只想做 SaaS 创始人圈，只给他的 workspace 启用 `saas_founders` lane 即可。Crypto lane 默认禁止喊单、价格预测、投资建议、杠杆和赌博类话题，只保留 builder/product/security/workflow 角度。

初始化 workspace 和内容线：

```bash
npm run workspace:migrate
npm run lanes:seed
```

`workspace:migrate` 会创建 `workspace_default`，并给旧的 users、x-accounts、assignments、post-tasks、post-ledger、publish-jobs、x-connections、feedback 补 `workspaceId`。重复运行是幂等的，不会重复创建 workspace。

查看 workspace 摘要：

```bash
npm run workspace:summary
```

初始化内容线：

```bash
npm run lanes:seed
```

查看内容线、workspace 订阅、connector 和 raw candidates 摘要：

```bash
npm run lanes:summary
```

导入人工候选：

```bash
npm run candidates:ingest
```

查看 raw candidates 摘要：

```bash
npm run candidates:summary
```

第一阶段只支持 `data/manual-candidates.json` 人工候选进入 `data/raw-candidates.json`。它会按关键词初步分到四条 lane，检查重复 URL/title，记录 `data/source-runs.json`，并给 Crypto 风险词打 flag。它不会直接生成任务，也不会接真实第三方 API。

把 raw candidates 转进中心化生产链路：

```bash
npm run candidates:convert
```

它会按 workspace enabled lanes 过滤候选，然后生成中心化 `tools`、`topics`、`copy-library` 和 `post-tasks`。默认只生成 `pending_review` 任务，不自动发布。`example.com` 模板候选、Crypto 风险候选和 workspace 未订阅 lane 的候选会被跳过。

当前阶段明确不做：不接真实付费 API、不分发平台数据源 API key、不让每个 workspace 单独跑 daily、不自动发真实 X、不做投资建议、不做批量重复内容。

## Dashboard 怎么看

页面顶部有几个常用按钮：

- `刷新 Live Feed`：在 Dashboard 里直接跑一次 daily，重新拉 Product Hunt live feed、重算候选并更新本地 JSON。
- `重新读取`：只重新读取本地 JSON，不重新抓 Product Hunt。
- `复制今日计划`：生成并复制今天的行动计划。
- `生成周报`：生成最近 7 天复盘文件。
- `导出 JSON`：打开 `data/latest.json`。
- `今日 Markdown`：打开当天 Markdown 文案包。
- `切换主题`：深色/浅色切换，只存在浏览器本地。

页面 Tab 的含义：

- `今日行动`：今天优先做什么。顶部 `今天只做这 3 件事` 会把发布、联盟研究、长文/测评页压成三个明确动作；下面保留原始 action list 和系统建议。
- `产品路线图`：把 `npm run roadmap` 的产品级 readiness 报告可视化出来，直接回答“除了 X 账号切换还差什么”。它会显示整体分、Top blockers、Next sprint、每个维度的证据/缺口/下一步动作。
- `放量准备度`：在今日页显示 `npm run scale` 的结果。它会把目标账号数、今日安全发帖数、Fresh 候选、内容排期、来源缺口和反馈债放在一起，避免数据不足时硬放量。
- `发布审核`：发布前最终确认队列。顶部 `Feedback command` 会先显示反馈债务、最老待补时长、safe new posts 和 ready now；`Account conflict radar` 会把同工具、同 URL、同文案或账号冷却冲突的候选移出 ready。下面的 `Seed publish queue` 会列出今天最值得手动测试的 1-3 条，并要求发完立刻标记已发、回填 X Analytics；final review 会同时检查 Fresh today / Fresh 48h、`Feedback debt gate` 和账号冲突，只把当前允许继续测试的数量放进 ready；超过上限的候选会进入 `Hold for feedback`，并按分数自动建议转入联盟研究、长推、SEO 测评页或观察队列。
- `发布运营`：查看合规发布队列。这里能准备 publish jobs、跑 dry-run、看 X connection、看账号 publishMode、取消/重试 job。默认不 live 发布；全局 auto 没开时，live 按钮会保持禁用。
- `Workspace / 内容线`：平台总后台视角，查看所有 workspace、每个 workspace 启用的 lanes、账号/员工/任务/publish job 数量、每条 lane 的 raw candidate 数量、source run 和 high-risk/no-lane 候选。这里可以初始化内容线和导入 manual candidates，但仍然只写本地 JSON。
- `候选收集`：把 Product Hunt 之外的新工具手动放进本地收集箱；active 候选会在下一次 `daily` 或 `刷新 Live Feed` 时参与打分。
- `来源补给`：把 20×10 的内容缺口拆成圈子任务，集中显示需要补多少候选、哪些账号受影响、搜索入口、CSV 导入模板、质量 checklist 和来源健康度。每天内容不够时先看这里，不要靠低质内容硬凑。
- `内容日历`：把账号草稿排进本地人工审核槽，显示今天真实能审核多少条、草稿缺口、冷却容量缺口、每个账号的可发时间和文案。这里仍然只是 review calendar，不会自动发送。
- `工具池`：所有候选工具卡片，适合按分数、affiliate、风险、是否已发筛选。
- `文案库`：每个工具的 5 种英文文案，适合集中复制、标记已发，或手动确认发布到 X。
- `反馈录入`：已经标记已发的文案和表现数据。顶部会列出 `待补反馈`，也可以粘贴 CSV 批量导入 X 数据。
- `反馈启动台`：把反馈学习变成一个执行面板。它会显示当前阶段、最多还能安全新发几条、建议先测试的 seed posts、待补 X Analytics 的已发内容，以及可复制的 feedback CSV 模板。
- `反馈决策`：把录入的反馈转成下一步动作，判断哪些工具该加码、查联盟、做长推、做测评页或先观察。
- `跟进队列`：顶部 `Promotion review` 会先列出值得审核的候选；你确认后再手动加入 thread、review page、affiliate research、watch、skip。`Follow-up pipeline` 会显示活跃队列、下一步该处理哪项，以及每项下一步提示。
- `账号策略`：查看最多 20 个 X 账号画像、今日工具推荐发到哪个账号、每日限制、冷却时间、账号冲突雷达和 20×10 内容供给缺口。当前不做授权，只做分类和路由建议。
- `联盟研究`：记录真实查到的 programUrl、network、affiliateLink 和状态，并提供 affiliate / partner / referral 一键搜索链接。
- `测评页候选`：适合做 SEO review page 的工具，并可生成英文大纲。
- `历史复盘`：历史出现过的工具，避免连续推荐同一个工具。
- `每周复盘`：最近 7 天趋势、Top angle、摘要和系统建议。
- `设置/数据`：只读查看禁用词、affiliate links 数量和各类数据条数。

如果顶部「发布前信心」显示 `先别花 credits`，今日行动会优先提示 `先别付费发布`，并把旧候选转成观察、联盟研究或长文候选，而不是硬推荐你发推。顶部的发布守门员会同时显示三件事：数据年龄、数据来源、API 发布规则。只有 6 小时内的 live feed，并且候选是 `Fresh today` / `Fresh 48h`，才值得考虑花 API credits 发。

`反馈种子测试` 会在反馈闭环里挑最多 3 条新鲜、未发过、低风险、已有账号路由的候选，作为第一批手动测试。它只给建议和按钮：复制、发布前确认、标记已发、录入反馈；不会批量发布，也不会绕过确认弹窗。发完以后必须回填 X Analytics，否则 Feedback debt gate 会阻止继续放大。

`Seed publish queue` 会把这些 seed test 放到「发布审核」顶部，并标成 `未发`、`待补反馈` 或 `已测`。如果某条已经发出但还没补 metrics，它会提供 `填入这条反馈模板`，直接跳到「反馈录入」并填好对应 CSV 行，避免你在多账号场景下漏补数据。

`反馈启动台` 是更直接的执行页：如果还没有真实反馈，它会先给最多 3 条 seed tests；如果已经标记已发但没填 metrics，它会显示 `blocked_until_metrics` 并要求先补 X Analytics。这个页的目标是防止你在还没学到任何表现数据之前，就把 20 个账号一起放大。

`明天策略学习信号` 会把真实 X Analytics 转成 Top account、Top angle、Top source 和明天动作。没有 measured feedback 时它只会提示先做 seed test；有少量真实反馈后，系统会给匹配的账号/来源候选小幅 `learningScore` 加权，但不会覆盖 Fresh、质量、冷却和手动确认这些硬门槛。

`Feedback debt gate` 是硬门槛：只要已经标记已发但没有回填 X Analytics，顶部发布信心、发布审核队列和发布确认弹窗都会提示先补数据；如果 gate 变成 `blocked_no_metrics` 或 `feedback_debt_high`，本地发布 API 也会拒绝继续发布。手动记录已经发出的内容仍然允许保存，方便把真实历史补进系统。

`Feedback command` 是发布审核页的总控条：它把 `Feedback debt gate` 翻译成 4 个数字：pending metrics、oldest debt、safe new posts、ready now。你每天打开后先看这里；如果 pending metrics 大于 0，就先点 `填入待补反馈模板`，不要继续放量。

`Account conflict radar` 是账号级重复保护：它检查最近已发内容里的同工具、同 URL、同文案和账号冷却冲突。被标成 `blocked` 的候选不会进入发布审核 ready 队列，只能进入 Hold / watch / thread / review 方向，避免 20 个账号短期发同一个东西。

`Feed diagnostic` 会告诉你这次 Product Hunt feed 里到底有多少 `Today / 48h / 7d` 工具。如果 Top Picks 没有新鲜候选，它会说明是 feed 本身没新货，还是有新工具但评分不够，并列出 `Fresh feed watchlist` 供你手动观察。

`Candidate Inbox` 和 `Source Candidates` 是补充来源，不会自动发推，也不会自动生成 affiliate link。它们只是把 Product Hunt 之外的工具、话题和市场信号加入评分池，解决只靠 Product Hunt RSS 时候选不够新鲜的问题。

`Supply coverage` 会按 `config/content-sources.json` 里的目标计算供给：默认是 20 个账号，每号每天 10 条，质量线为 score 18+ 且不能是 `skip`。如果某个账号或圈子不够，系统会显示缺口，而不是用低质量内容硬凑。

`Draft planner` 会给每个账号分配不重复候选。一个工具最多进入一个账号的计划，所以它会更严格地暴露缺口；这是为了避免 20 个号发同一个工具的变体。

`Content calendar` 会把草稿放进账号级发布时间槽，并检查每日目标和冷却时间是否互相冲突。比如每号 10 条但冷却 6 小时，在一天内天然排不满，系统会显示 capacity gap，而不是假装可以完成。`Scale Reality` 会进一步告诉你：今天实际该审核多少条、按当前冷却每号更现实是几条、如果坚持当前目标需要把冷却降到多少小时。

Dashboard 的 `内容日历` 会把这些 slot 变成可执行的人工审核队列：按时间列出账号、文案、来源、复制按钮、发布前确认和标记已发。它不会批量发布，也不会绕过确认弹窗；发完后仍然要回到反馈页补 X Analytics。

`Source quality queue` 会把缺口翻译成今天该补的来源方向，例如 SaaS pricing、indie launch、crypto wallet tooling。它只给搜索方向和导入模板，不自动抓取不稳定站点。

Dashboard 的 `来源补给` 会把 `Supply coverage`、`Source quality queue`、`Source discovery` 和 `Source health` 合到一个工作台：先看缺口最大的圈子，打开搜索组，复制 CSV 模板，把真实候选粘到 `候选收集`，预览评分后再导入。导入后点 `刷新 Live Feed`，系统会重新评分并分配到账号。

`Source discovery` 会把这些缺口变成可点击搜索入口，例如 X live search、Google recent search、HN Algolia、Product Hunt 或 CoinDesk。它只做人工发现入口，不自动导入，避免把低质量噪音直接灌进内容池。

`Source health` 会给每个配置来源打健康分：候选数量、合格率、新鲜度、噪音率、是否需要调参或关闭。它是质量门禁，防止为了补 20×10 目标而把低质量 RSS 噪音灌进内容池。每条来源候选还会写入 `sourceQuality`，如果被判定为来源噪音，就会直接进入 `skip`，不会进入发布 seed test、draft plan 或内容日历；数量变少代表系统在拒绝用弱内容凑数。

`Promotion review` 会把候选工具和反馈信号翻译成手动审核清单：该查 affiliate、该做 SEO review page、该扩成长推，还是只观察。它不会自动入队，更不会自动发布；只有你点按钮后才写入本地队列。

`Product Roadmap` 是长期目标的控制台。它会把 X 账号切换单独标为 deferred，并优先暴露非授权问题：20×10 内容供给是否够、发布时间槽是否能容纳、反馈债是否挡住继续发、联盟研究是否能变现、来源是否足够多样、长文/测评页队列是否开始复利。本地 Dashboard 可以直接点 `刷新路线图` 重新生成；Vercel 线上版仍然只读。

批量粘贴后可以先点 `预览评分`，系统会按同一套 pain/niche/affiliate/content/novelty/risk 规则给候选打分，但不会保存。预览会给每条候选标记 `可导入`、`先人工看` 或 `跳过`，并提示是否和本次粘贴、Candidate Inbox 或今天的 daily 数据重复。

默认导入策略是 `只导入可导入项`：只保存非重复、过质量线的候选。`导入全部非重复项` 会把边界候选也保存进收集箱，适合你明确想人工再筛一遍时使用。

候选收集支持单条录入，也支持批量粘贴。批量粘贴可以用 CSV，`circle` 可填 `ai_startups`、`indie_hackers`、`saas_founders`、`crypto_builders`，`candidateType` 可填 `product` 或 `topic`：

```csv
name,url,tagline,source,circle,candidateType
Tool A,https://example.com,Fixes one narrow workflow,X,saas_founders,product
```

也可以一行一个：

```text
Tool A | https://example.com | Fixes one narrow workflow
Tool B | https://example.org | Better reporting for small teams
```

如果没有填写 `circle`，系统会根据名称、tagline、描述和 URL 尝试自动判断：AI/agent/LLM 归到 `ai_startups`，SaaS/pricing/churn 归到 `saas_founders`，indie/micro SaaS/build in public 归到 `indie_hackers`，crypto/web3/wallet/onchain 归到 `crypto_builders`。自动判断只是辅助，预览后仍然可以改成更准确的圈子再导入。

## 命令说明

```bash
npm run daily
```

拉取 Product Hunt，刷新已启用的 `config/content-sources.json` 来源，并合并 `data/candidate-inbox.json` 与 `data/source-candidates.json` 里的 active 候选。生成当天默认文案包，写入 `output/YYYY-MM-DD-daily-x-pack.md`、`data/daily/YYYY-MM-DD.json` 和 `data/latest.json`，并同步刷新 `data/scale-readiness.json`、`data/account-content-matrix.json`、`data/account-refill-workbench.json`、`data/content-ops-plan.json`、`data/supply-gap-filler.json`、`data/scale-ramp-plan.json`、`data/seed-batch-pack.json`、`data/account-conflict-radar.json` 与 `data/product-roadmap.json`。每日打分会读取真实反馈生成 `feedbackLearningSignals`：Top account / angle / source 只能小幅影响排序，不能绕过质量门禁。默认最多挑 40 个高质量候选；低于质量线的不会为了凑数进入 Top Picks。

```bash
npm run daily:top10
```

生成 Top 10 候选，适合你想多看一些备选时使用。

```bash
npm start
```

启动本地 Dashboard。默认从 `http://127.0.0.1:4173/dashboard/` 开始，如果 4173 被占用，会自动换到 4174、4175 等可用端口，并在 macOS 上自动打开浏览器。

```bash
npm run dashboard
```

用固定 4173 启动本地 Dashboard。适合你明确知道端口没被占用时使用。

```bash
npm run x:auth
```

打开 X OAuth 授权页，授权后把可发推的 `X_ACCESS_TOKEN` 写入本地 `.env`。需要先在 X Developer Console 的 User authentication settings 里配置好回调地址。

```bash
npm run history
```

查看历史推荐摘要，包括出现次数、重复工具和适合继续观察的候选。

```bash
npm run affiliate-queue
```

查看没有 affiliate link、但 affiliateScore 较高的工具。

```bash
npm run affiliate:research
```

生成联盟研究工作台，输出到 `data/affiliate-research-workbench.json` 和 `output/YYYY-MM-DD-affiliate-research-workbench.md`。它会合并今日高 affiliateScore 候选、跟进队列、已有研究记录和真实 affiliate 配置，给出优先级、搜索组、缺字段和可复制配置片段。

```bash
npm run core:migrate
```

把旧数据汇入 Foundation v4 中心池。它会读取 `data/latest.json`、`data/daily/*.json`、`data/history.json`、`data/feedback.json`、`data/account-posts.json` 和配置文件，更新 `data/tools.json`、`data/topics.json`、`data/copy-library.json`、`data/post-tasks.json`、`data/post-ledger.json`、`data/users.json`、`data/x-accounts.json`、`data/assignments.json`、`data/account-health.json` 和 `data/content-rules.json`。重复运行是幂等的，不会重复创建同一个 tool/copy/task/ledger。

```bash
npm run workspace:migrate
```

把本地数据升级到多 workspace 结构。它会确保 `workspace_default` 存在，并给 users、x-accounts、assignments、post-tasks、post-ledger、publish-jobs、publish-attempts、x-connections 和 feedback 补 `workspaceId`。重复运行是幂等的。

```bash
npm run workspace:summary
```

查看 workspace 摘要：workspace 数量、每个 workspace 的账号/员工/主管/任务/publish jobs 数量、缺 workspaceId 的数据、是否超过 accountLimit。

```bash
npm run tasks:generate
```

从中心化工具池、选题池、文案库和账号分配里生成 `pending_review` 或 `draft` 任务。生成时会调用 `duplicate-checker`，block/high risk 不会进入 approved，也不会自动发布。

```bash
npm run tasks:summary
```

查看中心化任务池摘要，包括总任务数、今日任务、状态分布、风险数量、缺账号/缺员工、员工任务数和账号任务数。

```bash
npm run staff:summary
```

查看 P1 员工工作台摘要，包括当前 workspace、当前员工、分配账号、可复制任务、已复制任务、待补反馈、超 280 weighted 字符和被拦截任务。可以用 `npm run staff:summary -- --workspace workspace_default --user staff_id` 查看指定员工。

```bash
npm run manager:summary
```

查看 Manager Review v1 摘要，包括当前 workspace、主管、待审核任务、已批准/已拒绝任务、未分配任务和不可批准任务。可以用 `npm run manager:summary -- --workspace workspace_default --manager user_owner` 查看指定 workspace。

```bash
npm run ledger:summary
```

查看中心化发布账本摘要，包括最近 7 天发布数、同工具/同 domain 排行、重复 copy hash、affiliate link 使用和账号外链情况。

```bash
npm run publish:prepare
```

从已批准的 `post-tasks` 里准备发布作业，写入 `data/publish-jobs.json`。重复运行不会重复创建同一个 task 的 job。默认不发布。

```bash
npm run publish:dry-run
```

对发布作业跑完整安全检查：账号是否 connected、任务是否 approved、weighted 字符是否 <= 280、duplicate-checker 是否通过、频率/外链/联盟链接/workspace lane 是否合规。它不调用 X API，只把 job 标成 `ready` 或 `blocked`。

```bash
npm run publish:run
```

默认仍按 dry-run 路径执行；只有明确传 `npm run publish:run -- --live`，并且 `data/publish-settings.json` 里 `globalAutoPublishEnabled` 为 `true`、对应账号/workspace/task 允许发布、job 通过 safe gate 时，才会调用 X API。不要在没有确认账号授权和内容质量前开 live。

```bash
npm run publish:summary
```

查看发布队列摘要：queued、ready、posted、failed、blocked、waiting approval、block 原因和当前安全设置。

```bash
npm run x:connections
```

查看 X 连接状态摘要：账号总数、connected/expired/revoked/error、哪些账号开启 scheduled/auto。`data/x-connections.json` 只存公开状态和 `tokenRef`，不要把真实 access token 写入这个文件。

```bash
npm run lanes:seed
```

初始化 Source Lane v1 数据地基：四条内容线、默认 workspace、平台级 source connectors、manual source feeds、workspace-lanes 订阅和 manual candidate 模板。重复运行是幂等的，不会重复创建同一条 lane 或 connector。

```bash
npm run lanes:summary
```

查看内容线摘要，包括内容线数量、每条线有多少 source feeds 和 raw candidates、每个 workspace 启用了哪些 lanes、哪些 connector 或 candidate 没有 lane。

```bash
npm run candidates:ingest
```

从 `data/manual-candidates.json` 导入人工候选到 `data/raw-candidates.json`。它只做候选入池、lane 分类、重复检查和 source run 记录，不会生成 topics、copy 或 post-tasks。

```bash
npm run candidates:summary
```

查看 raw candidate 摘要：总数、每条 lane 的数量、状态分布、duplicate/high risk、最近 source run、没有 lane 或没有 URL 的候选。

```bash
npm run candidates:convert
```

把 `data/raw-candidates.json` 里的真实候选转成中心化工具、选题、短推文案和员工任务。它会先看 workspace 启用了哪些 lanes，只转换匹配的候选；生成的 copy 默认是 `no_link` 短推，并带 `weightedCharCount`，任务仍然需要人工审核/复制/手动发布。

```bash
npm run sources
```

单独刷新和查看补充内容来源。默认开启 TechCrunch AI 与 CoinDesk crypto 两个 RSS 源，并用 include/exclude 关键词过滤纯新闻噪音。HN、Product Hunt 二次源等不稳定或重复来源默认关闭，你可以在 `config/content-sources.json` 里测试后再打开。

```bash
npm run source-discovery
```

生成来源发现包，输出到 `data/source-discovery.json` 和 `output/YYYY-MM-DD-source-discovery.md`。它按 AI startup、Indie hacker、SaaS founder、Crypto builder 当前缺口生成搜索链接、来源建议和人工筛选 checklist。

```bash
npm run source-health
```

生成来源健康报告，输出到 `data/source-health.json` 和 `output/YYYY-MM-DD-source-health.md`。它会按来源统计 candidates、qualified、noise、freshness、healthScore，并给出 keep/tune/disable/needs candidates 建议。
对 CoinDesk 这类宽来源，系统会额外检查是否真的有 crypto/builder/product/tooling 角度；纯 Nasdaq、IPO、股票涨跌、名人热点等泛市场项会被标记为来源噪音。

```bash
npm run source-queue
```

把当前 `Supply coverage` 缺口转成来源补充任务，输出到 `data/source-quality-queue.json` 和 `output/YYYY-MM-DD-source-quality-queue.md`。

```bash
npm run source-workbench
```

生成来源补给总报告，输出到 `data/source-supply-workbench.json` 和 `output/YYYY-MM-DD-source-supply-workbench.md`。它把 supply gap、source queue、discovery links、source health 和 CSV 导入模板合成一份可执行清单。

```bash
npm run source-pack
```

生成 100 行补来源 CSV 模板，输出到 `output/source-import-pack/YYYY-MM-DD-source-import-template.csv`，并同步生成 `data/source-import-pack/YYYY-MM-DD.json` 和 `data/source-import-pack/latest.json` 给 Dashboard 使用。模板会按缺口自动分配 circle，但需要你手动填真实 name、url、tagline 后再导入。

```bash
npm run supply-gap
```

生成内容供给缺口补齐器，输出到 `data/supply-gap-filler.json` 和 `output/YYYY-MM-DD-supply-gap-filler.md`。它会把 source pack 的圈层缺口、账号补给工作台和账号内容矩阵合并成今天最该补的几批内容：先补哪个圈层、影响哪些账号、打开哪些搜索组、复制哪段 CSV、填完后该跑什么命令。CSV 仍然是空 name/url/tagline 模板，必须人工填真实候选，不会自动编造内容。`npm run daily` 会自动刷新它。

```bash
npm run draft-plan
```

按账号生成不重复草稿规划，输出到 `data/draft-plans/YYYY-MM-DD.json`、`data/draft-plans/latest.json` 和 `output/YYYY-MM-DD-draft-plan.md`。一个工具只分配给一个账号，不够就显示 gap。

```bash
npm run content-calendar
```

按账号冷却时间把草稿排进当天发布时间槽，输出到 `data/content-calendar/YYYY-MM-DD.json`、`data/content-calendar/latest.json` 和 `output/YYYY-MM-DD-content-calendar.md`。如果目标和冷却时间冲突，会显示 capacity gap 和建议冷却时间。

```bash
npm run account-matrix
```

生成账号内容矩阵，输出到 `data/account-content-matrix.json` 和 `output/YYYY-MM-DD-account-content-matrix.md`。它会按账号计算候选池、强候选、新鲜候选、草稿、排期和反馈缺口，并给出账号级搜索任务。

```bash
npm run refill-workbench
```

生成账号补给工作台，输出到 `data/account-refill-workbench.json` 和 `output/YYYY-MM-DD-account-refill-workbench.md`。它会从账号内容矩阵里挑出今天最该补的账号，集中给出搜索组、补题 CSV、first bottleneck 和执行顺序。`npm run daily` 会自动刷新它；只有需要单独重算补给清单时才手动跑这个命令。

```bash
npm run content-ops-plan
```

生成今日内容运营计划，输出到 `data/content-ops-plan.json` 和 `output/YYYY-MM-DD-content-ops-plan.md`。它会把 20 账号目标压成今天现实可执行的上限：最多安全发几条、先补哪几个账号、先找哪些圈层候选、导入后要跑什么命令。`npm run daily` 会自动刷新它。

```bash
npm run scale-ramp
```

生成规模爬坡计划，输出到 `data/scale-ramp-plan.json` 和 `output/YYYY-MM-DD-scale-ramp-plan.md`。它会把账号拆成种子测试、下一批、暂缓研究，并给出今天安全测试发帖上限、阶段退出条件和每个账号下一步。

```bash
npm run seed-pack
```

生成种子账号补题包，输出到 `data/seed-batch-pack.json`、`output/YYYY-MM-DD-seed-batch-pack.md` 和 `output/YYYY-MM-DD-seed-batch-template.csv`。它会按当前 `Scale ramp plan` 的种子账号分配 CSV 行，方便你只补最值得启动的账号。
填完 CSV 后粘到「候选收集」或「来源补给」的批量导入预览区，系统会按 `accountId` 显示每个种子账号是否已有 3 条可导入候选：绿灯代表够做小批量种子测试，黄灯代表需要人工修/审，红灯代表不够启动。

```bash
npm run conflict-radar
```

生成账号冲突雷达，输出到 `data/account-conflict-radar.json` 和 `output/YYYY-MM-DD-account-conflict-radar.md`。它会检查同工具跨账号、同 URL、同文案复用和账号冷却时间冲突；Dashboard 的「发布审核」会用它把冲突候选移出 ready 队列。

```bash
npm run roadmap
```

生成产品级 readiness/roadmap 报告，输出到 `data/product-roadmap.json` 和 `output/YYYY-MM-DD-product-roadmap.md`。它会把 X 账号切换标为 deferred，并优先指出内容供给、日历、反馈闭环、affiliate 变现、来源多样性等非授权阻塞点。`npm run daily` 也会自动刷新它；只有需要单独重算路线图时才手动跑这个命令。

```bash
npm run scale
```

生成放量准备度报告，输出到 `data/scale-readiness.json` 和 `output/YYYY-MM-DD-scale-readiness.md`。它会计算目标账号数、目标日发帖量、safe new posts、Fresh 候选、内容排期、来源缺口和反馈债；如果 safe gate 没打开，会明确提示不要按 20 账号目标硬放量。

```bash
npm run accounts
```

查看 20 个 X 账号画像、手动轮换规则、20×10 供给缺口，以及今天每个工具建议发到哪个账号。这个命令只读配置和 `data/latest.json`，不会授权、不会发推。

按账号绑定 X OAuth token 时使用：

```bash
npm run x:auth -- --account ai_tools_lab
```

把 `ai_tools_lab` 换成 `config/x-accounts.json` 里的任意 `accountId`。授权成功后 token 会写进本地 `.env` 的账号命名空间，例如 `X_ACCOUNT_AI_TOOLS_LAB_ACCESS_TOKEN`，不会写进 Git。

```bash
npm run feedback
```

汇总发推反馈，列出 engagementScore 高的文案、表现好的 angle、值得继续跟进的工具。

```bash
npm run feedback-ops
```

生成反馈运营报告，输出到 `data/feedback-ops.json` 和 `output/YYYY-MM-DD-feedback-ops.md`。它会按账号、文案角度、来源统计真实表现，并列出哪些已发内容还缺 X Analytics 数据。报告里的 `Feedback debt gate` 会提示当前是否该继续发、最多还能发几条测试内容，还是应该先补反馈；`Seed Test Plan` 会列出最多 3 条适合启动反馈学习的小批量手动测试。

```bash
npm run learning-loop
```

生成反馈学习启动台数据，输出到 `data/learning-loop.json` 和 `output/YYYY-MM-DD-learning-loop.md`。它会把 `feedback-ops` 的结果压成一个执行清单：当前学习阶段、最多还能安全新发几条、先发哪几条 seed posts、哪些已发内容缺 metrics，以及可复制到反馈录入页的 CSV 模板。

在本地 Dashboard 的「反馈启动台」也可以点 `刷新学习报告`，它会先刷新 `feedback-ops`，再刷新 `learning-loop`。Vercel 公开 Demo 仍然只读，不能写本地 JSON。

```bash
npm run decisions
```

根据真实反馈生成下一步行动建议，并标出是否已经在队列里。

```bash
npm run promote
```

根据 daily score、历史和 feedback 给出系统建议：thread candidate、review page candidate、affiliate priority、watch 或 skip。

```bash
npm run promotion-review
```

生成推广审核清单，输出到 `data/promotion-review.json` 和 `output/YYYY-MM-DD-promotion-review.md`。它会把建议动作映射到真实队列类型：`affiliate_research`、`thread`、`review_page`、`watch`，并标记 `ready_to_queue`、`already_queued`、`needs_feedback`。这个命令只读数据，不会自动写入队列。

```bash
npm run review:queue
```

查看 SEO review page 队列。

```bash
npm run review:generate -- --tool "Tool Name"
```

给指定工具生成英文测评页大纲，输出到 `output/reviews/`，并写入 `data/review-pages.json`。

```bash
npm run today-plan
```

生成今天的行动计划，输出到终端并写入 `output/YYYY-MM-DD-today-plan.md`。

```bash
npm run weekly
```

生成最近 7 天复盘，输出到 `output/YYYY-MM-DD-weekly-report.md` 和 `data/weekly/YYYY-MM-DD.json`。

```bash
npm run check
npm test
npm audit --audit-level=moderate
```

做结构校验、核心逻辑测试和依赖安全检查。

## 数据文件

- `data/latest.json`：Dashboard 默认读取的最新每日结构化数据。
- `data/daily/*.json`：每天的结构化快照。
- `data/users.json`：Foundation v4 用户主数据，区分 staff、manager、admin。
- `data/x-accounts.json`：Foundation v4 账号主数据，给未来员工任务分配和账号健康检查使用。
- `data/assignments.json`：员工和账号的中心化分配关系。
- `data/tools.json`：中心化工具池，沉淀 `toolId`、domain、首见/末见、分数和 affiliate 状态。
- `data/topics.json`：中心化选题池，沉淀工具角度、受众、痛点、用途和去重分组。
- `data/copy-library.json`：中心化文案库，保存 `copyId`、标准化 hash、相似度指纹和使用记录。
- `data/post-tasks.json`：中心化发文任务池，未来员工只能操作这里分配给自己的任务。
- `data/post-ledger.json`：中心化发布账本，记录所有账号发过的工具、文案、链接和 metrics。
- `data/account-health.json`：账号健康度快照，给去重和任务分配提供账号级信号。
- `data/content-rules.json`：全局内容和去重规则，例如同工具冷却、外链上限、人工审核要求。
- `data/workspaces.json`：workspace 主数据。客户/内部团队只订阅内容线，不拥有独立数据源。
- `data/content-lanes.json`：四条内容线定义，包括 allowedTopics、blockedTopics、默认风格和链接策略。
- `data/workspace-lanes.json`：workspace 与 lane 的订阅关系，后续任务生成会按这里过滤。
- `data/source-connectors.json`：平台级数据源连接器，记录 Product Hunt、manual、HN、GitHub、paid search 等连接器；不是客户级配置。
- `data/source-feeds.json`：平台级 feed 配置，每条 feed 归属一条 content lane。
- `data/manual-candidates.json`：人工候选入口，第一阶段由人把高质量工具/话题放到这里。
- `data/raw-candidates.json`：平台级原始候选池，`candidates:ingest` 会写入这里，`candidates:convert` 会把真实候选转成 topics/copy/tasks。
- `data/source-runs.json`：预留的数据源运行记录，未来接真实 API 时记录每次 source run。
- `data/history.json`：历史推荐记录，包含 seen before 和降权依据。
- `data/feedback.json`：发推记录和手动录入的表现数据。
- `data/feedback-ops.json`：反馈学习闭环报告，包含 pending metrics、账号表现、angle 表现和来源表现。
- `data/learning-loop.json`：反馈学习启动台，包含 seed tests、待补 metrics、safe new posts 和 CSV 模板。
- `data/queues.json`：thread、review page、affiliate research、watch、skip 队列。
- `data/account-posts.json`：预留的多账号发帖记录文件，后续授权后用来做账号级去重和冷却。
- `data/source-candidates.json`：从补充 RSS/Atom 来源刷新来的候选缓存。
- `data/source-discovery.json`：按当前供给缺口生成的来源发现包和搜索入口。
- `data/source-health.json`：按来源计算的健康分、噪音率和调参/关闭建议。
- `data/source-quality-queue.json`：按账号和圈子缺口生成的补来源任务。
- `data/draft-plans/*.json`：按账号生成的不重复草稿规划。
- `data/content-calendar/*.json`：按账号冷却时间生成的本地发布审核日历。
- `data/account-content-matrix.json`：账号级内容供给矩阵，回答每个账号离日发目标还缺多少候选、新鲜内容、草稿和排期。
- `data/content-ops-plan.json`：今日内容运营计划，回答今天最多安全发几条、先补哪些账号和圈层候选。
- `data/supply-gap-filler.json`：内容供给缺口补齐器，回答今天先补哪几个圈层/账号、打开哪些搜索组、复制哪段 CSV。
- `data/scale-ramp-plan.json`：规模爬坡计划，回答先启动哪几个账号、今天安全测试几条、哪些账号暂时只补来源。
- `data/seed-batch-pack.json`：种子账号补题包，回答今天该优先给哪些账号补 CSV 候选行。
- `data/account-conflict-radar.json`：账号冲突雷达，回答哪些候选因为同工具、同 URL、同文案或账号冷却冲突不能进 ready。
- `data/product-roadmap.json`：产品级 readiness/roadmap 报告。
- `data/scale-readiness.json`：放量准备度报告，回答今天是否适合从小批量测试扩大到多账号发布。
- `data/promotion-review.json`：值得手动审核加入队列的 promotion 清单。
- `data/affiliate-research.json`：真实查到的 affiliate program 研究记录。
- `data/review-pages.json`：已经生成的 SEO review outline 记录。
- `data/weekly/*.json`：每周复盘结构化数据。
- `data/backups/YYYY-MM-DD/`：写入重要 JSON 前的本地备份。
- `config/affiliate-links.json`：你已经拥有的真实 affiliate links。
- `config/x-accounts.json`：最多 20 个 X 账号画像、分类、关键词、每日限制和冷却时间。这里不存 token。
- `config/content-sources.json`：AI 创业、独立开发者、SaaS 创始人、Crypto builder 四个圈子的来源、关键词过滤和供给目标。
- `config/voice.json`：英文文案风格和禁用词。

## 配置 Affiliate Link

编辑 `config/affiliate-links.json`：

```json
{
  "links": [
    {
      "name": "Tool Name",
      "match": "tool-name-or-domain",
      "keywords": ["keyword"],
      "domains": ["example.com"],
      "affiliateUrl": "https://tool.com/?ref=your-real-id",
      "note": "program note"
    }
  ]
}
```

匹配逻辑会看工具名、Product Hunt URL、tagline、domain、keywords 和 match。只有匹配到真实配置时才会使用 affiliate link。没有匹配时会显示：

```text
No affiliate link yet — research needed
```

不要把没申请到的链接写进去。Dashboard 的「联盟研究」可以记录你查到的 programUrl、network、申请状态和真实 affiliateLink，但不会自动替你编造链接。

## 调整英文文风

编辑 `config/voice.json`。

常用字段：

- `allowEmoji`：是否允许 emoji。
- `maxTweetCharacters`：单条 X 文案长度上限。
- `avoid`：禁用词列表。

建议保持：

- 英文自然，像个人观察。
- 不像广告。
- 不承诺收益。
- 不夸张。
- 一条文案只讲一个痛点或观察。

`npm run check` 会检查禁用词是否出现在 copyVariants 中。Dashboard 的「文案库」也会显示 `Copy QA`，包括字数、禁用词和高风险承诺词；如果发布弹窗发现 voice 禁用词，会直接阻止发布。

## 手动确认发布到 X

Dashboard 里的「今日行动」和「文案库」会出现 `发布到 X` 按钮。

发布流程：

1. 点某条文案的 `发布到 X`。
2. 弹窗里先选择账号。默认是系统推荐账号，但你可以手动改。
3. 检查账号安全：账号是否已绑定、今日限额、账号冷却、同工具冷却、同文案冷却。
4. 再检查文案和发布前 checklist。
5. 如果出现 `暂不能 API 发布`，先按提示处理，比如绑定该账号 token、缩短文案或刷新 Live Feed。
6. 如果出现 `需要额外确认`，说明这条可能是 Seen before、Older useful，或文案里有收益/承诺类高风险词；确认仍要发时，需要额外勾选风险确认。
7. 勾选“我确认这条内容可以发布到 X”。
8. 点 `确认发布`。

后端还会再次校验 `confirmed: true`，所以不会静默自动发。

## 合规发布队列 / Auto Publish Foundation

AI Creator OS 现在有发布队列地基，但默认是安全关闭：

- `data/publish-settings.json` 里 `globalAutoPublishEnabled` 默认是 `false`。
- `dryRunByDefault` 默认是 `true`。
- `allowedPublishModes` 默认只有 `manual` 和 `scheduled`，不包含 `auto`。
- `data/x-connections.json` 只保存连接状态和 `tokenRef`，不保存明文 access token。
- Vercel 线上版是静态只读，只能看数据，不能 live 发布。

自动发布不是“看到按钮就全发”。一条任务要 live 发布，必须同时满足：

```text
account connected
+ workspace/account/task 允许对应 publishMode
+ task approvalStatus approved
+ task status 在 approved/scheduled/assigned/copied 的允许范围
+ weightedCharCount <= 280
+ duplicate-checker 没有 block
+ account status active
+ account daily/link limits ok
+ global same tool/domain/affiliate limits ok
+ publish window reached
+ post-ledger 里没有同 taskId
```

否则会进入 `blocked`，原因写入 `data/publish-jobs.json` 和 `data/publish-attempts.json`。真实发布成功后会写入 `post-ledger`，并把任务变成 `feedback_due`，要求补 X Analytics。

Dashboard 的「发布运营」可以做四件事：

1. 准备发布队列。
2. 跑 dry-run 安全检查。
3. 查看 X connection 和账号 publishMode。
4. 取消或重试被 blocked/failed 的 job。

不要做的事：

- 不要让多个账号发同一条或高度相似内容。
- 不要自动点赞、关注、评论、转发。
- 不要用浏览器指纹或网页模拟规避风控。
- 不要把 API key、access token 写进仓库或返回给前端。
- 不要把未审核、超 280、重复、未授权的内容 live 发布。

要真正调用 X API，推荐先用按账号绑定的本地授权命令生成 token：

```bash
npm run x:auth -- --account ai_tools_lab
npm run dashboard
```

`npm run x:auth -- --account ai_tools_lab` 会打开 X 授权页，授权成功后把该账号的 access token 写进 `.env`。Dashboard 启动时会自动读取 `.env`，并在「账号策略」里显示每个账号的绑定状态。

在 X Developer Console 里这样配置：

- App permissions：`Read and write`。
- Type of App：`Native App`。
- Request email from users：关闭。
- Callback URI / Redirect URL：`http://127.0.0.1:8787/callback`。
- Website URL：可以先填你的 X 主页或个人站，例如 `https://x.com/guamee4`。

如果你只做单账号测试，也可以继续用旧的全局 token：

```bash
export X_ACCESS_TOKEN="你的 X OAuth 2.0 User Context access token"
npm run dashboard
```

但多账号发布不会把全局 token 当成某个账号的授权，避免误用 A 账号 token 发到 B 账号逻辑里。账号 token 需要有 `tweet.write` 权限。未绑定账号 token 时，页面可以预览和记录手动发帖，但不能调用 X API 发布。

Dashboard 的「账号策略」和「设置/数据」会显示 X 授权健康状态：

- `已配置`：access token 当前可用。
- `已过期，可刷新`：access token 已过期，但有 refresh token；点击发布时会先刷新再发。
- `已过期`：没有 refresh token，先重新跑 `npm run x:auth`。
- `未配置`：只能预览，不能调用 X API。

发布成功后，系统会把 X status URL、`accountId`、`accountName` 写入 `data/feedback.json`，并同步写入 `data/account-posts.json`，默认 metrics 为 0，后续你可以继续录入表现数据。

注意：

- 不要把 token 写进 `config/*.json`。
- 不要把 token 提交到 git。
- `.env` 已经在 `.gitignore` 里，不要把里面的 key/token 发给别人。
- OAuth 授权只在本机临时运行，用完即可关闭。
- 仍然建议一天只发少量、人工确认过的内容。

## 评分和跟进逻辑

每个工具会拆成这些分项：

- `painScore`：痛点是否明确。
- `nicheScore`：是否适合小众人群。
- `affiliateScore`：是否有付费、订阅、转介绍或联盟潜力。
- `contentScore`：是否容易写成英文 X thread 或测评页。
- `noveltyScore`：是否有新鲜感。
- `riskScore`：是否太泛、太卷、太像一次性热点。

历史出现过的工具会标记 `Seen before` 并降权。fallback sample 在 Product Hunt 网络失败时可以让命令继续跑，但不会污染长期 history。

## 反馈分数

发推后录入 metrics，系统会计算：

```text
engagementScore =
likes * 1
+ bookmarks * 3
+ replies * 4
+ reposts * 5
+ clicks * 4
+ profileVisits * 2
+ min(impressions / 100, 20)
```

同时会计算 engagementRate、saveRate、replyRate、clickRate。impressions 为 0 时 rate 会显示为 0，不会出现 NaN。

### CSV 批量导入反馈

打开 Dashboard 的「反馈录入」，把表格或 CSV 粘贴到 `CSV / X Analytics 粘贴导入` 里。

如果已经在 Dashboard 里点过「标记已发」，先点「填入待补模板」。它会自动带上 `feedbackId`、工具名、账号和 X 链接，你只需要把 X Analytics 里的数字补进去，再点「预览导入」。

「标记已发」会先打开确认弹窗，不会静默保存。请确认账号，尽量填 `Post URL`；保存后系统会记录 `postedAt` 并把它放进 `待补反馈`，等 X Analytics 出数据后再补真实指标。

推荐表头：

```csv
feedbackId,toolName,variantType,postedUrl,views,likes,saves,replies,reposts,url clicks,profile clicks,notes
feedback_xxx,Mailwarm 2.0,shortPost,https://x.com/your/status/123,1200,18,6,3,1,9,4,first test
```

也可以从 X Analytics 复制表格直接粘贴，系统会识别 tab 分隔和常见表头：

```text
Post text	Tweet permalink	Views	Likes	Saves	Replies	Reposts	URL clicks	Profile clicks
Your posted copy...	https://x.com/your/status/123	1200	18	6	3	1	9	4
```

说明：

- `toolName` 会优先匹配当天 `data/latest.json` 里的工具。
- 如果某条推已经在 Dashboard 点过「标记已发」，粘贴 X Analytics 时可以通过 `feedbackId`、`Tweet permalink` 或 `Post text` 匹配到原记录。
- `Views` 会当作 `impressions`，`Saves` 会当作 `bookmarks`，`URL clicks` 会当作 `clicks`，`Profile clicks` 会当作 `profileVisits`。
- `variantType` 可填 `shortPost`、`casualPost`、`contrarianAngle`、`painPointHook`、`threadOpening`。
- 如果没有 `copyText`，系统会用匹配工具对应的文案补上。
- 如果某一行无法匹配 toolName/toolUrl/copyText，会跳过并提示。

## Public Demo Deployment

`guamee.org` 现在只适合做公开官网和 sanitized 演示模式 Demo。公开构建由 `npm run build:public` 生成，根页面是产品介绍，只链接到管理端 Demo。

Cloudflare Pages 当前配置：

```text
Project name: ai-creator-os-public
Git provider: GitHub
Repository: guamee16888/yingtui-affiliate-system
Production branch: main
Build command: npm run build:public
Output directory: dist
Custom domain: guamee.org
```

旧的 `ai-creator-os` 是 direct-upload 项目，不会跟随 GitHub 自动部署；`guamee.org` 不应该再挂在旧项目上。

兼容别名：

```text
build:demo = build:public
release:check = release:check:public
```

公开版本的边界：

- 公开根页面不链接 `/dashboard`。
- 公开根页面不链接 `/staff`。
- `dist/` 不包含真实 `data/` 和 `output/` 文件夹。
- `dist/` 不包含 `.env`。
- `dist/` 只包含 `public/`、`manager/` 和 `data/demo-manager-summary.json`。
- 管理端 Demo 在没有 API 时读取 `demo-manager-summary.json`，展示示例 workspace，不写入任务。
- 不能刷新 Product Hunt。
- 不能写入 feedback / queue / affiliate research。
- 不能发布到 X，也不要在公开部署环境配置 X token。

私有后台边界：

- `admin.guamee.org`：Cloudflare Access 保护的私有老板总后台 Demo，未来继续作为 owner/admin 入口。
- `app.guamee.org`：Cloudflare Access 保护的占位客户后台，未来需要登录、权限、workspace 隔离和数据库。

本地仍然是唯一真实运营工作台：

```bash
npm start
```

部署前检查：

```bash
npm run demo:sanitize
npm run build:public
npm run release:check:public
```

## Admin Demo Deployment

`admin.guamee.org` 是未来私有老板总后台预览环境。这个构建可以包含 `/dashboard`，但只能部署在 Cloudflare Access 保护的子域名后面。

部署前先跑：

```bash
npm run admin:preflight
```

Admin demo 构建：

```bash
npm run build:admin-demo
npm run release:check:admin
```

Admin demo 的边界：

- 可以包含 `dashboard/`。
- 可以包含 `manager/`。
- 当前不包含公开员工端入口。
- 只使用 sanitized demo data。
- 页面必须显示 `受保护总后台演示`。
- `globalAutoPublishEnabled=false`。
- `dryRunByDefault=true`。
- 不包含真实 `data/`、`output/`、`.env`、token、真实 X handle、真实 postedUrl 或真实 affiliate link。
- 不允许 live publish。
- 不允许真实写入。

Cloudflare Pages admin 项目建议：

```text
Project name: ai-creator-os-admin
Production branch: main
Build command: npm run build:admin-demo
Output directory: dist
Custom domain: admin.guamee.org
```

Cloudflare Access 验证：

```bash
npm run verify:admin-access
```

如果还没有配置 DNS / Pages custom domain / Access，这个命令可能失败，这是正常的。配置完成后，未登录访问 `https://admin.guamee.org` 应该被 Access 拦截；登录后才能看到 `受保护总后台演示`。

本地或临时开放预览可用：

```bash
npm run verify:admin-access -- --url http://127.0.0.1:4175/dashboard/ --expect-open
```

Cloudflare 手动配置说明：

- [docs/deployment/domain-plan.md](docs/deployment/domain-plan.md)
- [docs/deployment/public-demo.md](docs/deployment/public-demo.md)
- [docs/deployment/admin-access.md](docs/deployment/admin-access.md)
- [docs/deployment/admin-pages-project.md](docs/deployment/admin-pages-project.md)
- [docs/deployment/cloudflare-access-admin.md](docs/deployment/cloudflare-access-admin.md)

如果要把真实应用接到 D1，先通过 backend contract：

```bash
npm run backend:contract
```

## App Placeholder Deployment

`app.guamee.org` 目前不是正式客户后台，而是受保护占位页。这个页面用于避免浏览器直接显示 `ERR_CONNECTION_CLOSED`，同时明确真实 app 后端还没上线。

构建和检查：

```bash
npm run build:app-placeholder
npm run release:check:app-placeholder
```

Cloudflare Pages 建议：

```text
Project name: ai-creator-os-app
Production branch: main
Build command: npm run build:app-placeholder
Output directory: dist
Custom domain: app.guamee.org
```

Cloudflare Access 验证：

```bash
npm run verify:app-access
```

当前 Cloudflare Pages 项目为 `ai-creator-os-app`，Custom domain 为 `app.guamee.org`。`app.guamee.org` 和 `ai-creator-os-app.pages.dev` 都应该有 Zero Trust Access 的 Self-hosted application，Policy 使用 `owner only` 或只允许你的邮箱 / owner-admin group。

如果 `app.guamee.org` 还没创建 Pages 项目或绑定域名，验证可能返回 warning，这是预期结果。需要先在 Cloudflare Pages 添加 custom domain，再在 Zero Trust Access 创建 Self-hosted application。

占位页不会包含 `/dashboard`、`/manager`、`/staff`、真实 `data/`、`output/`、`.env`、token、postedUrl、affiliate link 或 X posting controls。

## App Backend Roadmap

真实可写后台以后不要直接在线上写 JSON。JSON 模式适合本地验证和快速迭代，但多人、多 workspace、多账号以后需要服务端权限、审计日志和数据库事务。

建议路线：

1. `guamee.org` 保持公开静态 Demo。
2. `admin.guamee.org` 先用 Cloudflare Access 保护，只给 owner/admin 进入。
3. `app.guamee.org` 先用 Cloudflare Access 做内测，再做正式 workspace 登录。
4. Cloudflare D1 作为第一版主数据库，存 workspace、users、accounts、tasks、ledger、feedback、publish jobs、audit logs。
5. Cloudflare KV 只放低风险缓存、feature flags 或公开配置，不当任务状态主库。
6. Cloudflare Queues 以后用于 source ingest、publish jobs 和异步重试。
7. 接 D1 前先让 `npm run backend:contract` 通过。

当前已提供：

- `docs/backend/app-backend-contract.md`
- `docs/backend/data-boundary.md`
- `docs/backend/d1-schema.sql`
- `docs/backend/api-contract.md`
- `docs/backend/auth-plan.md`
- `docs/backend/json-to-d1-migration-plan.md`
- `docs/backend/security-checklist.md`
- `docs/backend/deployment-plan.md`
- `scripts/lib/storage-adapter.mjs`
- `scripts/lib/json-storage-adapter.mjs`
- `scripts/lib/d1-storage-adapter.stub.mjs`

当前仍然没有做：

- 不接真实 D1。
- 不接真实登录。
- 不做云端 token 托管。
- 不做无确认自动发推。
- 不把真实老板总后台放到 `guamee.org`。

## Affiliate Research 搜索

打开「联盟研究」后，每个候选工具旁边会有搜索组：

- 官网或来源文章
- official affiliate / partner / referral
- PartnerStack
- Impact
- Rewardful
- Terms

它们只会打开 Google 搜索，例如：

```text
"Tool Name" affiliate program
```

如果候选 URL 来自 TechCrunch、CoinDesk、HN 等媒体站，系统会把它标成 source article，不会误用媒体域名去搜 affiliate program。

这个功能只帮你查真实 program，不会自动生成 affiliate link。只有你手动填入真实 `affiliateLink`，系统才会记录到 `data/affiliate-research.json`。

`config/affiliate-links.json` 里的 `example.com/?ref=your-id` 只是格式示例，不会计入真实 affiliate link，也不会让工具被标记为已配置。

「联盟研究」顶部的 `Affiliate readiness` 会把研究记录分成：

- `可配置`：状态为 approved，且有真实 `programUrl` 和 `affiliateLink`。
- `缺字段`：状态通过了，但还缺 programUrl 或 affiliateLink。
- `研究中`：还在 searching / applied / not_started。
- `不适合`：rejected 或 no_program。

只有 `可配置` 的记录会出现 `复制配置片段`。复制后再手动粘到 `config/affiliate-links.json`，不要把官网链接或 programUrl 当成 affiliate link。

## 每周复盘图表

打开「每周复盘」或点击顶部「生成周报」。

Dashboard 会显示：

- `7 天趋势`：每天工具数、发推记录数、engagementScore 的条形图。
- `Top angle`：哪些文案类型表现最好，例如 shortPost、painPointHook、threadOpening。
- `摘要`：最近 7 天跑 daily 天数、历史工具记录、已追踪发推数量、最佳 angle。
- `系统建议`：哪些工具适合继续做 thread、review page 或 affiliate research。

命令行 `npm run weekly` 会同步输出 Markdown，并写入：

```text
output/YYYY-MM-DD-weekly-report.md
data/weekly/YYYY-MM-DD.json
```

## 生成 SEO Review Page 大纲

命令行：

```bash
npm run review:generate -- --tool "Tool Name"
```

Dashboard：

1. 打开「测评页候选」。
2. 找到工具。
3. 点「生成测评页大纲」。
4. 文件会写入 `output/reviews/YYYY-MM-DD-tool-slug-review-outline.md`。

大纲不会编造价格、佣金、真实用户评价或 affiliate link。没有真实 affiliate link 时会使用：

```text
Affiliate link not available yet — replace after approval.
```

## 故障排查

Product Hunt 请求失败：

- 命令会提示失败原因。
- 系统会使用 `data/sample-producthunt-feed.xml` 作为 fallback。
- fallback 不会写入长期 history。

Dashboard 打不开：

- 优先运行 `npm start`，它会自动避开被占用端口。
- 打开 `http://127.0.0.1:4173/dashboard/`。
- 如果端口被占用，可以运行 `node scripts/dashboard.mjs --port 4174`。

`latest.json` 不存在：

- 先运行 `npm run daily`。

JSON 文件损坏：

- 脚本会报清楚是哪个 JSON 解析失败。
- 原文件会保留，不会覆盖。
- 查看 `data/backups/YYYY-MM-DD/` 找最近备份。

Copy 按钮不可用：

- 某些浏览器会限制剪贴板权限。
- 页面会提示复制失败，这时手动选中文案复制。

没有 feedback 数据：

- 先在「文案库」或「今日行动」点击「标记已发」。
- 后续再到「反馈录入」填表现数据。
- 跑 `npm run feedback-ops` 或看 Dashboard 的「反馈学习闭环」，确认 pending 是否清零。
- 如果 `Feedback debt gate` 显示 `Pause new posts until metrics exist`，先不要扩大发布量，补完 X Analytics 再继续。

## 当前限制

- 默认不 live 发布；发布运营队列先 dry-run，只有显式开启安全开关并通过审核/去重/频控后才允许 X API 发布。
- 多账号 OAuth 目前是本地 `.env` 按账号绑定，不做云端托管 token，也不做无规则自动轮发。
- 不自动抓 X 数据，需要你手动录入。
- 不自动申请 affiliate program。
- 不自动把 affiliateLink 写进配置。
- 不做法律、税务或收益判断。
- 不接数据库，所有数据都在本地 JSON。
