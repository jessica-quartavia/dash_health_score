import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describeEnvStatus, loadProjectEnv } from "../lib/load-env.mjs";

loadProjectEnv();
import { probeDataRead } from "../lib/data/supabase-rest.mjs";
import { dispatchHttpApi, normalizeApiPath } from "../lib/api/dispatch-http-api.mjs";

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

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

/** Espelha Vercel: assets de public/ na raiz da URL; /public/* não é rota válida. */
function safeFilePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  if (decoded === "/") return join(ROOT, "public", "index.html");
  if (decoded.startsWith("/public/") || decoded === "/public") return null;
  if (decoded.startsWith("/lib/")) return null;
  const rel = decoded.replace(/^\//, "");
  const resolved = resolve(ROOT, "public", normalize(rel));
  const publicRoot = join(ROOT, "public");
  if (!resolved.startsWith(publicRoot)) return null;
  return resolved;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const apiPath = normalizeApiPath(url.pathname);

  if (apiPath.startsWith("/api/")) {
    await dispatchHttpApi({ apiPath, req, res, url, root: ROOT });
    return;
  }

  if (url.pathname.startsWith("/lib/")) {
    const rel = decodeURIComponent(url.pathname.slice("/lib/".length));
    const libPath = resolve(ROOT, "lib", rel);
    if (libPath.startsWith(join(ROOT, "lib")) && existsSync(libPath) && statSync(libPath).isFile()) {
      send(res, 200, readFileSync(libPath), {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      return;
    }
  }

  let filePath = safeFilePath(url.pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    const spaFallback = (url.pathname === "/" || !extname(url.pathname)) && !url.pathname.startsWith("/api/");
    if (spaFallback) {
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
  const env = describeEnvStatus();
  console.log(`Health Score dashboard em http://localhost:${PORT}`);
  console.log(`API Panorama: GET http://localhost:${PORT}/api/research-panorama`);
  console.log(env.line);
  if (!env.ready) return;
  probeDataRead()
    .then((probe) => {
      const total = probe.total == null ? "contagem indisponível" : `${probe.total} clientes na leitura`;
      console.log(`BASE QV: leitura ok — ${total}`);
    })
    .catch((error) => {
      console.error(`BASE QV: ${error?.code || "DATA_CONNECTION"} — ${error?.message || "falha de conexão"}`);
    });
});
