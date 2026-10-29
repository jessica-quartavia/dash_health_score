/**
 * Handler HTTP para /api/health-score, /clientes e /health-score.csv.
 */

import { getClientHsHistory, getHealthScoreCsvResponse, getHealthScoreResponse } from "../service.mjs";

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function sendCsv(res, { filename, csv }) {
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });
  res.end(csv);
}

function parseQuery(url) {
  const u = new URL(url, "http://localhost");
  const query = {};
  for (const [key, value] of u.searchParams.entries()) {
    query[key] = value;
  }
  return { pathname: u.pathname.replace(/\/$/, "") || "/", query };
}

function isCsvRequest(pathname, query) {
  return (
    pathname === "/api/health-score.csv"
    || pathname.endsWith("/health-score.csv")
    || query.format === "csv"
    || query.download === "csv"
  );
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
    if (pathname === "/api/client-hs-history" || pathname.endsWith("/historico")) {
      let clientId = query.clientId;
      const parts = pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("clientes");
      if (idx >= 0 && parts[idx + 1]) clientId = decodeURIComponent(parts[idx + 1]);
      const body = await getClientHsHistory(clientId);
      sendJson(res, 200, body);
      return;
    }
    if (isCsvRequest(pathname, query)) {
      const file = await getHealthScoreCsvResponse(query);
      if (req.method === "HEAD") {
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${file.filename}"`,
          "Cache-Control": "no-store",
        });
        res.end();
        return;
      }
      sendCsv(res, file);
      return;
    }

    const body = await getHealthScoreResponse(query, { clientsOnly });
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end();
      return;
    }
    sendJson(res, 200, body);
  } catch (error) {
    const code = error?.code || "HEALTH_SCORE_ERROR";
    const statusByCode = {
      DATA_CONFIG: 503,
      DATA_CONFIG_INVALID: 503,
      DATA_AUTH: 401,
      DATA_PERMISSION: 403,
      DATA_CONNECTION: 503,
      DATA_QUERY: 502,
      DATA_UPSTREAM: 502,
    };
    const status = statusByCode[code] || 500;
    console.error("[health-score]", error);
    sendJson(res, status, {
      error: error?.message || "Falha ao calcular Health Score.",
      code,
    });
  }
}
