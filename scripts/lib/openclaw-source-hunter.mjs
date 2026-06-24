import { XMLParser } from "fast-xml-parser";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { emptyCollection, normalizeCollection, withUpdatedAt } from "./core-data.mjs";
import { checkCandidateDuplicate } from "./candidate-dedupe.mjs";
import { createStableId, todayString } from "./ids.mjs";
import { readJson, writeJsonAtomic, writeTextAtomic } from "./file-store.mjs";
import { buildRawCandidate, loadSourceLaneData, saveSourceLaneData } from "./source-lanes.mjs";

export const OPENCLAW_CONFIG_PATH = "config/openclaw-source-hunters.json";

export const DEFAULT_OPENCLAW_CONFIG = {
  version: 1,
  updatedAt: "",
  target: {
    dailyMinCandidates: 50,
    dailyMaxCandidates: 200,
    minimumScore: 70
  },
  hub: {
    hubId: "openclaw_source_hub",
    name: "OpenClaw Source Hub",
    connectorId: "openclaw",
    notes: "Aggregates OpenClaw hunters into raw-candidates."
  },
  llm: {
    enabled: false,
    provider: "zhipu",
    model: "glm-4.7",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    apiKeyEnv: "ZHIPUAI_API_KEY",
    timeoutMs: 45000,
    acceptScore: 65,
    maxJudgementsPerRun: 30,
    thinking: "disabled"
  },
  hunters: []
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ""
});
const execFileAsync = promisify(execFile);
const DEFAULT_FETCH_TIMEOUT_MS = 30000;

export async function loadOpenClawConfig() {
  return normalizeOpenClawConfig(await readJson(OPENCLAW_CONFIG_PATH, DEFAULT_OPENCLAW_CONFIG));
}

export function normalizeOpenClawConfig(config = DEFAULT_OPENCLAW_CONFIG) {
  const target = {
    ...DEFAULT_OPENCLAW_CONFIG.target,
    ...(config.target ?? {})
  };
  target.dailyMinCandidates = Number(target.dailyMinCandidates || 50);
  target.dailyMaxCandidates = Number(target.dailyMaxCandidates || 200);
  target.minimumScore = Number(target.minimumScore || 70);
  const llm = normalizeOpenClawLlmConfig(config.llm);

  const hunters = (Array.isArray(config.hunters) ? config.hunters : [])
    .map((hunter) => ({
      hunterId: String(hunter.hunterId || "").trim(),
      name: String(hunter.name || hunter.hunterId || "").trim(),
      dailyTarget: Number(hunter.dailyTarget || 50),
      minimumScore: Number(hunter.minimumScore || target.minimumScore),
      laneIds: normalizeList(hunter.laneIds),
      keywords: normalizeList(hunter.keywords),
      judgeProfile: normalizeJudgeProfile(hunter.judgeProfile, hunter),
      sources: (Array.isArray(hunter.sources) ? hunter.sources : []).map((source) => normalizeOpenClawSource(source, hunter))
    }))
    .filter((hunter) => hunter.hunterId);

  return {
    ...DEFAULT_OPENCLAW_CONFIG,
    ...config,
    target,
    hub: {
      ...DEFAULT_OPENCLAW_CONFIG.hub,
      ...(config.hub ?? {})
    },
    llm,
    hunters
  };
}

export async function runOpenClawSourceHunter(options = {}) {
  const config = normalizeOpenClawConfig(options.config ?? await loadOpenClawConfig());
  const llmRuntime = await resolveOpenClawLlmRuntime(config, options);
  if (options.requireLlm && !llmRuntime.enabled) {
    throw new Error(`OpenClaw requires LLM judge mode, but current mode is ${llmRuntime.mode}: ${llmRuntime.reason || "not configured"}`);
  }
  const sourceData = await loadSourceLaneData();
  const sourceItemsBySourceId = await fetchOpenClawSources(config, options);
  const result = await buildOpenClawSourceRun({
    config,
    sourceData,
    sourceItemsBySourceId,
    hunterIds: options.hunterIds,
    limit: options.limit,
    minimumScore: options.minimumScore,
    now: options.now,
    llmRuntime,
    llmClient: options.llmClient
  });

  if (!options.dryRun) {
    await saveSourceLaneData({
      ...sourceData,
      rawCandidates: result.rawCandidates,
      sourceRuns: result.sourceRuns
    });
    await writeJsonAtomic("data/openclaw-source-hunter-latest.json", result.report);
  }

  return {
    ...result.stats,
    report: result.report,
    dryRun: Boolean(options.dryRun)
  };
}

