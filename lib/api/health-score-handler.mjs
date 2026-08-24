/**
 * Handler HTTP para /api/health-score e /api/health-score/clientes.
 */

import { getHealthScoreResponse } from "../service.mjs";

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function parseQuery(url) {
  const u = new URL(url, "http://localhost");
  const query = {};
  for (const [key, value] of u.searchParams.entries()) {
    query[key] = value;
  }
  return { pathname: u.pathname.replace(/\/$/, "") || "/", query };
}

export async function handleHealthScoreApi(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Método não permitido.", code: "METHOD_NOT_ALLOWED" });
    return;
  }

  const { pathname, query } = parseQuery(req.url || "/");
  const clientsOnly =
    pathname === "/api/health-score/clientes" || pathname.endsWith("/clientes");

  try {
    const body = await getHealthScoreResponse(query, { clientsOnly });
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end();
      return;
    }
    sendJson(res, 200, body);
  } catch (error) {
    const code = error?.code || "HEALTH_SCORE_ERROR";
    const status = code === "DATA_CONFIG" ? 503 : 500;
    console.error("[health-score]", error);
    sendJson(res, status, {
      error: error?.message || "Falha ao calcular Health Score.",
      code,
    });
  }
}
