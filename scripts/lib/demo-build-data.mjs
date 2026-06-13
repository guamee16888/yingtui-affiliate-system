export function buildDemoManagerSummary() {
  const now = new Date().toISOString();
  const workspace = {
    workspaceId: "workspace_default",
    name: "Demo Workspace",
    plan: "demo",
    accountLimit: 30,
    enabledLaneIds: ["ai_startups", "indie_builders", "saas_founders", "crypto_builders"]
  };
  const manager = {
    userId: "demo_manager",
    name: "Demo Manager",
    role: "manager",
    workspaceId: workspace.workspaceId
  };
  const staff = [
    { userId: "demo_operator", name: "Demo Operator", role: "staff", workspaceId: workspace.workspaceId },
    { userId: "demo_reviewer", name: "Demo Reviewer", role: "staff", workspaceId: workspace.workspaceId }
  ];
  const accounts = [
    demoAccount("ai_tools_lab", "AI Tools Lab", "AI tools discovery"),
    demoAccount("saas_founder_notes", "SaaS Founder Notes", "SaaS founders"),
    demoAccount("crypto_builder_radar", "Crypto Builder Radar", "Crypto builders")
  ];
  const tasks = [
    demoTask({
      taskId: "demo_task_001",
      toolName: "Agent workflow checklist",
      laneId: "ai_startups",
      accountId: "ai_tools_lab",
      accountName: "AI Tools Lab",
      assignedTo: "demo_operator",
      assignedToName: "Demo Operator",
      approvalStatus: "pending",
      status: "pending_review",
      copyText: "Most AI agent launches do not fail because the model is weak. They fail because nobody wrote down the handoff rules first.",
      canApprove: true
    }),
    demoTask({
      taskId: "demo_task_002",
      toolName: "SaaS onboarding teardown",
      laneId: "saas_founders",
      accountId: "saas_founder_notes",
      accountName: "SaaS Founder Notes",
      assignedTo: "demo_reviewer",
      assignedToName: "Demo Reviewer",
      approvalStatus: "approved",
      status: "approved",
      copyText: "A tiny onboarding bug can look like a pricing problem. Before changing plans, I would check where new users stop clicking.",
      canApprove: false
    }),
    demoTask({
      taskId: "demo_task_003",
      toolName: "Wallet security dashboard",
      laneId: "crypto_builders",
      accountId: "crypto_builder_radar",
      accountName: "Crypto Builder Radar",
      assignedTo: "",
      assignedToName: "Unassigned staff",
      approvalStatus: "pending",
      status: "pending_review",
      copyText: "Crypto UX still treats security as a warning screen. The better product angle is making risk visible before the user signs.",
      canApprove: false,
      blockReasons: ["Assign both account and staff before approving."]
    })
  ];

  return {
    version: 1,
    generatedAt: now,
    selectedWorkspace: workspace,
    selectedManager: manager,
    accessAllowed: true,
    accessError: "",
    workspaces: [workspace],
    managers: [manager],
    staff,
    accounts,
    summary: {
      totalTasks: tasks.length,
      pendingReview: 2,
      approved: 1,
      rejected: 0,
      unassigned: 1,
      blocked: 1,
      publishJobs: 0,
      feedback: 0
    },
    tasks
  };
}