export async function writeOpenClawReportMarkdown(report, options = {}) {
  const date = options.date || String(report?.generatedAt || new Date().toISOString()).slice(0, 10);
  const markdownPath = `output/${date}-openclaw-source-hunter.md`;
  const markdown = renderOpenClawReportMarkdown(report);
  await writeTextAtomic(markdownPath, markdown);
  return { markdownPath, markdown };
}

export function renderOpenClawReportMarkdown(report) {
  if (!report) return "# OpenClaw Source Hunter\n\nNo report available. Run `npm run openclaw:daily`.\n";
  const summary = report.summary ?? {};
  const target = report.target ?? {};
  const llm = summary.llm ?? {};
  const imported = Number(summary.imported || 0);
  const minimum = Number(target.dailyMinCandidates || 50);
  const targetStatus = imported >= minimum ? "covered" : "short";
  const llmStatus = llm.enabled ? `${llm.mode} ${llm.provider}/${llm.model}` : `${llm.mode || "fetch-only"} (${llm.reason || "disabled"})`;
  const headline = targetStatus === "covered"
    ? "OpenClaw daily candidate target covered."
    : `OpenClaw is short by ${Math.max(0, minimum - imported)} candidates.`;

  return `# OpenClaw Source Hunter - ${String(report.generatedAt || "").slice(0, 10)}

${headline}

## Acceptance Checks

- Daily minimum: ${minimum}
- Imported today: ${imported}
- Target status: ${targetStatus}
- LLM mode: ${llmStatus}
- LLM judged / accepted / rejected / errors: ${llm.judged ?? 0} / ${llm.accepted ?? 0} / ${llm.rejected ?? 0} / ${llm.errors ?? 0}
- Raw candidates after run: ${summary.rawCandidatesAfterRun ?? 0}

## Hunters

${(report.hunters ?? []).map((hunter) => `- ${hunter.name}: imported ${hunter.imported}/${hunter.dailyTarget}; lanes ${hunter.laneIds.join(", ")}`).join("\n") || "- No hunters ran."}

## Sources

${(report.sources ?? []).map((source) => {
  const error = source.error ? `; error ${source.error}` : "";
  return `- ${source.name}: fetched ${source.fetched}, imported ${source.imported}, rejected ${source.rejected}, duplicates ${source.duplicates}${error}`;
}).join("\n") || "- No source results."}

## Top Candidates

${(report.topCandidates ?? []).map((candidate, index) => [
  `${index + 1}. ${candidate.score} - ${candidate.title} (${candidate.hunterId}; ${candidate.sourceId})`,
  `   URL: ${candidate.url}`,
  candidate.accountDirection ? `   Account: ${candidate.accountDirection}` : "",
  candidate.topicAngle ? `   Topic: ${candidate.topicAngle}` : "",
  candidate.contentAngle ? `   Angle: ${candidate.contentAngle}` : "",
  candidate.reasons?.length ? `   Reasons: ${candidate.reasons.join("; ")}` : ""
].filter(Boolean).join("\n")).join("\n") || "No accepted candidates."}
`;
}

export async function fetchOpenClawSources(config, options = {}) {
  const sourceItemsBySourceId = new Map();
  const hunters = selectedHunters(config, options.hunterIds);
  const jobs = [];
  for (const hunter of hunters) {
    for (const source of activeSources(hunter)) {
      jobs.push({ hunter, source });
    }
  }
  const results = await Promise.all(jobs.map(async ({ source }) => {
    try {
      return [source.sourceId, await fetchOpenClawSource(source, {
        now: options.now,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs
      })];
    } catch (error) {
      return [source.sourceId, {
        error: error.message,
        items: []
      }];
    }
  }));
  for (const [sourceId, result] of results) sourceItemsBySourceId.set(sourceId, result);
  return sourceItemsBySourceId;
}

export async function fetchOpenClawSource(source, options = {}) {
  const fetchImpl = options.fetchImpl ?? null;
  if (source.type === "rss") return fetchRssSource(source, fetchImpl, options);
  if (source.type === "hn_algolia") return fetchHnAlgoliaSource(source, fetchImpl, options);
  if (source.type === "github_search") return fetchGitHubSearchSource(source, fetchImpl, options);
  if (source.type === "defillama_protocols") return fetchDefiLlamaProtocolsSource(source, fetchImpl, options);
  throw new Error(`Unsupported OpenClaw source type: ${source.type}`);
}

