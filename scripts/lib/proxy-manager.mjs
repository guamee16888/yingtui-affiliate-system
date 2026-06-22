import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { getDesktopAppDataDir } from "../../desktop/app-config.mjs";
import { emptyCollection, loadCollection, saveCollection } from "./core-data.mjs";
import { readJson, resolveProjectPath, writeJsonAtomic } from "./file-store.mjs";
import { createStableId } from "./ids.mjs";

const PROXY_COLLECTION_PATH = "data/proxies.json";

/**
 * 代理类型枚举
 */
export const ProxyType = {
  HTTP: "http",
  HTTPS: "https",
  SOCKS4: "socks4",
  SOCKS5: "socks5"
};

/**
 * 代理状态枚举
 */
export const ProxyStatus = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  TESTING: "testing",
  FAILED: "failed"
};

/**
 * 加载代理列表
 */
export async function loadProxies(options = {}) {
  const collection = await readJson(PROXY_COLLECTION_PATH, emptyCollection());
  const workspaceId = options.workspaceId || "workspace_default";

  return {
    items: (collection.items || []).filter(item =>
      !workspaceId || (item.workspaceId || "workspace_default") === workspaceId
    ),
    updatedAt: collection.updatedAt || ""
  };
}

/**
 * 根据ID获取代理
 */
export async function getProxyById(proxyId) {
  const collection = await readJson(PROXY_COLLECTION_PATH, emptyCollection());
  return (collection.items || []).find(item => item.proxyId === proxyId) || null;
}

/**
 * 创建或更新代理
 * 只保存 host:port、国家、城市、状态、备注等元数据
 * 不保存 username/password（产品边界：仅做 IP 备注和检测，不做代理认证连接）
 */
export async function upsertProxy(input = {}, actor = { userId: "user_owner" }) {
  const now = new Date().toISOString();
  const workspaceId = input.workspaceId || "workspace_default";

  // 验证必填字段
  if (!input.host) throw new Error("代理地址不能为空");
  if (!input.port) throw new Error("代理端口不能为空");

  // 解析代理配置
  const proxyConfig = parseProxyInput(input);

  const proxyId = input.proxyId || createStableId("proxy", [workspaceId, proxyConfig.host, proxyConfig.port]);

  const collection = await readJson(PROXY_COLLECTION_PATH, emptyCollection());
  const existing = (collection.items || []).find(item => item.proxyId === proxyId);

  const proxy = {
    proxyId,
    workspaceId,
    name: input.name || proxyConfig.host,
    type: proxyConfig.type,
    host: proxyConfig.host,
    port: proxyConfig.port,

    // 代理质量和元数据
    country: input.country || "",
    city: input.city || "",
    isp: input.isp || "",
    proxyType: input.proxyType || "datacenter", // datacenter, residential, mobile
    status: input.status || ProxyStatus.ACTIVE,

    // 性能指标
    lastChecked: input.lastChecked || "",
    responseTime: input.responseTime || 0,
    successRate: input.successRate || 0,

    // 使用统计
    usageCount: input.usageCount || existing?.usageCount || 0,
    lastUsedAt: input.lastUsedAt || existing?.lastUsedAt || "",

    // 标签和备注
    tags: input.tags || [],
    notes: input.notes || "",

    // 审计字段
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    createdBy: actor.userId
  };

  const items = (collection.items || []).filter(item => item.proxyId !== proxyId);
  items.push(proxy);

  await writeJsonAtomic(PROXY_COLLECTION_PATH, {
    ...collection,
    updatedAt: now,
    items
  });

  return { proxy };
}

/**
 * 批量导入代理
 * 只保存 host:port 和元数据，username/password 被忽略
 */
export async function importProxies(input = {}, actor = { userId: "user_owner" }) {
  const workspaceId = input.workspaceId || "workspace_default";
  const proxies = parseProxyList(input.text || input.csv || "");

  if (proxies.length === 0) {
    throw new Error("未找到有效的代理配置");
  }

  const imported = [];
  const failed = [];

  for (const proxyInput of proxies) {
    try {
      const result = await upsertProxy({
        ...proxyInput,
        workspaceId,
        name: proxyInput.name || `${proxyInput.host}:${proxyInput.port}`
      }, actor);
      imported.push(result.proxy);
    } catch (error) {
      failed.push({
        input: proxyInput,
        error: error.message
      });
    }
  }

  return {
    imported,
    failed,
    importedCount: imported.length,
    failedCount: failed.length
  };
}

/**
 * 删除代理
 */
export async function deleteProxy(proxyId, actor = { userId: "user_owner" }) {
  const collection = await readJson(PROXY_COLLECTION_PATH, emptyCollection());
  const items = (collection.items || []).filter(item => item.proxyId !== proxyId);

  if (items.length === (collection.items || []).length) {
    throw new Error(`代理不存在: ${proxyId}`);
  }

  await writeJsonAtomic(PROXY_COLLECTION_PATH, {
    ...collection,
    updatedAt: new Date().toISOString(),
    items
  });

  return { deleted: true, proxyId };
}

/**
 * 测试代理连接
 * 通过 HTTP CONNECT 隧道真正经过代理服务器请求 ipify.org
 * 这样返回的 IP 才是代理出口 IP，而不是本机 IP
 */
