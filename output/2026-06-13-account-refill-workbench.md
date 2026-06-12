# Account Refill Workbench - 2026-06-13

- Status: needs_refill
- Active accounts: 20
- Target posts: 200/day
- Focus accounts: 5
- Refill accounts: 20
- Total refill need: 199
- Search URLs: 45

## Rule

Fill only real name/url/tagline rows. Blank rows are skipped by candidate import; do not invent candidates to hit volume.

## Workflow

1. Open the search group for the top account.
2. Collect only real tools or topics with a URL, a clear audience, and one narrow pain.
3. Use Fill candidate inbox to paste the account CSV template.
4. Fill name/url/tagline for good rows; leave weak rows blank.
5. Preview scoring, import only qualified rows, then rerun daily.

## Today Focus

### 1. Crypto Builder Radar

- Status: 可手动种子测试
- Action: 手动测 2 条
- Refill need: 9
- Postable today: 2/10
- First bottleneck: drafts
- Search links:
  - X live search: https://x.com/search?q=%22crypto%22%20%22builder%22%20%22tool%22&src=typed_query&f=live
  - Google recent search: https://www.google.com/search?q=%22crypto%22%20%22builder%22%20%22tool%22%20after%3A2026-01-01
  - CoinDesk search: https://www.coindesk.com/search?s=crypto%20builder%20tool

CSV template:

```csv
accountId,accountName,priority,name,url,tagline,source,circle,candidateType,sourceUrl,published,researchProvider,researchQuery,researchUrl,acceptanceChecklist,notes
crypto_builder_radar,Crypto Builder Radar,P1,,,,account_refill,crypto_builders,topic,https://x.com/search?q=%22crypto%22%20%22builder%22%20%22tool%22&src=typed_query&f=live,2026-06-13,X live search,"""crypto"" ""builder"" ""tool""",https://x.com/search?q=%22crypto%22%20%22builder%22%20%22tool%22&src=typed_query&f=live,real URL | builder/tool angle | not price-only | clear audience | fresh enough,Account: Crypto Builder Radar | Status: ready_to_seed | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
crypto_builder_radar,Crypto Builder Radar,P1,,,,account_refill,crypto_builders,product,https://www.google.com/search?q=%22crypto%22%20%22builder%22%20%22tool%22%20after%3A2026-01-01,2026-06-13,Google recent search,"""crypto"" ""builder"" ""tool""",https://www.google.com/search?q=%22crypto%22%20%22builder%22%20%22tool%22%20after%3A2026-01-01,real URL | builder/tool angle | not price-only | clear audience | fresh enough,Account: Crypto Builder Radar | Status: ready_to_seed | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
crypto_builder_radar,Crypto Builder Radar,P1,,,,account_refill,crypto_builders,product,https://www.coindesk.com/search?s=crypto%20builder%20tool,2026-06-13,CoinDesk search,"""crypto"" ""builder"" ""tool""",https://www.coindesk.com/search?s=crypto%20builder%20tool,real URL | builder/tool angle | not price-only | clear audience | fresh enough,Account: Crypto Builder Radar | Status: ready_to_seed | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
crypto_builder_radar,Crypto Builder Radar,P2,,,,account_refill,crypto_builders,topic,https://x.com/search?q=%22crypto%22%20%22builder%22%20%22tool%22&src=typed_query&f=live,2026-06-13,X live search,"""crypto"" ""builder"" ""tool""",https://x.com/search?q=%22crypto%22%20%22builder%22%20%22tool%22&src=typed_query&f=live,real URL | builder/tool angle | not price-only | clear audience | fresh enough,Account: Crypto Builder Radar | Status: ready_to_seed | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
crypto_builder_radar,Crypto Builder Radar,P2,,,,account_refill,crypto_builders,product,https://www.google.com/search?q=%22crypto%22%20%22builder%22%20%22tool%22%20after%3A2026-01-01,2026-06-13,Google recent search,"""crypto"" ""builder"" ""tool""",https://www.google.com/search?q=%22crypto%22%20%22builder%22%20%22tool%22%20after%3A2026-01-01,real URL | builder/tool angle | not price-only | clear audience | fresh enough,Account: Crypto Builder Radar | Status: ready_to_seed | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
crypto_builder_radar,Crypto Builder Radar,P2,,,,account_refill,crypto_builders,product,https://www.coindesk.com/search?s=crypto%20builder%20tool,2026-06-13,CoinDesk search,"""crypto"" ""builder"" ""tool""",https://www.coindesk.com/search?s=crypto%20builder%20tool,real URL | builder/tool angle | not price-only | clear audience | fresh enough,Account: Crypto Builder Radar | Status: ready_to_seed | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
crypto_builder_radar,Crypto Builder Radar,P2,,,,account_refill,crypto_builders,topic,https://x.com/search?q=%22crypto%22%20%22builder%22%20%22tool%22&src=typed_query&f=live,2026-06-13,X live search,"""crypto"" ""builder"" ""tool""",https://x.com/search?q=%22crypto%22%20%22builder%22%20%22tool%22&src=typed_query&f=live,real URL | builder/tool angle | not price-only | clear audience | fresh enough,Account: Crypto Builder Radar | Status: ready_to_seed | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
crypto_builder_radar,Crypto Builder Radar,P3,,,,account_refill,crypto_builders,product,https://www.google.com/search?q=%22crypto%22%20%22builder%22%20%22tool%22%20after%3A2026-01-01,2026-06-13,Google recent search,"""crypto"" ""builder"" ""tool""",https://www.google.com/search?q=%22crypto%22%20%22builder%22%20%22tool%22%20after%3A2026-01-01,real URL | builder/tool angle | not price-only | clear audience | fresh enough,Account: Crypto Builder Radar | Status: ready_to_seed | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
crypto_builder_radar,Crypto Builder Radar,P3,,,,account_refill,crypto_builders,product,https://www.coindesk.com/search?s=crypto%20builder%20tool,2026-06-13,CoinDesk search,"""crypto"" ""builder"" ""tool""",https://www.coindesk.com/search?s=crypto%20builder%20tool,real URL | builder/tool angle | not price-only | clear audience | fresh enough,Account: Crypto Builder Radar | Status: ready_to_seed | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
```