export async function buildOpenClawSourceRun({
  config = DEFAULT_OPENCLAW_CONFIG,
  sourceData = {},
  sourceItemsBySourceId = new Map(),
  hunterIds = [],
  limit = null,
  minimumScore = null,
  now = new Date().toISOString(),
  llmRuntime = null,
  llmClient = null
} = {}) {
  const normalized = normalizeOpenClawConfig(config);
  const selected = selectedHunters(normalized, hunterIds);
  const existingRawCandidates = normalizeCollection(sourceData.rawCandidates ?? emptyCollection());
  const sourceRuns = normalizeCollection(sourceData.sourceRuns ?? emptyCollection());
  const contentLanes = normalizeCollection(sourceData.contentLanes ?? emptyCollection()).items;
  const imported = [];
  const rejected = [];
  const duplicateWarnings = [];
  const sourceReports = [];
  const seenInRun = new Set();
  const globalMinimumScore = Number(minimumScore ?? normalized.target.minimumScore);
  const maxImported = Number(limit || normalized.target.dailyMaxCandidates || 200);
  const llmStats = {
    enabled: Boolean(llmRuntime?.enabled),
    mode: llmRuntime?.mode || "fetch-only",
    provider: llmRuntime?.provider || normalized.llm.provider,
    model: llmRuntime?.model || normalized.llm.model,
    judged: 0,
    accepted: 0,
    rejected: 0,
    errors: 0,
    reason: llmRuntime?.reason || ""
  };

  for (const hunter of selected) {
    const hunterMinimumScore = Number(minimumScore ?? hunter.minimumScore ?? globalMinimumScore);
    const hunterReport = {
      hunterId: hunter.hunterId,
      name: hunter.name,
      fetched: 0,
      imported: 0,
      rejected: 0,
      duplicates: 0,
      sources: []
    };

    for (const source of activeSources(hunter)) {
      const sourceResult = sourceItemsBySourceId.get(source.sourceId) ?? { items: [] };
      const fetchedItems = Array.isArray(sourceResult) ? sourceResult : sourceResult.items ?? [];
      const sourceReport = {
        sourceId: source.sourceId,
        name: source.name,
        type: source.type,
        fetched: fetchedItems.length,
        imported: 0,
        rejected: 0,
        duplicates: 0,
        error: sourceResult.error || ""
      };
      hunterReport.fetched += fetchedItems.length;

      for (const item of fetchedItems.slice(0, source.maxItems)) {
        if (imported.length >= maxImported) break;
        const candidateInput = normalizeOpenClawItem(item, { hunter, source, now });
        const evaluation = evaluateOpenClawCandidate(candidateInput, { hunter, source, now });
        if (evaluation.score < hunterMinimumScore || evaluation.status !== "keep") {
          rejected.push({ ...candidateInput, evaluation });
          sourceReport.rejected += 1;
          continue;
        }

        const llmJudgement = await judgeOpenClawCandidateIfEnabled({
          candidate: candidateInput,
          evaluation,
          hunter,
          source,
          llmRuntime,
          llmClient,
          llmStats
        });
        if (llmJudgement?.status === "reject") {
          rejected.push({ ...candidateInput, evaluation, llmJudgement });
          sourceReport.rejected += 1;
          continue;
        }

        const duplicate = checkCandidateDuplicate(candidateInput, [...existingRawCandidates.items, ...imported]);
        const runKey = candidateRunKey(candidateInput);
        if (!duplicate.ok || seenInRun.has(runKey)) {
          sourceReport.duplicates += 1;
          duplicateWarnings.push({
            title: candidateInput.title,
            url: candidateInput.url,
            sourceId: source.sourceId,
            reason: seenInRun.has(runKey) ? "duplicate_in_openclaw_run" : duplicate.flags.find((flag) => flag.severity === "block")?.type || "duplicate"
          });
          continue;
        }

        seenInRun.add(runKey);
        const rawCandidate = {
          ...buildRawCandidate({
            ...candidateInput,
            connectorId: normalized.hub.connectorId,
            sourceId: source.sourceNetworkSourceId || source.sourceId,
            feedId: source.sourceId,
            laneIds: candidateInput.laneIds,
            sourceQualityScore: source.qualityScore,
            rawText: candidateInput.rawText
          }, {
            now,
            contentLanes,
            duplicateCheckResult: duplicate
          }),
          openClaw: {
            hunterId: hunter.hunterId,
            hunterName: hunter.name,
            sourceId: source.sourceId,
            sourceName: source.name,
            fetchedUrl: candidateInput.url,
            score: evaluation.score,
            breakdown: evaluation.breakdown,
            reasons: evaluation.reasons,
            llm: llmJudgement ? sanitizeLlmJudgement(llmJudgement) : null
          }
        };
        rawCandidate.candidateScore = llmJudgement?.score ?? evaluation.score;
        if (llmJudgement?.topicAngle) rawCandidate.topicAngle = llmJudgement.topicAngle;
        if (llmJudgement?.contentAngle) rawCandidate.contentAngle = llmJudgement.contentAngle;
        if (llmJudgement?.accountDirection) rawCandidate.accountDirection = llmJudgement.accountDirection;
        imported.push(rawCandidate);
        sourceReport.imported += 1;
      }

      hunterReport.imported += sourceReport.imported;
      hunterReport.rejected += sourceReport.rejected;
      hunterReport.duplicates += sourceReport.duplicates;
      hunterReport.sources.push(sourceReport);
      sourceReports.push(sourceReport);
    }
  }

  const run = {
    runId: createStableId("sourcerun", [normalized.hub.connectorId, now, imported.length, rejected.length, duplicateWarnings.length]),
    connectorId: normalized.hub.connectorId,
    sourceId: normalized.hub.hubId,
    startedAt: now,
    finishedAt: now,
    status: imported.length ? "success" : rejected.length || duplicateWarnings.length ? "partial" : "empty",
    createdCandidates: imported.length,
    skippedDuplicates: duplicateWarnings.length,
    errors: sourceReports.filter((source) => source.error).map((source) => `${source.name}: ${source.error}`),
    warnings: duplicateWarnings,
    notes: "OpenClaw Source Hub fetched, filtered, scored, and sent selected candidates to raw-candidates.",
    sourceReports,
    createdAt: now,
    updatedAt: now
  };

  const rawCandidates = withUpdatedAt({
    ...existingRawCandidates,
    items: [...existingRawCandidates.items, ...imported]
  });
  const nextSourceRuns = withUpdatedAt({
    ...sourceRuns,
    items: [...sourceRuns.items, run]
  });
  const report = {
    version: 1,
    generatedAt: now,
    hub: normalized.hub,
    target: normalized.target,
    summary: {
      hunters: selected.length,
      fetched: sourceReports.reduce((sum, source) => sum + source.fetched, 0),
      imported: imported.length,
      rejected: rejected.length,
      duplicates: duplicateWarnings.length,
      rawCandidatesAfterRun: rawCandidates.items.length,
      minimumScore: globalMinimumScore,
      dailyTargetStatus: imported.length >= normalized.target.dailyMinCandidates ? "covered" : "short",
      llm: llmStats
    },
    hunters: selected.map((hunter) => ({
      hunterId: hunter.hunterId,
      name: hunter.name,
      dailyTarget: hunter.dailyTarget,
      imported: imported.filter((item) => item.openClaw?.hunterId === hunter.hunterId).length,
      laneIds: hunter.laneIds
    })),
    sources: sourceReports,
    topCandidates: imported
      .slice()
      .sort((a, b) => Number(b.candidateScore || 0) - Number(a.candidateScore || 0))
      .slice(0, 20)
      .map((candidate) => ({
        candidateId: candidate.candidateId,
        title: candidate.title,
        url: candidate.url,
        laneIds: candidate.laneIds,
        score: candidate.candidateScore,
        hunterId: candidate.openClaw?.hunterId,
        sourceId: candidate.openClaw?.sourceId,
        accountDirection: candidate.accountDirection || candidate.openClaw?.llm?.accountDirection || "",
        topicAngle: candidate.topicAngle || candidate.openClaw?.llm?.topicAngle || "",
        contentAngle: candidate.contentAngle || candidate.openClaw?.llm?.contentAngle || "",
        reasons: candidate.openClaw?.llm?.reasons || []
      }))
  };

  return {
    rawCandidates,
    sourceRuns: nextSourceRuns,
    imported,
    rejected,
    duplicateWarnings,
    report,
    stats: {
      fetched: report.summary.fetched,
      imported: imported.length,
      rejected: rejected.length,
      duplicates: duplicateWarnings.length,
      sourceRunId: run.runId,
      totalRawCandidates: rawCandidates.items.length,
      dailyTargetStatus: report.summary.dailyTargetStatus,
      llm: llmStats
    }
  };
}

