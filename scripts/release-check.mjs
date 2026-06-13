import { pathToFileURL } from "node:url";
import { formatReleaseCheckReport, runReleaseCheck } from "./lib/release-check.mjs";

export { runReleaseCheck };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runReleaseCheck();
  console.log(formatReleaseCheckReport(result));
  if (result.errors.length) process.exitCode = 1;
}