### 2. AI Founder Signals

- Status: 缺草稿/排期
- Action: 补 10 条草稿/排期
- Refill need: 10
- Postable today: 0/10
- First bottleneck: drafts
- Search links:
  - Product Hunt search: https://www.producthunt.com/search?q=AI%20workflow%20launch
  - X live search: https://x.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22&src=typed_query&f=live
  - Google recent search: https://www.google.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22%20after%3A2026-01-01

CSV template:

```csv
accountId,accountName,priority,name,url,tagline,source,circle,candidateType,sourceUrl,published,researchProvider,researchQuery,researchUrl,acceptanceChecklist,notes
ai_founder_signals,AI Founder Signals,P1,,,,account_refill,ai_startups,topic,https://www.producthunt.com/search?q=AI%20workflow%20launch,2026-06-13,Product Hunt search,"""AI"" ""workflow"" ""launch""",https://www.producthunt.com/search?q=AI%20workflow%20launch,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Founder Signals | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_founder_signals,AI Founder Signals,P1,,,,account_refill,ai_startups,product,https://x.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22&src=typed_query&f=live,2026-06-13,X live search,"""AI"" ""workflow"" ""launch""",https://x.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22&src=typed_query&f=live,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Founder Signals | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_founder_signals,AI Founder Signals,P1,,,,account_refill,ai_startups,product,https://www.google.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22%20after%3A2026-01-01,2026-06-13,Google recent search,"""AI"" ""workflow"" ""launch""",https://www.google.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22%20after%3A2026-01-01,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Founder Signals | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_founder_signals,AI Founder Signals,P2,,,,account_refill,ai_startups,topic,https://www.producthunt.com/search?q=AI%20workflow%20launch,2026-06-13,Product Hunt search,"""AI"" ""workflow"" ""launch""",https://www.producthunt.com/search?q=AI%20workflow%20launch,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Founder Signals | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_founder_signals,AI Founder Signals,P2,,,,account_refill,ai_startups,product,https://x.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22&src=typed_query&f=live,2026-06-13,X live search,"""AI"" ""workflow"" ""launch""",https://x.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22&src=typed_query&f=live,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Founder Signals | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_founder_signals,AI Founder Signals,P2,,,,account_refill,ai_startups,product,https://www.google.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22%20after%3A2026-01-01,2026-06-13,Google recent search,"""AI"" ""workflow"" ""launch""",https://www.google.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22%20after%3A2026-01-01,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Founder Signals | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_founder_signals,AI Founder Signals,P2,,,,account_refill,ai_startups,topic,https://www.producthunt.com/search?q=AI%20workflow%20launch,2026-06-13,Product Hunt search,"""AI"" ""workflow"" ""launch""",https://www.producthunt.com/search?q=AI%20workflow%20launch,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Founder Signals | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_founder_signals,AI Founder Signals,P3,,,,account_refill,ai_startups,product,https://x.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22&src=typed_query&f=live,2026-06-13,X live search,"""AI"" ""workflow"" ""launch""",https://x.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22&src=typed_query&f=live,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Founder Signals | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_founder_signals,AI Founder Signals,P3,,,,account_refill,ai_startups,product,https://www.google.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22%20after%3A2026-01-01,2026-06-13,Google recent search,"""AI"" ""workflow"" ""launch""",https://www.google.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22%20after%3A2026-01-01,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Founder Signals | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_founder_signals,AI Founder Signals,P3,,,,account_refill,ai_startups,topic,https://www.producthunt.com/search?q=AI%20workflow%20launch,2026-06-13,Product Hunt search,"""AI"" ""workflow"" ""launch""",https://www.producthunt.com/search?q=AI%20workflow%20launch,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Founder Signals | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
```