export function evaluateOpenClawCandidate(candidate, { hunter, source, now = new Date().toISOString() } = {}) {
  const text = candidateText(candidate);
  const includeHits = keywordHits(text, [...(hunter.keywords ?? []), ...(source.includeKeywords ?? [])]);
  const excludeHits = keywordHits(text, source.excludeKeywords ?? []);
  const freshness = freshnessScore(candidate.sourcePublishedAt, now, source.freshnessScore);
  const discussion = clampScore(candidate.metrics?.discussionScore ?? discussionScore(candidate));
  const controversy = clampScore(candidate.metrics?.controversyScore ?? controversyScore(candidate));
  const adPotential = clampScore(adPotentialScore(candidate));
  const affiliate = clampScore(affiliatePotentialScore(candidate));
  const sourceTrust = clampScore(source.qualityScore);
  const keywordScore = Math.min(100, includeHits.length * 12);
  const penalty = excludeHits.length ? 35 + excludeHits.length * 10 : 0;
  const score = clampScore(
    sourceTrust * 0.22 +
    freshness * 0.2 +
    discussion * 0.14 +
    controversy * 0.08 +
    adPotential * 0.14 +
    affiliate * 0.1 +
    keywordScore * 0.12 -
    penalty
  );
  const valid = validCandidateUrl(candidate.url) && candidate.title && includeHits.length && !excludeHits.length;
  return {
    status: valid ? "keep" : "reject",
    score,
    breakdown: { freshness, discussion, controversy, adPotential, affiliate, sourceTrust, keywordScore, penalty },
    reasons: [
      includeHits.length ? `matched:${includeHits.slice(0, 6).join(",")}` : "no_keyword_match",
      excludeHits.length ? `excluded:${excludeHits.slice(0, 4).join(",")}` : "",
      validCandidateUrl(candidate.url) ? "" : "bad_url"
    ].filter(Boolean)
  };
}

