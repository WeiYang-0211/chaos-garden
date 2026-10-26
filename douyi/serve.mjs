#!/usr/bin/env node
import http from "node:http";
import path from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8050);
const MAX_BODY = 2 * 1024 * 1024;
const UPSTREAM_TIMEOUT = 180_000;

const MIME = new Map(Object.entries({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
}));

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": [
    "default-src 'self'",
    "connect-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "script-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
};

function applyBaseHeaders(res) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(key, value);
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  applyBaseHeaders(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function normalizeChatUrl(endpoint) {
  const base = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("缺少接口地址");
  let url;
  try {
    url = new URL(base);
  } catch {
    throw new Error("接口地址不是合法 URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("接口地址必须是 http 或 https");
  }
  const cleanPath = url.pathname.replace(/\/+$/, "");
  if (!cleanPath.endsWith("/chat/completions")) {
    url.pathname = `${cleanPath}/chat/completions`.replace(/\/{2,}/g, "/");
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function providerErrorMessage(status, raw) {
  const text = String(raw || "").trim();
  if (!text) return `模型服务返回 ${status}`;
  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error?.message || parsed?.message || parsed?.error;
    if (typeof message === "string" && message.trim()) {
      return message.trim().slice(0, 500);
    }
  } catch {
  }
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}

async function handleChat(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "只接受 POST" });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (error) {
    sendJson(res, 400, { error: error.message === "请求体过大" ? error.message : "请求体不是合法 JSON" });
    return;
  }

  const { endpoint, apiKey = "", model, messages, temperature = 0.9, maxTokens = 900 } = payload || {};
  if (!model || typeof model !== "string") {
    sendJson(res, 400, { error: "缺少模型名" });
    return;
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    sendJson(res, 400, { error: "缺少 messages" });
    return;
  }

  let target;
  try {
    target = normalizeChatUrl(endpoint);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT);
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  const headers = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (typeof apiKey === "string" && apiKey.trim()) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  const upstreamBody = {
    model: model.trim(),
    messages,
    stream: true,
    temperature: Number.isFinite(Number(temperature)) ? Math.min(2, Math.max(0, Number(temperature))) : 0.9,
    max_tokens: Number.isFinite(Number(maxTokens)) ? Math.min(4096, Math.max(8, Math.round(Number(maxTokens)))) : 900,
  };

  let upstream;
  try {
    upstream = await fetch(target, {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamBody),
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (error) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      if (!res.headersSent) sendJson(res, 504, { error: "模型服务超时或连接被取消" });
      return;
    }
    if (!res.headersSent) {
      sendJson(res, 502, {
        error: "无法连接模型服务",
        detail: String(error?.cause?.message || error?.message || error).slice(0, 300),
      });
    }
    return;
  }

  if (!upstream.ok) {
    clearTimeout(timer);
    const raw = await upstream.text().catch(() => "");
    if (!res.headersSent) {
      sendJson(res, upstream.status, {
        error: providerErrorMessage(upstream.status, raw),
        upstreamStatus: upstream.status,
      });
    }
    return;
  }

  const contentType = upstream.headers.get("content-type") || "text/event-stream; charset=utf-8";
  applyBaseHeaders(res);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store, no-cache, must-revalidate",
    "X-Accel-Buffering": "no",
  });

  if (!upstream.body) {
    clearTimeout(timer);
    res.end();
    return;
  }

  const stream = Readable.fromWeb(upstream.body);
  stream.on("error", () => {
    if (!res.writableEnded) res.destroy();
  });
  res.on("close", () => stream.destroy());
  stream.pipe(res);
  res.on("finish", () => clearTimeout(timer));
}

async function handleStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "只接受 GET" });
    return;
  }

  let pathname = "/";
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname);
  } catch {
    sendJson(res, 400, { error: "路径不合法" });
    return;
  }
  if (pathname === "/") pathname = "/index.html";

  let target = path.resolve(ROOT, `.${pathname}`);
  const relative = path.relative(ROOT, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    sendJson(res, 403, { error: "越界路径" });
    return;
  }

  let info;
  try {
    info = await stat(target);
    if (info.isDirectory()) {
      target = path.join(target, "index.html");
      info = await stat(target);
    }
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("404");
    return;
  }

  const ext = path.extname(target).toLowerCase();
  applyBaseHeaders(res);
  res.writeHead(200, {
    "Content-Type": MIME.get(ext) || "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control": "no-store, no-cache, must-revalidate",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(target).on("error", () => res.destroy()).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname === "/api/chat") {
    handleChat(req, res).catch((error) => {
      if (!res.headersSent) sendJson(res, 500, { error: "本地代理异常", detail: String(error?.message || error) });
      else res.destroy();
    });
    return;
  }
  if (url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "douwen-arena", node: process.version });
    return;
  }
  handleStatic(req, res).catch(() => {
    if (!res.headersSent) sendJson(res, 500, { error: "静态服务异常" });
    else res.destroy();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`\n  斗文台  ->  http://${HOST}:${PORT}/\n  SSE 代理 ->  POST /api/chat\n  缓存已关闭，Ctrl+C 收席\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    console.log("\n收席。");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
}
