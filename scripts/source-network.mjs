import { buildSourceNetworkReports, renderSourceNetworkMarkdown, writeSourceNetworkReports } from "./lib/source-network.mjs";

const dateArg = process.argv.find((arg) => arg.startsWith("--date="));
const date = dateArg ? dateArg.split("=")[1] : new Date().toISOString().slice(0, 10);

const reports = await buildSourceNetworkReports({ date });
await writeSourceNetworkReports(reports);

const markdown = renderSourceNetworkMarkdown(reports);
console.log(markdown);
console.log("\nWrote data/source-registry.json");
console.log("Wrote data/source-quality.json");
console.log("Wrote data/source-supply.json");
console.log(`Wrote output/${reports.registry.date}-source-network.md`);