export async function resolveOpenClawLlmRuntime(config, options = {}) {
  const llm = normalizeOpenClawLlmConfig(config.llm);
  const disabledByCli = Boolean(options.noLlm || options.llm === false);
  if (!llm.enabled || disabledByCli) {
    return {
      enabled: false,
      mode: "fetch-only",
      provider: llm.provider,
      model: llm.model,
      config: llm,
      reason: disabledByCli ? "disabled_by_cli" : "disabled_in_config"
    };
  }

  await loadLocalEnvFile(options.envPath || ".env");
  const runtimeConfig = {
    ...llm,
    provider: String(process.env.OPENCLAW_LLM_PROVIDER || llm.provider).trim(),
    model: String(process.env.OPENCLAW_LLM_MODEL || llm.model).trim(),
    endpoint: String(process.env.OPENCLAW_LLM_ENDPOINT || llm.endpoint).trim()
  };
  const apiKey = String(process.env[runtimeConfig.apiKeyEnv] || "").trim();
  if (!apiKey && !options.llmClient) {
    return {
      enabled: false,
      mode: "fetch-only",
      provider: runtimeConfig.provider,
      model: runtimeConfig.model,
      config: runtimeConfig,
      reason: `missing_env:${runtimeConfig.apiKeyEnv}`
    };
  }

  return {
    enabled: true,
    mode: "llm-judge",
    provider: runtimeConfig.provider,
    model: runtimeConfig.model,
    apiKey,
    config: runtimeConfig,
    strict: Boolean(options.strictLlm),
    reason: ""
  };
}

async function judgeOpenClawCandidateIfEnabled({ candidate, evaluation, hunter, source, llmRuntime, llmClient, llmStats }) {
  if (!llmRuntime?.enabled) return null;
  if (llmStats.judged >= Number(llmRuntime.config.maxJudgementsPerRun || 30)) {
    return {
      status: "reject",
      score: 0,
      reasons: ["llm_judgement_limit_reached"],
      riskFlags: ["llm_limit"],
      fallback: true
    };
  }

  llmStats.judged += 1;
  try {
    const judgement = llmClient
      ? await llmClient({ candidate, evaluation, hunter, source, llmRuntime })
      : await callZhipuOpenClawJudge({ candidate, evaluation, hunter, source, llmRuntime });
    const normalized = normalizeLlmJudgement(judgement, llmRuntime.config.acceptScore);
    if (normalized.status === "reject") llmStats.rejected += 1;
    else llmStats.accepted += 1;
    return normalized;
  } catch (error) {
    llmStats.errors += 1;
    if (llmRuntime.strict) {
      llmStats.rejected += 1;
      return {
        status: "reject",
        score: 0,
        reasons: [`llm_error:${String(error.message || error).slice(0, 180)}`],
        riskFlags: ["llm_error"],
        fallback: true
      };
    }
    return {
      status: "keep",
      score: evaluation.score,
      reasons: [`llm_error:${String(error.message || error).slice(0, 180)}`],
      fallback: true
    };
  }
}

