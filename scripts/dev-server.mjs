import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describeEnvStatus, loadProjectEnv } from "../lib/load-env.mjs";

loadProjectEnv();
import { publicEnvStatus } from "../lib/env.mjs";
import { probeDataRead } from "../lib/data/supabase-rest.mjs";
import { handleHealthScoreApi } from "../lib/api/health-score-handler.mjs";
import { handleMonitoringApi } from "../lib/api/monitoring-handler.mjs";
import { handleMonitoringHistoryApi } from "../lib/api/monitoring-history-handler.mjs";
import { handlePipelineTriggerApi } from "../lib/api/pipeline-trigger-handler.mjs";
import { handleResearchBundleApi } from "../lib/api/research-handler.mjs";
import { handleResearchPanoramaApi } from "../lib/api/research-panorama-handler.mjs";
import { handleSystemStatusApi } from "../lib/api/system-status-handler.mjs";
import { loadResearchArtifacts } from "../lib/research/artifact-loader.mjs";
import { sendApiNotFound, serveJsonArtifactFile } from "../lib/api/json-artifact.mjs";
import { handlePredictiveLabReferenceApi } from "../lib/api/predictive-lab-reference-handler.mjs";

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

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const apiPath = normalizeApiPath(url.pathname);

  if (apiPath === "/api/config-status") {
    const status = publicEnvStatus();
    if (url.searchParams.get("probe") !== "1") {
      sendJson(res, status.ready ? 200 : 503, status);
      return;
    }
    try {
      const probe = await probeDataRead();
      sendJson(res, 200, { ...status, probe });
    } catch (error) {
      sendJson(res, 503, {
        ...status,
        probe: {
          ok: false,
          code: error?.code || "DATA_CONNECTION",
          message: error?.message || "Falha de conexão com a BASE QV.",
        },
      });
    }
    return;
  }

  if (apiPath === "/api/research-bundle") {
    handleResearchBundleApi(req, res);
    return;
  }

  if (apiPath === "/api/research-panorama") {
    try {
      handleResearchPanoramaApi(req, res, url);
    } catch (error) {
      console.error("[dev] research-panorama", error);
      if (!res.headersSent) sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (apiPath === "/api/system-status") {
    try {
      await handleSystemStatusApi(req, res);
    } catch (error) {
      console.error("[dev] system-status", error);
      if (!res.headersSent) sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (
    apiPath === "/api/monitoring-history" ||
    apiPath === "/api/client-snapshot-history" ||
    apiPath === "/api/portfolio-evolution-summary"
  ) {
    try {
      const handled = await handleMonitoringHistoryApi(req, res, url);
      if (handled) return;
    } catch (error) {
      console.error("[dev] monitoring-history", error);
      if (!res.headersSent) sendJson(res, 500, { error: error.message, code: "INTERNAL" });
    }
    return;
  }

  if (apiPath === "/api/monitoring/pipeline/run") {
    try {
      const handled = await handlePipelineTriggerApi(req, res, url);
      if (handled) return;
    } catch (error) {
      console.error("[dev] pipeline trigger", error);
      if (!res.headersSent) sendJson(res, 500, { error: error.message, code: "INTERNAL" });
    }
    return;
  }

  if (apiPath === "/api/monitoring-summary" || apiPath === "/api/monitoring-problems.csv" || apiPath === "/api/monitoring-meta") {
    try {
      const handled = await handleMonitoringApi(req, res, url);
      if (handled) return;
    } catch (error) {
      console.error("[dev] monitoring", error);
      if (!res.headersSent) sendJson(res, 500, { error: "Falha interna.", code: "INTERNAL" });
    }
    return;
  }

  if (apiPath === "/api/health-score" || apiPath === "/api/health-score.csv" || apiPath.startsWith("/api/health-score/")) {
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

  if (apiPath === "/api/etapa7-results") {
    const file = join(ROOT, "research", "modeling", "output", "etapa7_manifest.json");
    if (!existsSync(file)) {
      sendJson(res, 404, {
        error: "Laboratório HS 2.0 ainda não calculado.",
        hint: "npm run model:etapa7",
      });
      return;
    }
    send(res, 200, readFileSync(file, "utf8"), {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    return;
  }

  if (apiPath === "/api/etapa7-comparison") {
    const file = join(ROOT, "research", "modeling", "output", "hs2_comparison.json");
    if (!existsSync(file)) {
      sendJson(res, 404, { error: "Comparação HS2 ausente.", hint: "npm run model:etapa7" });
      return;
    }
    send(res, 200, readFileSync(file, "utf8"), {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    return;
  }

  if (apiPath === "/api/etapa6-results") {
    const file = join(ROOT, "research", "modeling", "output", "etapa6_manifest.json");
    if (!existsSync(file)) {
      sendJson(res, 404, {
        error: "Etapa 6 ainda não calculada.",
        hint: "npm run model:etapa6",
      });
      return;
    }
    send(res, 200, readFileSync(file, "utf8"), {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    return;
  }

  if (apiPath === "/api/robustness-results") {
    const file = join(ROOT, "research", "modeling", "output", "robustness_results.json");
    if (!existsSync(file)) {
      sendJson(res, 404, {
        error: "Robustez ainda não calculada.",
        hint: "npm run model:robustness",
      });
      return;
    }
    send(res, 200, readFileSync(file, "utf8"), {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    return;
  }

  if (apiPath === "/api/modeling-results-etapa4") {
    const file = join(ROOT, "research", "modeling", "output", "modeling_results_etapa4.json");
    if (!existsSync(file)) {
      sendJson(res, 404, { error: "modeling_results_etapa4.json ausente." });
      return;
    }
    send(res, 200, readFileSync(file, "utf8"), {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    return;
  }

  if (apiPath === "/api/predictive-study-v15") {
    serveJsonArtifactFile(res, join(ROOT, "research", "modeling", "output", "predictive_study_v15.json"), {
      missingBody: { ok: false, status: "missing", error: "predictive_study_v15.json ausente.", hint: "npm run model:study-v15" },
    });
    return;
  }

  if (apiPath === "/api/predictive-lab-reference") {
    handlePredictiveLabReferenceApi(req, res);
    return;
  }

  if (apiPath === "/api/predictive-study-v16") {
    serveJsonArtifactFile(res, join(ROOT, "research", "modeling", "output", "predictive_study_v16.json"), {
      missingBody: { ok: false, status: "missing", error: "predictive_study_v16.json ausente.", hint: "npm run model:study-v16" },
    });
    return;
  }

  if (apiPath === "/api/predictive-study-v17") {
    serveJsonArtifactFile(res, join(ROOT, "research", "modeling", "output", "predictive_study_v17.json"), {
      missingBody: { ok: false, status: "missing", error: "predictive_study_v17.json ausente.", hint: "npm run model:study-v17" },
    });
    return;
  }

  if (apiPath === "/api/predictive-study-v2") {
    serveJsonArtifactFile(res, join(ROOT, "research", "modeling", "output", "predictive_study_v2.json"), {
      missingBody: { ok: false, status: "missing", error: "predictive_study_v2.json ausente.", hint: "npm run model:study-v2" },
    });
    return;
  }

  if (apiPath === "/api/pre-audit") {
    const file = join(ROOT, "research", "modeling", "output", "pre_audit.json");
    if (!existsSync(file)) {
      sendJson(res, 404, { error: "pre_audit.json ausente." });
      return;
    }
    send(res, 200, readFileSync(file, "utf8"), {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    return;
  }

  if (apiPath === "/api/modeling-results") {
    const file = join(ROOT, "research", "modeling", "output", "modeling_results.json");
    if (!existsSync(file)) {
      sendJson(res, 404, {
        error: "Experimentos ainda não executados.",
        hint: "npm run model:all (após build:predictive-validated)",
      });
      return;
    }
    send(res, 200, readFileSync(file, "utf8"), {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    return;
  }

  if (apiPath === "/api/predictive-readiness") {
    const file = join(ROOT, "exports", "predictive-study", "predictive_readiness.json");
    if (existsSync(file)) {
      send(res, 200, readFileSync(file, "utf8"), {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return;
    }
    const bundle = loadResearchArtifacts();
    if (bundle.data?.predictiveReadiness) {
      sendJson(res, 200, bundle.data.predictiveReadiness);
      return;
    }
    sendJson(res, 404, {
      error: "Base validada ainda não gerada neste ambiente.",
      hint: "Execute npm run build:predictive-validated",
    });
    return;
  }

  if (apiPath.startsWith("/api/")) {
    sendApiNotFound(res, apiPath);
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
