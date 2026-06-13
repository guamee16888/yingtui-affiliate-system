import { pathToFileURL } from "node:url";
import { sanitizeDemoData } from "./lib/demo-sanitize.mjs";

export { sanitizeDemoData };

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await sanitizeDemoData();
  console.log("Demo sanitize complete");
  console.log(`data files: ${result.dataFiles}`);
  console.log(`config files: ${result.configFiles}`);
  console.log(`data target: ${result.targetDataDir}`);
  console.log(`config target: ${result.targetConfigDir}`);
}
