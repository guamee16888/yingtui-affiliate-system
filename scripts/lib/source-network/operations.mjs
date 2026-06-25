import {
  buildSourceNetworkConfigWithSource,
  loadSourceNetworkConfig,
  saveSourceNetworkConfig
} from "./config.mjs";
import { buildSourceNetworkReports, writeSourceNetworkReports } from "./reports.mjs";
import { normalizeSourceStatus } from "./internal.mjs";

export async function upsertSourceNetworkSource(input = {}) {
  const config = await loadSourceNetworkConfig();
  const nextConfig = buildSourceNetworkConfigWithSource(config, input);
  await saveSourceNetworkConfig(nextConfig);
  const reports = await buildSourceNetworkReports();
  await writeSourceNetworkReports(reports);
  return reports;
}

export async function updateSourceNetworkSourceStatus(input = {}) {
  const config = await loadSourceNetworkConfig();
  const sourceId = String(input.sourceId || "").trim();
  if (!sourceId) throw new Error("sourceId is required.");
  const status = normalizeSourceStatus(input.status);
  const index = config.sources.findIndex((source) => source.sourceId === sourceId);
  if (index === -1) throw new Error(`Unknown source: ${sourceId}`);
  const sources = config.sources.map((source) => source.sourceId === sourceId ? { ...source, status } : source);
  await saveSourceNetworkConfig({ ...config, sources });
  const reports = await buildSourceNetworkReports();
  await writeSourceNetworkReports(reports);
  return reports;
}

export async function refreshSourceNetworkReports() {
  const reports = await buildSourceNetworkReports();
  await writeSourceNetworkReports(reports);
  return reports;
}