async function callZhipuOpenClawJudge({ candidate, evaluation, hunter, source, llmRuntime }) {
  const payload = {
    model: llmRuntime.model,
    messages: [
      {
        role: "system",
        content: [
          "你是 OpenClaw Source Hunter 的内容情报评审员。",
          "你的任务是判断候选是否值得进入 AI Creator OS 的 raw_candidates。",
          "必须拒绝未授权 API 绕过、逆向私有接口、盗用/白嫖算力、规避付费、凭证滥用、交易信号和违法违规内容。",
          "只返回 JSON，不要解释。字段必须包括 keep, score, topicAngle, contentAngle, accountDirection, reasons, riskFlags。",
          "score 是 0 到 100 的整数；keep 是布尔值。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          hunter: {
            hunterId: hunter.hunterId,
            name: hunter.name,
            laneIds: hunter.laneIds,
            keywords: hunter.keywords,
            judgeProfile: hunter.judgeProfile
          },
          source: {
            sourceId: source.sourceId,
            name: source.name,
            type: source.type
          },
          ruleEvaluation: evaluation,
          candidate: {
            title: candidate.title,
            url: candidate.url,
            summary: candidate.summary,
            rawText: candidate.rawText,
            publishedAt: candidate.sourcePublishedAt
          },
          outputSchema: {
            keep: "boolean",
            score: "integer 0-100",
            topicAngle: "中文，一句话说明为什么值得做选题",
            contentAngle: "中文，一句话说明适合怎么发",
            accountDirection: "中文，适合投喂的账号方向，例如 AI工具号、Crypto builder号、SaaS创始人号",
            reasons: ["中文短理由"],
            riskFlags: ["风险标签，没有则空数组"]
          }
        })
      }
    ],
    response_format: { type: "json_object" },
    thinking: { type: llmRuntime.config.thinking || "disabled" },
    temperature: 0.2,
    max_tokens: 800
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(llmRuntime.config.timeoutMs || 45000));
  try {
    const response = await fetch(llmRuntime.config.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${llmRuntime.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Zhipu API ${response.status}: ${text.slice(0, 240)}`);
    const json = JSON.parse(text);
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("Zhipu API returned empty content");
    return typeof content === "string" ? parseJsonObject(content) : content;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeLlmJudgement(judgement, acceptScore = 65) {
  const score = clampScore(judgement?.score ?? 0);
  const keep = Boolean(judgement?.keep) && score >= Number(acceptScore || 65);
  return {
    status: keep ? "keep" : "reject",
    score,
    topicAngle: String(judgement?.topicAngle || "").trim(),
    contentAngle: String(judgement?.contentAngle || "").trim(),
    accountDirection: String(judgement?.accountDirection || "").trim(),
    reasons: normalizeList(judgement?.reasons),
    riskFlags: normalizeList(judgement?.riskFlags),
    fallback: Boolean(judgement?.fallback)
  };
}

function sanitizeLlmJudgement(judgement) {
  return {
    status: judgement.status,
    score: judgement.score,
    topicAngle: judgement.topicAngle || "",
    contentAngle: judgement.contentAngle || "",
    accountDirection: judgement.accountDirection || "",
    reasons: judgement.reasons || [],
    riskFlags: judgement.riskFlags || [],
    fallback: Boolean(judgement.fallback)
  };
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM response was not JSON");
    return JSON.parse(match[0]);
  }
}

async function loadLocalEnvFile(filePath) {
  if (process.env.OPENCLAW_ENV_LOADED === "1") return;
  process.env.OPENCLAW_ENV_LOADED = "1";
  let text = "";
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = unquoteEnvValue(rawValue.trim());
  }
}

function unquoteEnvValue(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function normalizeOpenClawLlmConfig(llm = {}) {
  const merged = {
    ...DEFAULT_OPENCLAW_CONFIG.llm,
    ...(llm ?? {})
  };
  return {
    enabled: Boolean(merged.enabled),
    provider: String(merged.provider || "zhipu").trim(),
    model: String(merged.model || "glm-4.7").trim(),
    endpoint: String(merged.endpoint || DEFAULT_OPENCLAW_CONFIG.llm.endpoint).trim(),
    apiKeyEnv: String(merged.apiKeyEnv || "ZHIPUAI_API_KEY").trim(),
    timeoutMs: Number(merged.timeoutMs || 45000),
    acceptScore: Number(merged.acceptScore || 65),
    maxJudgementsPerRun: Number(merged.maxJudgementsPerRun || 30),
    thinking: String(merged.thinking || "disabled").trim()
  };
}

function normalizeJudgeProfile(profile = {}, hunter = {}) {
  return {
    profileId: String(profile.profileId || `${hunter.hunterId || "openclaw"}_judge`).trim(),
    role: String(profile.role || hunter.name || "").trim(),
    acceptWhen: normalizeList(profile.acceptWhen),
    rejectWhen: normalizeList(profile.rejectWhen),
    outputFocus: normalizeList(profile.outputFocus)
  };
}

function normalizeOpenClawSource(source, hunter) {
  return {
    sourceId: String(source.sourceId || "").trim(),
    sourceNetworkSourceId: String(source.sourceNetworkSourceId || source.sourceId || "").trim(),
    name: String(source.name || source.sourceId || "").trim(),
    type: String(source.type || "rss").trim(),
    status: String(source.status || "planned").trim(),
    url: String(source.url || "").trim(),
    daysBack: Number(source.daysBack || 14),
    laneIds: normalizeList(source.laneIds?.length ? source.laneIds : hunter.laneIds),
    qualityScore: clampScore(source.qualityScore ?? 70),
    freshnessScore: clampScore(source.freshnessScore ?? 70),
    maxItems: Number(source.maxItems || 50),
    includeKeywords: normalizeList(source.includeKeywords),
    excludeKeywords: normalizeList(source.excludeKeywords),
    notes: String(source.notes || "").trim()
  };
}

function normalizeOpenClawItem(item, { hunter, source, now }) {
  const title = String(item.title || item.name || "").replace(/\s+/g, " ").trim();
  const url = String(item.url || item.link || "").trim();
  const summary = stripHtml(item.summary || item.description || item.tagline || "").slice(0, 500);
  return {
    title,
    name: title,
    url,
    summary,
    tagline: summary,
    rawText: [title, summary, item.rawText].filter(Boolean).join(" "),
    laneIds: source.laneIds?.length ? source.laneIds : hunter.laneIds,
    sourcePublishedAt: normalizePublishedAt(item.publishedAt || item.published || item.createdAt || now),
    metrics: item.metrics ?? {},
    source: source.name,
    notes: item.notes || ""
  };
}

async function fetchRssSource(source, fetchImpl, options) {
  const xml = await fetchText(source.url, fetchImpl, options);
  const parsed = parser.parse(xml);
  const channelItems = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
  return asArray(channelItems).map((item) => ({
    title: textValue(item.title),
    url: textValue(item.link?.href || item.link),
    summary: textValue(item.description || item.summary || item.content),
    publishedAt: textValue(item.pubDate || item.published || item.updated)
  })).filter((item) => item.title && item.url);
}

async function fetchHnAlgoliaSource(source, fetchImpl, options) {
  const json = await fetchJson(source.url, fetchImpl, options);
  return (json.hits ?? []).map((item) => ({
    title: item.title || item.story_title || "",
    url: item.url || (item.objectID ? `https://news.ycombinator.com/item?id=${item.objectID}` : ""),
    summary: item._highlightResult?.title?.value || item.title || "",
    publishedAt: item.created_at || "",
    metrics: {
      discussionScore: Math.min(100, Number(item.points || 0) + Number(item.num_comments || 0) * 2),
      controversyScore: Math.min(100, Number(item.num_comments || 0) * 4)
    }
  })).filter((item) => item.title && item.url);
}