export async function testProxy(proxyId, options = {}) {
  const proxy = await getProxyById(proxyId);
  if (!proxy) throw new Error(`代理不存在: ${proxyId}`);

  const startTime = Date.now();
  let success = false;
  let error = "";
  let detectedIp = "";

  try {
    const timeout = options.timeout || 10000;
    const result = await fetchIpThroughProxy(proxy, timeout);
    success = true;
    detectedIp = result.ip;
    proxy.responseTime = Date.now() - startTime;
    proxy.lastChecked = new Date().toISOString();
    proxy.status = ProxyStatus.ACTIVE;
    proxy.successRate = Math.min(100, (proxy.successRate || 0) + 10);
  } catch (err) {
    error = err.message;
    proxy.status = ProxyStatus.FAILED;
    proxy.successRate = Math.max(0, (proxy.successRate || 0) - 10);
  }

  // 更新代理状态
  await upsertProxy(proxy);

  return {
    proxyId,
    success,
    error,
    detectedIp,
    responseTime: proxy.responseTime,
    status: proxy.status
  };
}

/**
 * 通过 HTTP CONNECT 隧道经由代理获取出口 IP
 * 对于 HTTP/HTTPS 代理，使用 CONNECT 方法建立隧道
 */
function fetchIpThroughProxy(proxy, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const proxyPort = Number(proxy.port) || 8080;
    const targetHost = "api.ipify.org";
    const targetPath = "/?format=json";

    // 第一步：通过 CONNECT 建立隧道
    const connectRequest = http.request({
      host: proxy.host,
      port: proxyPort,
      method: "CONNECT",
      path: `${targetHost}:443`,
      timeout
    });

    connectRequest.on("connect", (response, socket) => {
      if (response.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`代理 CONNECT 失败: HTTP ${response.statusCode}`));
        return;
      }

      // 第二步：通过隧道发送 HTTPS 请求
      const tlsRequest = https.request({
        socket,
        hostname: targetHost,
        path: targetPath,
        method: "GET",
        headers: { "Host": targetHost }
      }, (tlsResponse) => {
        let body = "";
        tlsResponse.on("data", (chunk) => { body += chunk; });
        tlsResponse.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (data.ip) {
              resolve({ ip: data.ip });
            } else {
              reject(new Error("代理返回的 IP 格式无效"));
            }
          } catch {
            // 尝试纯文本解析
            const ipMatch = body.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
            if (ipMatch) {
              resolve({ ip: ipMatch[0] });
            } else {
              reject(new Error(`代理返回了无法解析的响应: ${body.slice(0, 200)}`));
            }
          }
        });
      });

      tlsRequest.on("error", (err) => {
        socket.destroy();
        reject(new Error(`代理隧道请求失败: ${err.message}`));
      });

      tlsRequest.end();
    });

    connectRequest.on("error", (err) => {
      reject(new Error(`代理连接失败: ${err.message}`));
    });

    connectRequest.on("timeout", () => {
      connectRequest.destroy();
      reject(new Error(`代理连接超时 (${timeout}ms)`));
    });

    connectRequest.end();
  });
}

/**
 * 构建代理URL（仅用于显示和导出，不用于实际连接）
 */
export function buildProxyUrl(proxy) {
  if (!proxy || !proxy.host || !proxy.port) {
    return null;
  }
  const protocol = proxy.type || "http";
  return `${protocol}://${proxy.host}:${proxy.port}`;
}

/**
 * 解析代理输入
 */
function parseProxyInput(input) {
  const host = String(input.host || "").trim();
  const port = Number(input.port || 0);

  if (!host) throw new Error("代理地址不能为空");
  if (!port || port < 1 || port > 65535) throw new Error("端口必须是 1-65535 之间的数字");

  let type = String(input.type || "http").toLowerCase();
  if (!["http", "https", "socks4", "socks5"].includes(type)) {
    type = "http";
  }

  return { host, port, type };
}

/**
 * 解析代理列表文本
 * 支持多种格式:
 * - ip:port
 * - ip:port:username:password（username/password 会被忽略）
 * - protocol://username:password@ip:port（username/password 会被忽略）
 */
function parseProxyList(text) {
  const lines = String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const proxies = [];

  for (const line of lines) {
    try {
      const proxy = parseProxyLine(line);
      if (proxy) proxies.push(proxy);
    } catch (error) {
      console.error(`Failed to parse proxy line: ${line}`, error);
    }
  }

  return proxies;
}

/**
 * 解析单行代理配置
 * username/password 被解析但不保存（产品边界）
 */
function parseProxyLine(line) {
  // 格式1: protocol://username:password@ip:port
  if (line.includes("://")) {
    const url = new URL(line);
    return {
      type: url.protocol.replace(":", ""),
      host: url.hostname,
      port: url.port
      // username/password 不保存
    };
  }

  // 格式2: ip:port:username:password（只取前两个字段）
  const parts = line.split(/[:\s]+/);
  if (parts.length >= 2) {
    return {
      host: parts[0],
      port: parts[1],
      type: "http"
      // parts[2] 和 parts[3] 是 username/password，不保存
    };
  }

  return null;
}

/**
 * 导出代理列表为CSV
 */
export async function exportProxiesCsv(workspaceId = "workspace_default") {
  const { items } = await loadProxies({ workspaceId });

  const rows = items.map(proxy => [
    proxy.name || "",
    proxy.type || "http",
    proxy.host || "",
    proxy.port || "",
    proxy.country || "",
    proxy.city || "",
    proxy.proxyType || "datacenter",
    proxy.status || "active",
    proxy.responseTime || "",
    proxy.successRate || "",
    proxy.notes || ""
  ]);

  const headers = [
    "name", "type", "host", "port",
    "country", "city", "proxyType", "status",
    "responseTime", "successRate", "notes"
  ];

  return [headers, ...rows].map(row => row.map(cell => csvCell(cell)).join(",")).join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}