### 3. AI Tools Lab

- Status: 缺草稿/排期
- Action: 补 10 条草稿/排期
- Refill need: 10
- Postable today: 0/10
- First bottleneck: drafts
- Search links:
  - Product Hunt search: https://www.producthunt.com/search?q=AI%20workflow%20launch
  - X live search: https://x.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22&src=typed_query&f=live
  - Google recent search: https://www.google.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22%20after%3A2026-01-01

CSV template:

```csv
accountId,accountName,priority,name,url,tagline,source,circle,candidateType,sourceUrl,published,researchProvider,researchQuery,researchUrl,acceptanceChecklist,notes
ai_tools_lab,AI Tools Lab,P1,,,,account_refill,ai_startups,topic,https://www.producthunt.com/search?q=AI%20workflow%20launch,2026-06-13,Product Hunt search,"""AI"" ""workflow"" ""launch""",https://www.producthunt.com/search?q=AI%20workflow%20launch,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Tools Lab | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_tools_lab,AI Tools Lab,P1,,,,account_refill,ai_startups,product,https://x.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22&src=typed_query&f=live,2026-06-13,X live search,"""AI"" ""workflow"" ""launch""",https://x.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22&src=typed_query&f=live,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Tools Lab | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_tools_lab,AI Tools Lab,P1,,,,account_refill,ai_startups,product,https://www.google.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22%20after%3A2026-01-01,2026-06-13,Google recent search,"""AI"" ""workflow"" ""launch""",https://www.google.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22%20after%3A2026-01-01,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Tools Lab | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_tools_lab,AI Tools Lab,P2,,,,account_refill,ai_startups,topic,https://www.producthunt.com/search?q=AI%20workflow%20launch,2026-06-13,Product Hunt search,"""AI"" ""workflow"" ""launch""",https://www.producthunt.com/search?q=AI%20workflow%20launch,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Tools Lab | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_tools_lab,AI Tools Lab,P2,,,,account_refill,ai_startups,product,https://x.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22&src=typed_query&f=live,2026-06-13,X live search,"""AI"" ""workflow"" ""launch""",https://x.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22&src=typed_query&f=live,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Tools Lab | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_tools_lab,AI Tools Lab,P2,,,,account_refill,ai_startups,product,https://www.google.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22%20after%3A2026-01-01,2026-06-13,Google recent search,"""AI"" ""workflow"" ""launch""",https://www.google.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22%20after%3A2026-01-01,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Tools Lab | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_tools_lab,AI Tools Lab,P2,,,,account_refill,ai_startups,topic,https://www.producthunt.com/search?q=AI%20workflow%20launch,2026-06-13,Product Hunt search,"""AI"" ""workflow"" ""launch""",https://www.producthunt.com/search?q=AI%20workflow%20launch,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Tools Lab | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_tools_lab,AI Tools Lab,P3,,,,account_refill,ai_startups,product,https://x.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22&src=typed_query&f=live,2026-06-13,X live search,"""AI"" ""workflow"" ""launch""",https://x.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22&src=typed_query&f=live,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Tools Lab | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_tools_lab,AI Tools Lab,P3,,,,account_refill,ai_startups,product,https://www.google.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22%20after%3A2026-01-01,2026-06-13,Google recent search,"""AI"" ""workflow"" ""launch""",https://www.google.com/search?q=%22AI%22%20%22workflow%22%20%22launch%22%20after%3A2026-01-01,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Tools Lab | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
ai_tools_lab,AI Tools Lab,P3,,,,account_refill,ai_startups,topic,https://www.producthunt.com/search?q=AI%20workflow%20launch,2026-06-13,Product Hunt search,"""AI"" ""workflow"" ""launch""",https://www.producthunt.com/search?q=AI%20workflow%20launch,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: AI Tools Lab | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
```

