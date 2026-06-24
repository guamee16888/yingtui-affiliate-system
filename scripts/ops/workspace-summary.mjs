import { formatWorkspaceSummary, loadWorkspaceSummary } from "../lib/workspace-system.mjs";

console.log(formatWorkspaceSummary(await loadWorkspaceSummary()));
