import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { startDashboardServer } from "./serve-dashboard.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;
const MAX_PORT = 4199;

const args = parseArgs(process.argv.slice(2));
const host = args.host || DEFAULT_HOST;
const port = await findOpenPort(Number(args.port || DEFAULT_PORT), MAX_PORT, host);
const url = `http://${host}:${port}/dashboard/`;

if (port !== Number(args.port || DEFAULT_PORT)) {
  console.log(`Port ${args.port || DEFAULT_PORT} is busy. Using ${port} instead.`);
}

const server = startDashboardServer({ host, port });
server.on("listening", () => {
  console.log(`Open ${url}`);
  if (!args.noOpen) openBrowser(url);
});

function parseArgs(argv) {
  const parsed = { noOpen: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--port") parsed.port = Number(argv[++index]);
    else if (argv[index] === "--host") parsed.host = argv[++index];
    else if (argv[index] === "--no-open") parsed.noOpen = true;
  }
  return parsed;
}

async function findOpenPort(startPort, maxPort, host) {
  for (let port = startPort; port <= maxPort; port += 1) {
    if (await canListen(port, host)) return port;
  }
  throw new Error(`No open port found between ${startPort} and ${maxPort}.`);
}

function canListen(port, host) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

function openBrowser(url) {
  if (process.platform !== "darwin") return;
  const child = spawn("open", [url], { stdio: "ignore", detached: true });
  child.unref();
}
