# AI Affiliate X Ops Dashboard

多账号 X/Twitter 内容运营、AI 选题验证、英文推文生成、Affiliate research、手动确认发布和草稿排程的一体化本地系统。

Built for AI founders, indie hackers, SaaS builders, crypto builders, affiliate marketers, and content operators who need a serious multi-account X content workflow without handing their accounts or data to a third-party SaaS.

**Keywords:** AI Twitter automation, multi-account X content ops, AI tweet planner, affiliate marketing system, Product Hunt radar, SaaS founder content, indie hacker content, crypto builder content, review-first publishing, manual-confirm tweet automation, X growth workflow.

**Live Demo:** [yingtui-affiliate-system.vercel.app](https://yingtui-affiliate-system.vercel.app)

**GitHub:** [guamee16888/yingtui-affiliate-system](https://github.com/guamee16888/yingtui-affiliate-system)

**Contact:** Telegram [@valuator8](https://t.me/valuator8)

## 项目说明

这是一个本地 Affiliate 选题验证工具。它每天从 Product Hunt 找新工具，给工具打分，生成自然英文 X 文案，并把发推反馈、Affiliate 研究、长线程候选、SEO 测评页候选和每周复盘都沉淀到本地 JSON。

它适合现在这个阶段：先验证哪些小工具有人点、有人问、有人收藏，再决定要不要做长推、测评页或 Affiliate 转化。

它不会自动发推，不接数据库，不登录，不上传数据，不保证收益，也不会编造 affiliate link、价格、佣金、点击量或收入。Dashboard 支持手动确认后发布到 X，但每条都必须你确认。

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
10. 如果你从 X、newsletter、微信群或官网看到新工具/话题，先放进「候选收集」，并标好 circle，再点 `刷新 Live Feed` 让它参与评分。
11. 跑 `npm run draft-plan`，看每个账号今天能拿到哪些不重复候选。
12. 跑 `npm run content-calendar`，确认 20 个账号的目标能不能被冷却时间和当天草稿真实容纳。
13. 跑 `npm run roadmap`，看除了 X 账号切换以外，产品级还卡在哪里。
14. 打开 Dashboard 的「产品路线图」，先看 Top blockers 和 Next sprint，不要被十几个 Tab 拖散。
15. 跑 `npm run promotion-review`，把值得进入联盟研究、长推、测评页或观察的候选集中审核。
16. 先看「今日行动」顶部的 `今天只做这 3 件事`，按顺序处理发布、联盟研究、长文/测评页。
17. 打开「账号策略」，看每条候选建议发到哪个账号画像；现在只是分配建议，不做多账号授权。
18. 如果 Focus 面板给出新鲜发布候选，复制文案或点「发布到 X」手动确认发布。
19. 如果你是在 X 页面手动发的，回到 Dashboard 点对应文案的「标记已发」。
20. 第二天或几个小时后先清空「待补反馈」，填 impressions、likes、bookmarks、replies、clicks 等。
21. 跑 `npm run learning-loop` 或看「反馈启动台」，确认今天最多还能安全新发几条、哪几条是 seed test、哪些已发内容必须先补 X Analytics。
22. 跑 `npm run feedback-ops` 或看「反馈学习闭环」，确认账号、angle、来源开始有真实表现数据。
23. 看「跟进队列」「联盟研究」「测评页候选」，只把有反馈的工具继续推进。
24. 对值得做测评页的工具点「生成测评页大纲」。
25. 每周跑 `npm run weekly` 或页面里的「生成周报」做复盘。

不要一开始就自动化发推。这个系统的核心是选题验证，不是批量制造内容。

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
- `发布审核`：发布前最终确认队列。它会同时检查 Fresh today / Fresh 48h 和 `Feedback debt gate`，只把当前允许继续测试的数量放进 ready；超过上限的候选会进入 `Hold for feedback`，并按分数自动建议转入联盟研究、长推、SEO 测评页或观察队列。
- `候选收集`：把 Product Hunt 之外的新工具手动放进本地收集箱；active 候选会在下一次 `daily` 或 `刷新 Live Feed` 时参与打分。
- `来源补给`：把 20×10 的内容缺口拆成圈子任务，集中显示需要补多少候选、哪些账号受影响、搜索入口、CSV 导入模板、质量 checklist 和来源健康度。每天内容不够时先看这里，不要靠低质内容硬凑。
- `工具池`：所有候选工具卡片，适合按分数、affiliate、风险、是否已发筛选。
- `文案库`：每个工具的 5 种英文文案，适合集中复制、标记已发，或手动确认发布到 X。
- `反馈录入`：已经标记已发的文案和表现数据。顶部会列出 `待补反馈`，也可以粘贴 CSV 批量导入 X 数据。
- `反馈启动台`：把反馈学习变成一个执行面板。它会显示当前阶段、最多还能安全新发几条、建议先测试的 seed posts、待补 X Analytics 的已发内容，以及可复制的 feedback CSV 模板。
- `反馈决策`：把录入的反馈转成下一步动作，判断哪些工具该加码、查联盟、做长推、做测评页或先观察。
- `跟进队列`：顶部 `Promotion review` 会先列出值得审核的候选；你确认后再手动加入 thread、review page、affiliate research、watch、skip。`Follow-up pipeline` 会显示活跃队列、下一步该处理哪项，以及每项下一步提示。
- `账号策略`：查看最多 20 个 X 账号画像、今日工具推荐发到哪个账号、每日限制、冷却时间和 20×10 内容供给缺口。当前不做授权，只做分类和路由建议。
- `联盟研究`：记录真实查到的 programUrl、network、affiliateLink 和状态，并提供 affiliate / partner / referral 一键搜索链接。
- `测评页候选`：适合做 SEO review page 的工具，并可生成英文大纲。
- `历史复盘`：历史出现过的工具，避免连续推荐同一个工具。
- `每周复盘`：最近 7 天趋势、Top angle、摘要和系统建议。
- `设置/数据`：只读查看禁用词、affiliate links 数量和各类数据条数。

如果顶部「发布前信心」显示 `先别花 credits`，今日行动会优先提示 `先别付费发布`，并把旧候选转成观察、联盟研究或长文候选，而不是硬推荐你发推。顶部的发布守门员会同时显示三件事：数据年龄、数据来源、API 发布规则。只有 6 小时内的 live feed，并且候选是 `Fresh today` / `Fresh 48h`，才值得考虑花 API credits 发。

`反馈种子测试` 会在反馈闭环里挑最多 3 条新鲜、未发过、低风险、已有账号路由的候选，作为第一批手动测试。它只给建议和按钮：复制、发布前确认、标记已发、录入反馈；不会批量发布，也不会绕过确认弹窗。发完以后必须回填 X Analytics，否则 Feedback debt gate 会阻止继续放大。

`反馈启动台` 是更直接的执行页：如果还没有真实反馈，它会先给最多 3 条 seed tests；如果已经标记已发但没填 metrics，它会显示 `blocked_until_metrics` 并要求先补 X Analytics。这个页的目标是防止你在还没学到任何表现数据之前，就把 20 个账号一起放大。

`Feed diagnostic` 会告诉你这次 Product Hunt feed 里到底有多少 `Today / 48h / 7d` 工具。如果 Top Picks 没有新鲜候选，它会说明是 feed 本身没新货，还是有新工具但评分不够，并列出 `Fresh feed watchlist` 供你手动观察。

`Candidate Inbox` 和 `Source Candidates` 是补充来源，不会自动发推，也不会自动生成 affiliate link。它们只是把 Product Hunt 之外的工具、话题和市场信号加入评分池，解决只靠 Product Hunt RSS 时候选不够新鲜的问题。

`Supply coverage` 会按 `config/content-sources.json` 里的目标计算供给：默认是 20 个账号，每号每天 10 条，质量线为 score 18+ 且不能是 `skip`。如果某个账号或圈子不够，系统会显示缺口，而不是用低质量内容硬凑。

`Draft planner` 会给每个账号分配不重复候选。一个工具最多进入一个账号的计划，所以它会更严格地暴露缺口；这是为了避免 20 个号发同一个工具的变体。

`Content calendar` 会把草稿放进账号级发布时间槽，并检查每日目标和冷却时间是否互相冲突。比如每号 10 条但冷却 6 小时，在一天内天然排不满，系统会显示 capacity gap，而不是假装可以完成。`Scale Reality` 会进一步告诉你：今天实际该审核多少条、按当前冷却每号更现实是几条、如果坚持当前目标需要把冷却降到多少小时。

`Source quality queue` 会把缺口翻译成今天该补的来源方向，例如 SaaS pricing、indie launch、crypto wallet tooling。它只给搜索方向和导入模板，不自动抓取不稳定站点。

Dashboard 的 `来源补给` 会把 `Supply coverage`、`Source quality queue`、`Source discovery` 和 `Source health` 合到一个工作台：先看缺口最大的圈子，打开搜索组，复制 CSV 模板，把真实候选粘到 `候选收集`，预览评分后再导入。导入后点 `刷新 Live Feed`，系统会重新评分并分配到账号。

`Source discovery` 会把这些缺口变成可点击搜索入口，例如 X live search、Google recent search、HN Algolia、Product Hunt 或 CoinDesk。它只做人工发现入口，不自动导入，避免把低质量噪音直接灌进内容池。

`Source health` 会给每个配置来源打健康分：候选数量、合格率、新鲜度、噪音率、是否需要调参或关闭。它是质量门禁，防止为了补 20×10 目标而把低质量 RSS 噪音灌进内容池。

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

拉取 Product Hunt，刷新已启用的 `config/content-sources.json` 来源，并合并 `data/candidate-inbox.json` 与 `data/source-candidates.json` 里的 active 候选。生成当天默认文案包，写入 `output/YYYY-MM-DD-daily-x-pack.md`、`data/daily/YYYY-MM-DD.json` 和 `data/latest.json`，并更新历史记录。默认最多挑 40 个高质量候选；低于质量线的不会为了凑数进入 Top Picks。

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

查看联盟研究记录：未开始、researching、approved 但未加入配置、rejected/no_program 等。

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

生成 100 行补来源 CSV 模板，输出到 `output/source-import-pack/YYYY-MM-DD-source-import-template.csv`。模板会按缺口自动分配 circle，但需要你手动填真实 name、url、tagline 后再导入。

```bash
npm run draft-plan
```

按账号生成不重复草稿规划，输出到 `data/draft-plans/YYYY-MM-DD.json`、`data/draft-plans/latest.json` 和 `output/YYYY-MM-DD-draft-plan.md`。一个工具只分配给一个账号，不够就显示 gap。

```bash
npm run content-calendar
```

按账号冷却时间把草稿排进当天发布时间槽，输出到 `data/content-calendar/YYYY-MM-DD.json`、`data/content-calendar/latest.json` 和 `output/YYYY-MM-DD-content-calendar.md`。如果目标和冷却时间冲突，会显示 capacity gap 和建议冷却时间。

```bash
npm run roadmap
```

生成产品级 readiness/roadmap 报告，输出到 `data/product-roadmap.json` 和 `output/YYYY-MM-DD-product-roadmap.md`。它会把 X 账号切换标为 deferred，并优先指出内容供给、日历、反馈闭环、affiliate 变现、来源多样性等非授权阻塞点。

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
- `data/product-roadmap.json`：产品级 readiness/roadmap 报告。
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

推荐表头：

```csv
toolName,variantType,postedUrl,impressions,likes,bookmarks,replies,reposts,clicks,profileVisits,notes
Mailwarm 2.0,shortPost,https://x.com/your/status/123,1200,18,6,3,1,9,4,first test
```

也可以从 X Analytics 复制表格直接粘贴，系统会识别 tab 分隔和常见表头：

```text
Post text	Tweet permalink	Impressions	Likes	Bookmarks	Replies	Reposts	Link clicks	Profile visits
Your posted copy...	https://x.com/your/status/123	1200	18	6	3	1	9	4
```

说明：

- `toolName` 会优先匹配当天 `data/latest.json` 里的工具。
- 如果某条推已经在 Dashboard 点过「标记已发」，粘贴 X Analytics 时可以通过 `Tweet permalink` 或 `Post text` 匹配到原记录。
- `variantType` 可填 `shortPost`、`casualPost`、`contrarianAngle`、`painPointHook`、`threadOpening`。
- 如果没有 `copyText`，系统会用匹配工具对应的文案补上。
- 如果某一行无法匹配 toolName/toolUrl/copyText，会跳过并提示。

## Vercel 版本

这个项目可以部署到 Vercel 做只读 Dashboard，方便你在外面查看当天候选、历史和队列。

线上版本的边界：

- 可以读取仓库里的 `dashboard/`、`data/`、`output/` 静态文件。
- 可以打开 Dashboard、看 `data/latest.json`、看历史和队列快照。
- 不能刷新 Product Hunt。
- 不能写入 feedback / queue / affiliate research。
- 不能发布到 X，也不要在 Vercel 配置 X token。

本地仍然是唯一的工作台：

```bash
npm start
```

如果要更新线上看到的数据，先在本地跑 `npm run daily`，确认 `data/latest.json` 更新后，再提交并部署。

## Affiliate Research 搜索

打开「联盟研究」后，每个候选工具旁边会有 3 个搜索按钮：

- `affiliate`
- `partner`
- `referral`

它们只会打开 Google 搜索，例如：

```text
"Tool Name" affiliate program
```

这个功能只帮你查真实 program，不会自动生成 affiliate link。只有你手动填入真实 `affiliateLink`，系统才会记录到 `data/affiliate-research.json`。

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

- 不自动发推；只支持你逐条确认后发布到 X。
- 多账号 OAuth 目前是本地 `.env` 按账号绑定，不做云端托管 token，也不做自动轮发。
- 不自动抓 X 数据，需要你手动录入。
- 不自动申请 affiliate program。
- 不自动把 affiliateLink 写进配置。
- 不做法律、税务或收益判断。
- 不接数据库，所有数据都在本地 JSON。
