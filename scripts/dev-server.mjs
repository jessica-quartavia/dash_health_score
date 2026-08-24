import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { handleHealthScoreApi } from "../lib/api/health-score-handler.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT || 3010);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return null;
  const text = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const parsed = {};
  for (const line of text.split(/\r?\n/)) {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("export ")) trimmed = trimmed.slice(7).trim();
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function loadLocalEnv() {
  const fromEnv = parseEnvFile(join(ROOT, ".env")) || {};
  const fromLocal = parseEnvFile(join(ROOT, ".env.local")) || {};
  const merged = { ...fromEnv, ...fromLocal };
  for (const [key, value] of Object.entries(merged)) {
    process.env[key] = value;
  }
  return {
    dataUrl: Boolean(String(process.env.DATA_SUPABASE_URL || "").trim()),
    dataKey: Boolean(String(process.env.DATA_SUPABASE_SERVICE_ROLE_KEY || "").trim()),
  };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, body) {
  send(res, status, JSON.stringify(body), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
}

function safeFilePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded === "/" ? "/public/index.html" : decoded.startsWith("/public/")
    ? decoded
    : `/public${decoded}`;
  const resolved = resolve(ROOT, `.${normalize(relative)}`);
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}

function normalizeApiPath(pathname) {
  const base = String(pathname || "/");
  if (base.length > 1 && base.endsWith("/")) return base.slice(0, -1);
  return base;
}

loadLocalEnv();

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const apiPath = normalizeApiPath(url.pathname);

  if (apiPath === "/api/health-score" || apiPath === "/api/health-score/clientes") {
    loadLocalEnv();
    try {
      await handleHealthScoreApi(req, res);
    } catch (error) {
      console.error("[dev] health-score", error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Falha interna.", code: "INTERNAL" });
      }
    }
    return;
  }

  if (apiPath === "/api/health") {
    sendJson(res, 200, { ok: true, service: "dashboard-health-score-clientes" });
    return;
  }

  let filePath = safeFilePath(url.pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    if (url.pathname === "/" || !extname(url.pathname)) {
      filePath = join(ROOT, "public", "index.html");
    }
  }

  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  send(res, 200, readFileSync(filePath), { "Content-Type": mime, "Cache-Control": "no-cache" });
});

server.listen(PORT, () => {
  const env = loadLocalEnv();
  console.log(`Health Score dashboard em http://localhost:${PORT}`);
  console.log(`BASE QV: ${env.dataUrl && env.dataKey ? "configurada" : "AUSENTE — preencha o .env"}`);
});