### 4. Productivity Ops

- Status: 缺草稿/排期
- Action: 补 10 条草稿/排期
- Refill need: 10
- Postable today: 0/10
- First bottleneck: drafts
- Search links:
  - Product Hunt search: https://www.producthunt.com/search?q=productivity%20and%20operations%20tool
  - X live search: https://x.com/search?q=%22productivity%20and%20operations%22%20%22tool%22&src=typed_query&f=live
  - Google recent search: https://www.google.com/search?q=%22productivity%20and%20operations%22%20%22tool%22%20after%3A2026-01-01

CSV template:

```csv
accountId,accountName,priority,name,url,tagline,source,circle,candidateType,sourceUrl,published,researchProvider,researchQuery,researchUrl,acceptanceChecklist,notes
productivity_ops,Productivity Ops,P1,,,,account_refill,ai_startups,topic,https://www.producthunt.com/search?q=productivity%20and%20operations%20tool,2026-06-13,Product Hunt search,"""productivity and operations"" ""tool""",https://www.producthunt.com/search?q=productivity%20and%20operations%20tool,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Productivity Ops | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
productivity_ops,Productivity Ops,P1,,,,account_refill,ai_startups,product,https://x.com/search?q=%22productivity%20and%20operations%22%20%22tool%22&src=typed_query&f=live,2026-06-13,X live search,"""productivity and operations"" ""tool""",https://x.com/search?q=%22productivity%20and%20operations%22%20%22tool%22&src=typed_query&f=live,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Productivity Ops | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
productivity_ops,Productivity Ops,P1,,,,account_refill,ai_startups,product,https://www.google.com/search?q=%22productivity%20and%20operations%22%20%22tool%22%20after%3A2026-01-01,2026-06-13,Google recent search,"""productivity and operations"" ""tool""",https://www.google.com/search?q=%22productivity%20and%20operations%22%20%22tool%22%20after%3A2026-01-01,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Productivity Ops | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
productivity_ops,Productivity Ops,P2,,,,account_refill,ai_startups,topic,https://www.producthunt.com/search?q=productivity%20and%20operations%20tool,2026-06-13,Product Hunt search,"""productivity and operations"" ""tool""",https://www.producthunt.com/search?q=productivity%20and%20operations%20tool,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Productivity Ops | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
productivity_ops,Productivity Ops,P2,,,,account_refill,ai_startups,product,https://x.com/search?q=%22productivity%20and%20operations%22%20%22tool%22&src=typed_query&f=live,2026-06-13,X live search,"""productivity and operations"" ""tool""",https://x.com/search?q=%22productivity%20and%20operations%22%20%22tool%22&src=typed_query&f=live,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Productivity Ops | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
productivity_ops,Productivity Ops,P2,,,,account_refill,ai_startups,product,https://www.google.com/search?q=%22productivity%20and%20operations%22%20%22tool%22%20after%3A2026-01-01,2026-06-13,Google recent search,"""productivity and operations"" ""tool""",https://www.google.com/search?q=%22productivity%20and%20operations%22%20%22tool%22%20after%3A2026-01-01,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Productivity Ops | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
productivity_ops,Productivity Ops,P2,,,,account_refill,ai_startups,topic,https://www.producthunt.com/search?q=productivity%20and%20operations%20tool,2026-06-13,Product Hunt search,"""productivity and operations"" ""tool""",https://www.producthunt.com/search?q=productivity%20and%20operations%20tool,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Productivity Ops | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
productivity_ops,Productivity Ops,P3,,,,account_refill,ai_startups,product,https://x.com/search?q=%22productivity%20and%20operations%22%20%22tool%22&src=typed_query&f=live,2026-06-13,X live search,"""productivity and operations"" ""tool""",https://x.com/search?q=%22productivity%20and%20operations%22%20%22tool%22&src=typed_query&f=live,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Productivity Ops | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
productivity_ops,Productivity Ops,P3,,,,account_refill,ai_startups,product,https://www.google.com/search?q=%22productivity%20and%20operations%22%20%22tool%22%20after%3A2026-01-01,2026-06-13,Google recent search,"""productivity and operations"" ""tool""",https://www.google.com/search?q=%22productivity%20and%20operations%22%20%22tool%22%20after%3A2026-01-01,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Productivity Ops | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
productivity_ops,Productivity Ops,P3,,,,account_refill,ai_startups,topic,https://www.producthunt.com/search?q=productivity%20and%20operations%20tool,2026-06-13,Product Hunt search,"""productivity and operations"" ""tool""",https://www.producthunt.com/search?q=productivity%20and%20operations%20tool,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Productivity Ops | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
```