async function fetchGitHubSearchSource(source, fetchImpl, options) {
  const since = dateDaysAgo(source.daysBack || 14, options.now);
  const url = source.url.replace("{since}", since);
  const json = await fetchJson(url, fetchImpl, options, { "User-Agent": "AI-Creator-OS-OpenClaw" });
  return (json.items ?? []).map((repo) => ({
    title: repo.full_name || repo.name || "",
    url: repo.html_url || "",
    summary: repo.description || "",
    publishedAt: repo.created_at || repo.pushed_at || "",
    metrics: {
      discussionScore: Math.min(100, Number(repo.stargazers_count || 0) / 5 + Number(repo.forks_count || 0)),
      controversyScore: Math.min(100, Number(repo.open_issues_count || 0))
    },
    rawText: [repo.language, ...(repo.topics ?? [])].filter(Boolean).join(" ")
  })).filter((item) => item.title && item.url);
}

async function fetchDefiLlamaProtocolsSource(source, fetchImpl, options) {
  const json = await fetchJson(source.url, fetchImpl, options);
  return (Array.isArray(json) ? json : [])
    .filter((protocol) => !/\b(cex|centralized exchange|exchange)\b/i.test([
      protocol.name,
      protocol.category,
      protocol.description
    ].filter(Boolean).join(" ")))
    .sort((a, b) => Number(b.tvl || 0) - Number(a.tvl || 0))
    .slice(0, Math.max(50, Number(source.maxItems || 50) * 5))
    .map((protocol) => ({
    title: protocol.name || "",
    url: protocol.url || `https://defillama.com/protocol/${protocol.slug || ""}`,
    summary: [
      protocol.category,
      protocol.chains?.slice?.(0, 4)?.join(", "),
      protocol.description
    ].filter(Boolean).join(" | "),
    publishedAt: options.now || new Date().toISOString(),
    metrics: {
      discussionScore: Math.min(100, Math.log10(Math.max(1, Number(protocol.tvl || 0))) * 16),
      controversyScore: Math.min(100, Math.abs(Number(protocol.change_1d || 0)) * 4)
    },
    rawText: [protocol.category, ...(protocol.chains ?? [])].filter(Boolean).join(" ")
  })).filter((item) => item.title && item.url);
}

async function fetchText(url, fetchImpl, options = {}, headers = {}) {
  if (!fetchImpl) return fetchTextWithCurl(url, options, headers);
  const response = await fetchWithTimeout(url, fetchImpl, options, headers);
  return response.text();
}

