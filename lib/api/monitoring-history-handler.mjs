import { getMonitoringHistoryBundle, getClientSnapshotHistory } from "../monitoring/business-data-read.mjs";

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export async function handleMonitoringHistoryApi(req, res, url) {
  const path = url.pathname.replace(/\/$/, "");

  if (path === "/api/monitoring-history" && req.method === "GET") {
    const bundle = await getMonitoringHistoryBundle();
    sendJson(res, bundle.ok ? 200 : 503, bundle);
    return true;
  }

  if (path === "/api/client-snapshot-history" && req.method === "GET") {
    const clientId = url.searchParams.get("clientId");
    if (!clientId) {
      sendJson(res, 400, { ok: false, error: "clientId obrigatório" });
      return true;
    }
    const hist = await getClientSnapshotHistory(clientId);
    sendJson(res, hist.ok ? 200 : 503, hist);
    return true;
  }

  return false;
}
