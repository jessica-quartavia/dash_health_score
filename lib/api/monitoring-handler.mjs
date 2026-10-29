import { getMonitoringSummary, getMonitoringProblemsCsv } from "../service.mjs";
import { getMonitoringMeta } from "../monitoring/monitoring-meta.mjs";

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export async function handleMonitoringApi(req, res, url) {
  const path = url.pathname.replace(/\/$/, "");

  if (path === "/api/monitoring-problems.csv" && req.method === "GET") {
    try {
      const { filename, csv } = await getMonitoringProblemsCsv(Object.fromEntries(url.searchParams));
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      });
      res.end(csv);
    } catch (error) {
      sendJson(res, error?.code === "DATA_CONNECTION" ? 503 : 500, {
        error: error?.message || "Falha ao exportar.",
        code: error?.code || "INTERNAL",
      });
    }
    return true;
  }

  if (path === "/api/monitoring-meta" && req.method === "GET") {
    try {
      const body = await getMonitoringMeta();
      sendJson(res, 200, body);
    } catch (error) {
      sendJson(res, 500, {
        error: error?.message || "Falha ao carregar metadados de monitoramento.",
        code: error?.code || "INTERNAL",
      });
    }
    return true;
  }

  if (path === "/api/monitoring-summary" && req.method === "GET") {
    try {
      const body = await getMonitoringSummary(Object.fromEntries(url.searchParams));
      sendJson(res, 200, body);
    } catch (error) {
      sendJson(res, error?.code === "DATA_CONNECTION" ? 503 : 500, {
        error: error?.message || "Falha ao carregar monitoramento.",
        code: error?.code || "INTERNAL",
      });
    }
    return true;
  }

  return false;
}