### 5. Sales Support AI

- Status: 缺草稿/排期
- Action: 补 10 条草稿/排期
- Refill need: 10
- Postable today: 0/10
- First bottleneck: drafts
- Search links:
  - Product Hunt search: https://www.producthunt.com/search?q=sales%20and%20customer%20support%20tool
  - X live search: https://x.com/search?q=%22sales%20and%20customer%20support%22%20%22tool%22&src=typed_query&f=live
  - Google recent search: https://www.google.com/search?q=%22sales%20and%20customer%20support%22%20%22tool%22%20after%3A2026-01-01

CSV template:

```csv
accountId,accountName,priority,name,url,tagline,source,circle,candidateType,sourceUrl,published,researchProvider,researchQuery,researchUrl,acceptanceChecklist,notes
sales_support_ai,Sales Support AI,P1,,,,account_refill,ai_startups,topic,https://www.producthunt.com/search?q=sales%20and%20customer%20support%20tool,2026-06-13,Product Hunt search,"""sales and customer support"" ""tool""",https://www.producthunt.com/search?q=sales%20and%20customer%20support%20tool,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Sales Support AI | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
sales_support_ai,Sales Support AI,P1,,,,account_refill,ai_startups,product,https://x.com/search?q=%22sales%20and%20customer%20support%22%20%22tool%22&src=typed_query&f=live,2026-06-13,X live search,"""sales and customer support"" ""tool""",https://x.com/search?q=%22sales%20and%20customer%20support%22%20%22tool%22&src=typed_query&f=live,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Sales Support AI | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
sales_support_ai,Sales Support AI,P1,,,,account_refill,ai_startups,product,https://www.google.com/search?q=%22sales%20and%20customer%20support%22%20%22tool%22%20after%3A2026-01-01,2026-06-13,Google recent search,"""sales and customer support"" ""tool""",https://www.google.com/search?q=%22sales%20and%20customer%20support%22%20%22tool%22%20after%3A2026-01-01,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Sales Support AI | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
sales_support_ai,Sales Support AI,P2,,,,account_refill,ai_startups,topic,https://www.producthunt.com/search?q=sales%20and%20customer%20support%20tool,2026-06-13,Product Hunt search,"""sales and customer support"" ""tool""",https://www.producthunt.com/search?q=sales%20and%20customer%20support%20tool,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Sales Support AI | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
sales_support_ai,Sales Support AI,P2,,,,account_refill,ai_startups,product,https://x.com/search?q=%22sales%20and%20customer%20support%22%20%22tool%22&src=typed_query&f=live,2026-06-13,X live search,"""sales and customer support"" ""tool""",https://x.com/search?q=%22sales%20and%20customer%20support%22%20%22tool%22&src=typed_query&f=live,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Sales Support AI | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
sales_support_ai,Sales Support AI,P2,,,,account_refill,ai_startups,product,https://www.google.com/search?q=%22sales%20and%20customer%20support%22%20%22tool%22%20after%3A2026-01-01,2026-06-13,Google recent search,"""sales and customer support"" ""tool""",https://www.google.com/search?q=%22sales%20and%20customer%20support%22%20%22tool%22%20after%3A2026-01-01,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Sales Support AI | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
sales_support_ai,Sales Support AI,P2,,,,account_refill,ai_startups,topic,https://www.producthunt.com/search?q=sales%20and%20customer%20support%20tool,2026-06-13,Product Hunt search,"""sales and customer support"" ""tool""",https://www.producthunt.com/search?q=sales%20and%20customer%20support%20tool,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Sales Support AI | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
sales_support_ai,Sales Support AI,P3,,,,account_refill,ai_startups,product,https://x.com/search?q=%22sales%20and%20customer%20support%22%20%22tool%22&src=typed_query&f=live,2026-06-13,X live search,"""sales and customer support"" ""tool""",https://x.com/search?q=%22sales%20and%20customer%20support%22%20%22tool%22&src=typed_query&f=live,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Sales Support AI | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
sales_support_ai,Sales Support AI,P3,,,,account_refill,ai_startups,product,https://www.google.com/search?q=%22sales%20and%20customer%20support%22%20%22tool%22%20after%3A2026-01-01,2026-06-13,Google recent search,"""sales and customer support"" ""tool""",https://www.google.com/search?q=%22sales%20and%20customer%20support%22%20%22tool%22%20after%3A2026-01-01,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Sales Support AI | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
sales_support_ai,Sales Support AI,P3,,,,account_refill,ai_startups,topic,https://www.producthunt.com/search?q=sales%20and%20customer%20support%20tool,2026-06-13,Product Hunt search,"""sales and customer support"" ""tool""",https://www.producthunt.com/search?q=sales%20and%20customer%20support%20tool,real URL | AI/startup/tool angle | clear buyer pain | not broad hype,Account: Sales Support AI | Status: needs_drafts | Bottleneck: drafts | Fill only real name/url/tagline rows; leave weak rows blank.
```

## Notes

- This is a supply workbench, not a publishing permission.
- A higher refillNeed means the account lacks drafts, fresh items, quality, or candidate bench depth.
- Feedback-blocked accounts still need metrics before scale, even if they have enough content.