async function fetchJson(url, fetchImpl, options = {}, headers = {}) {
  if (!fetchImpl) return JSON.parse(await fetchTextWithCurl(url, options, headers));
  const response = await fetchWithTimeout(url, fetchImpl, options, headers);
  return response.json();
}

async function fetchTextWithCurl(url, options = {}, headers = {}) {
  const maxTimeSeconds = Math.max(2, Math.ceil(fetchTimeoutMs(options) / 1000));
  const dir = await mkdtemp(join(tmpdir(), "openclaw-fetch-"));
  const outputPath = join(dir, "body.txt");
  const args = ["-fsSL", "--compressed", "--connect-timeout", "8", "--max-time", String(maxTimeSeconds), "-o", outputPath];
  for (const [key, value] of Object.entries(headers)) {
    args.push("-H", `${key}: ${value}`);
  }
  args.push(url);
  try {
    await execFileAsync("curl", args, {
      maxBuffer: 20 * 1024 * 1024
    });
    return await readFile(outputPath, "utf8");
  } catch (error) {
    const message = error.stderr || error.message || "curl failed";
    throw new Error(message.trim());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function fetchWithTimeout(url, fetchImpl, options = {}, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs(options));
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json, application/rss+xml, application/xml, text/xml, text/html;q=0.8",
        ...headers
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText || ""}`.trim());
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function fetchTimeoutMs(options = {}) {
  const value = Number(options.timeoutMs || DEFAULT_FETCH_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_FETCH_TIMEOUT_MS;
}

function selectedHunters(config, hunterIds = []) {
  const ids = new Set((Array.isArray(hunterIds) ? hunterIds : [hunterIds]).filter(Boolean));
  return config.hunters.filter((hunter) => !ids.size || ids.has(hunter.hunterId));
}

function activeSources(hunter) {
  return hunter.sources.filter((source) => source.status === "active" && source.sourceId && source.url);
}

function normalizeList(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean))];
}

function candidateText(candidate) {
  return [
    candidate.title,
    candidate.summary,
    candidate.rawText,
    candidate.url
  ].filter(Boolean).join(" ").toLowerCase();
}

function keywordHits(text, keywords) {
  const lower = String(text || "").toLowerCase();
  return normalizeList(keywords).filter((keyword) => lower.includes(keyword.toLowerCase()));
}

function freshnessScore(publishedAt, now, fallback = 70) {
  const published = new Date(publishedAt);
  const current = new Date(now);
  if (Number.isNaN(published.getTime()) || Number.isNaN(current.getTime())) return clampScore(fallback);
  const ageHours = Math.max(0, (current.getTime() - published.getTime()) / 3600000);
  if (ageHours <= 24) return 100;
  if (ageHours <= 72) return 88;
  if (ageHours <= 168) return 74;
  if (ageHours <= 720) return 55;
  return 35;
}

function discussionScore(candidate) {
  const text = candidateText(candidate);
  let score = 35;
  if (/\b(show hn|launch|release|announced|new|introducing)\b/.test(text)) score += 20;
  if (/\b(open source|github|api|sdk|developer|builder)\b/.test(text)) score += 16;
  if (/\b(pricing|growth|churn|wallet|security|onchain|agent)\b/.test(text)) score += 12;
  return score;
}

function controversyScore(candidate) {
  const text = candidateText(candidate);
  let score = 20;
  if (/\b(vs|alternative|kills|replaces|risk|security|privacy|open source)\b/.test(text)) score += 25;
  if (/\b(price|token|market)\b/.test(text)) score += 10;
  return score;
}

function adPotentialScore(candidate) {
  const text = candidateText(candidate);
  let score = 35;
  if (/\b(tool|platform|api|sdk|dashboard|workflow|automation|saas|wallet)\b/.test(text)) score += 30;
  if (/\b(founder|team|developer|operator|marketer|support|sales)\b/.test(text)) score += 20;
  return score;
}

function affiliatePotentialScore(candidate) {
  const text = candidateText(candidate);
  let score = 30;
  if (/\b(saas|tool|platform|subscription|developer tool|automation|analytics|dashboard)\b/.test(text)) score += 35;
  if (/\b(open source|protocol|research|newsletter|market)\b/.test(text)) score -= 10;
  return score;
}

function candidateRunKey(candidate) {
  return `${String(candidate.url || "").toLowerCase()}::${String(candidate.title || "").toLowerCase()}`;
}

function validCandidateUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function normalizePublishedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function dateDaysAgo(days, now = new Date().toISOString()) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - Number(days || 14));
  return date.toISOString().slice(0, 10);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function textValue(value) {
  if (Array.isArray(value)) return textValue(value[0]);
  if (value && typeof value === "object") return textValue(value["#text"] || value.href || "");
  return stripHtml(value);
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function clampScore(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}
