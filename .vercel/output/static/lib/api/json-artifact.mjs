import { existsSync, readFileSync } from "node:fs";

export function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

/**
 * Serve a JSON file as API response, or structured 404 — never HTML.
 */
export function serveJsonArtifactFile(res, filePath, { missingStatus = 404, missingBody } = {}) {
  if (!existsSync(filePath)) {
    sendJson(res, missingStatus, missingBody ?? { ok: false, status: "missing", error: "Artefato ausente." });
    return true;
  }
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(readFileSync(filePath, "utf8"));
  return true;
}

export function sendApiNotFound(res, apiPath) {
  sendJson(res, 404, {
    ok: false,
    status: "not_found",
    error: "Rota de API não encontrada.",
    path: apiPath,
    hint: "Use npm run dev (scripts/dev-server.mjs) e reinicie após atualizar rotas.",
  });
}