export function buildAdminDemoData() {
  const now = new Date();
  const generatedAt = now.toISOString();
  const published = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const tools = [
    demoTool({
      toolId: "demo_tool_agent_handoff",
      name: "Agent Handoff Checklist",
      tagline: "A small workflow for reviewing AI agent handoffs before launch.",
      laneId: "ai_startups",
      published,
      score: 82,
      followUpAction: "thread candidate",
      reason: "Clear operator pain, easy to explain as a workflow post, and safe for a demo because it has no external link.",
      suggestedAngle: "Most teams test prompts before they test the handoff rules.",
      copy: "Most AI agent launches do not fail because the model is weak. They fail because nobody wrote down the handoff rules first."
    }),
    demoTool({
      toolId: "demo_tool_onboarding_teardown",
      name: "SaaS Onboarding Teardown",
      tagline: "A founder-style checklist for finding activation leaks.",
      laneId: "saas_founders",
      published,
      score: 78,
      followUpAction: "review page candidate",
      reason: "Good long-form angle, specific founder audience, and no need to promise revenue or growth.",
      suggestedAngle: "A pricing problem is sometimes an onboarding problem wearing a mask.",
      copy: "A tiny onboarding bug can look like a pricing problem. Before changing plans, I would check where new users stop clicking."
    }),
    demoTool({
      toolId: "demo_tool_wallet_security",
      name: "Wallet Risk Preview",
      tagline: "A product angle for making crypto signing risk visible earlier.",
      laneId: "crypto_builders",
      published,
      score: 73,
      followUpAction: "tweet only",
      reason: "Useful builder angle, but it should stay educational and avoid market claims.",
      suggestedAngle: "Security works better when the risk is visible before the signature prompt.",
      copy: "Crypto UX still treats security as a warning screen. The better product angle is making risk visible before the user signs."
    })
  ];

  const latest = {
    date: generatedAt.slice(0, 10),
    generatedAt,
    source: {
      label: "Sanitized admin demo data",
      usedFallback: true,
      breakdown: { productHuntTools: 0, candidateInboxTools: tools.length }
    },
    summary: {
      totalTools: tools.length,
      topPicks: tools.length,
      affiliateQueueCount: 0,
      seenBeforeCount: 0
    },
    actionList: [
      { type: "post", toolName: tools[0].name, reason: "Demo item only. Review the workflow, do not publish from this build." },
      { type: "longform", toolName: tools[1].name, reason: "Shows how long-form review candidates appear in the owner dashboard." }
    ],
    tools,
    skippedTools: [],
    affiliateResearchQueue: [],
    historicalNotes: ["Sanitized admin demo. No real X accounts, tokens, posted URLs, or affiliate links are included."],
    freshnessReport: {
      diagnosis: "Admin demo data is sanitized",
      recommendation: "Use this build only behind Cloudflare Access to preview the owner console.",
      stats: {
        totalTools: tools.length,
        freshToday: tools.length,
        fresh48: tools.length,
        fresh7d: tools.length,
        lowOriginalityNews: 0,
        topPickFreshPostCandidates: 0
      },
      freshFeedWatchlist: tools.map((tool) => ({
        name: tool.name,
        score: tool.score,
        ageDays: 0,
        inTopPicks: true
      }))
    },
    accountStrategy: {
      accounts: [
        { id: "ai_tools_lab", displayName: "AI Tools Lab", category: "AI tools", dailyPostLimit: 10, cooldownHours: 2 },
        { id: "saas_founder_notes", displayName: "SaaS Founder Notes", category: "SaaS founders", dailyPostLimit: 10, cooldownHours: 2 },
        { id: "crypto_builder_radar", displayName: "Crypto Builder Radar", category: "Crypto builders", dailyPostLimit: 10, cooldownHours: 3 }
      ]
    }
  };

  return {
    "latest.json": latest,
    "history.json": { tools: [] },
    "feedback.json": { entries: [] },
    "account-posts.json": { items: [] },
    "queues.json": { items: [] },
    "candidate-inbox.json": { items: [] },
    "affiliate-research.json": { items: [] },
    "affiliate-research-workbench.json": { missing: true },
    "review-pages.json": { items: [] },
    "feedback-ops.json": {
      summary: {
        pendingMetrics: 0,
        readyForLearning: 0,
        blockedByFeedbackDebt: false
      },
      accountLearning: [],
      pendingMetricRows: []
    },
    "publish-settings.json": {
      settings: {
        globalAutoPublishEnabled: false,
        dryRunByDefault: true,
        requireApprovalBeforePublish: true,
        allowedPublishModes: ["manual", "dry-run"]
      }
    },
    "publish-jobs.json": { items: [] },
    "x-connections.json": { items: [] },
    "workspaces.json": {
      items: [
        { workspaceId: "workspace_default", name: "Demo Workspace", plan: "demo", accountLimit: 30, active: true, managerUserIds: ["demo_manager"], staffUserIds: ["demo_operator", "demo_reviewer"] }
      ]
    },
    "workspace-lanes.json": {
      items: ["ai_startups", "indie_builders", "saas_founders", "crypto_builders"].map((laneId) => ({ workspaceId: "workspace_default", laneId, enabled: true }))
    },
    "content-lanes.json": {
      items: [
        { laneId: "ai_startups", name: "AI Startups", active: true },
        { laneId: "indie_builders", name: "Indie Builders", active: true },
        { laneId: "saas_founders", name: "SaaS Founders", active: true },
        { laneId: "crypto_builders", name: "Crypto Builders", active: true }
      ]
    },
    "raw-candidates.json": { items: [] },
    "source-runs.json": { items: [] },
    "demo-manager-summary.json": buildDemoManagerSummary()
  };
}

function demoAccount(accountId, persona, niche) {
  return {
    accountId,
    workspaceId: "workspace_default",
    handle: "",
    niche,
    persona,
    status: "active",
    dailyPostLimit: 10,
    externalLinkLimit: 1
  };
}

function demoTask(input) {
  const length = input.copyText.length;
  return {
    toolUrl: "",
    variantType: "shortPost",
    riskLevel: input.blockReasons?.length ? "medium" : "low",
    blockReasons: input.blockReasons ?? [],
    approvalReasons: input.blockReasons?.length ? [] : ["Account and staff are assigned inside this workspace."],
    canAssign: true,
    canApprove: Boolean(input.canApprove),
    canReject: true,
    duplicateCheckResult: { ok: !input.blockReasons?.length, flags: [] },
    riskFlags: [],
    tweetLength: {
      weightedCharCount: length,
      status: length > 260 ? "near_limit" : "ok",
      fitsXPost: length <= 280
    },
    weightedCharCount: length,
    fitsTweetLimit: length <= 280,
    publishMode: "manual",
    linkPolicy: "no_link",
    copyId: `${input.taskId}_copy`,
    toolId: `${input.taskId}_tool`,
    topicId: `${input.taskId}_topic`,
    workspaceId: "workspace_default",
    ...input
  };
}

function demoTool(input) {
  return {
    toolId: input.toolId,
    name: input.name,
    url: "",
    tagline: input.tagline,
    published: input.published,
    score: input.score,
    scoreBreakdown: {
      painScore: 8,
      nicheScore: 7,
      affiliateScore: 0,
      contentScore: 8,
      noveltyScore: 6,
      riskScore: 2
    },
    reason: input.reason,
    affiliateStatus: "no_fit",
    affiliateLink: null,
    followUpAction: input.followUpAction,
    seenBefore: false,
    suggestedAngle: input.suggestedAngle,
    copyVariants: {
      shortPost: input.copy,
      casualPost: input.copy,
      contrarianAngle: input.copy,
      painPointHook: input.copy,
      threadOpening: input.copy
    },
    laneId: input.laneId,
    sourceName: "Sanitized admin demo",
    editorialSignals: { lowOriginalityNews: false }
  };
}
