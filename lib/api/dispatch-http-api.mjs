/**
 * Roteamento HTTP /api/* — dev-server local e Vercel Functions.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { publicEnvStatus } from "../env.mjs";
import { probeDataRead } from "../data/supabase-rest.mjs";
import { handleHealthScoreApi } from "./health-score-handler.mjs";
import { handleMonitoringApi } from "./monitoring-handler.mjs";
import { handleMonitoringHistoryApi } from "./monitoring-history-handler.mjs";
import { handlePipelineTriggerApi } from "./pipeline-trigger-handler.mjs";
import { handleResearchBundleApi } from "./research-handler.mjs";
import { handleResearchPanoramaApi } from "./research-panorama-handler.mjs";
import { handleSystemStatusApi } from "./system-status-handler.mjs";
import { loadResearchArtifacts } from "../research/artifact-loader.mjs";
import { sendApiNotFound, serveJsonArtifactFile } from "./json-artifact.mjs";
import { handlePredictiveLabReferenceApi } from "./predictive-lab-reference-handler.mjs";
import {
  isSensitiveDashboardRoute,
  shouldRequireCorporateAuth,
  verifyCorporateAccess,
} from "./corporate-access.mjs";
import { handleAuthConfigApi, handleAuthMeApi, handleAuthPolicyApi } from "./auth-handlers.mjs";

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

export function normalizeApiPath(pathname) {
  const base = String(pathname || "/");
  if (base.length > 1 && base.endsWith("/")) return base.slice(0, -1);
  return base;
}

/** Resolve /api/* a partir de req.url (Vercel) ou req.query.path (catch-all). */
export function resolveApiPathFromRequest(req) {
  const rawUrl = String(req?.url || "").trim();
  if (rawUrl) {
    try {
      const pathname = new URL(rawUrl, "http://vercel.local").pathname;
      if (pathname === "/api" || pathname.startsWith("/api/")) {
        return normalizeApiPath(pathname);
      }
    } catch {
      const pathname = rawUrl.split("?")[0];
      if (pathname === "/api" || pathname.startsWith("/api/")) {
        return normalizeApiPath(pathname);
      }
    }
  }

  const segments = req?.query?.path;
  const parts = Array.isArray(segments)
    ? segments.map(String)
    : segments != null && segments !== ""
      ? [String(segments)]
      : [];
  return normalizeApiPath(`/api/${parts.join("/")}`);
}

/**
 * @returns {Promise<boolean>} true se a rota foi tratada (ou resposta enviada)
 */
export async function dispatchHttpApi({ apiPath, req, res, url, root }) {
  const ROOT = root;
  const path = normalizeApiPath(apiPath);

  // /api/auth/* é reservado na Vercel — usar /api/session/*
  if (path === "/api/session/policy") {
    handleAuthPolicyApi(req, res);
    return true;
  }
  if (path === "/api/session/config") {
    handleAuthConfigApi(req, res);
    return true;
  }
  if (path === "/api/session/me") {
    await handleAuthMeApi(req, res);
    return true;
  }

  if (shouldRequireCorporateAuth() && isSensitiveDashboardRoute(path)) {
    const auth = await verifyCorporateAccess(req);
    if (!auth.ok) {
      console.warn("[api] corporate-access", path, auth.code);
      sendJson(res, 401, { ok: false, error: auth.message, code: auth.code });
      return true;
    }
  }

  if (path === "/api/config-status") {
    const status = publicEnvStatus();
    if (url.searchParams.get("probe") !== "1") {
      sendJson(res, status.ready ? 200 : 503, status);
      return true;
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
    return true;
  }

  if (path === "/api/research-bundle") {
    handleResearchBundleApi(req, res);
    return true;
  }

  if (path === "/api/research-panorama") {
    try {
      handleResearchPanoramaApi(req, res, url);
    } catch (error) {
      console.error("[api] research-panorama", error);
      if (!res.headersSent) sendJson(res, 500, { error: error.message });
    }
    return true;
  }

  if (path === "/api/system-status") {
    try {
      await handleSystemStatusApi(req, res);
    } catch (error) {
      console.error("[api] system-status", error);
      if (!res.headersSent) sendJson(res, 500, { error: error.message });
    }
    return true;
  }

  if (
    path === "/api/monitoring-history" ||
    path === "/api/client-snapshot-history" ||
    path === "/api/portfolio-evolution-summary"
  ) {
    try {
      const handled = await handleMonitoringHistoryApi(req, res, url);
      if (handled) return true;
    } catch (error) {
      console.error("[api] monitoring-history", error);
      if (!res.headersSent) sendJson(res, 500, { error: error.message, code: "INTERNAL" });
    }
    return true;
  }

  if (path === "/api/monitoring/pipeline/run") {
    try {
      const handled = await handlePipelineTriggerApi(req, res, url);
      if (handled) return true;
    } catch (error) {
      console.error("[api] pipeline trigger", error);
      if (!res.headersSent) sendJson(res, 500, { error: error.message, code: "INTERNAL" });
    }
    return true;
  }

  if (path === "/api/monitoring-summary" || path === "/api/monitoring-problems.csv" || path === "/api/monitoring-meta") {
    try {
      const handled = await handleMonitoringApi(req, res, url);
      if (handled) return true;
    } catch (error) {
      console.error("[api] monitoring", error);
      if (!res.headersSent) sendJson(res, 500, { error: "Falha interna.", code: "INTERNAL" });
    }
    return true;
  }

  if (path === "/api/health-score" || path === "/api/health-score.csv" || path.startsWith("/api/health-score/")) {
    try {
      await handleHealthScoreApi(req, res);
    } catch (error) {
      console.error("[api] health-score", error);
      if (!res.headersSent) sendJson(res, 500, { error: "Falha interna.", code: "INTERNAL" });
    }
    return true;
  }

  if (path === "/api/health") {
    sendJson(res, 200, { ok: true, service: "dashboard-health-score-clientes" });
    return true;
  }

  const jsonFile = (rel, missing) => {
    const file = join(ROOT, rel);
    if (!existsSync(file)) {
      sendJson(res, 404, missing || { error: `${rel} ausente.` });
      return true;
    }
    send(res, 200, readFileSync(file, "utf8"), {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    return true;
  };

  if (path === "/api/etapa7-results") {
    return jsonFile("research/modeling/output/etapa7_manifest.json", {
      error: "Laboratório HS 2.0 ainda não calculado.",
      hint: "npm run model:etapa7",
    });
  }
  if (path === "/api/etapa7-comparison") {
    return jsonFile("research/modeling/output/hs2_comparison.json", {
      error: "Comparação HS2 ausente.",
      hint: "npm run model:etapa7",
    });
  }
  if (path === "/api/etapa6-results") {
    return jsonFile("research/modeling/output/etapa6_manifest.json", {
      error: "Etapa 6 ainda não calculada.",
      hint: "npm run model:etapa6",
    });
  }
  if (path === "/api/robustness-results") {
    return jsonFile("research/modeling/output/robustness_results.json", {
      error: "Robustez ainda não calculada.",
      hint: "npm run model:robustness",
    });
  }
  if (path === "/api/modeling-results-etapa4") {
    return jsonFile("research/modeling/output/modeling_results_etapa4.json", {
      error: "modeling_results_etapa4.json ausente.",
    });
  }
  if (path === "/api/predictive-study-v15") {
    serveJsonArtifactFile(res, join(ROOT, "research", "modeling", "output", "predictive_study_v15.json"), {
      missingBody: { ok: false, status: "missing", error: "predictive_study_v15.json ausente.", hint: "npm run model:study-v15" },
    });
    return true;
  }
  if (path === "/api/predictive-lab-reference") {
    handlePredictiveLabReferenceApi(req, res);
    return true;
  }
  if (path === "/api/predictive-study-v16") {
    serveJsonArtifactFile(res, join(ROOT, "research", "modeling", "output", "predictive_study_v16.json"), {
      missingBody: { ok: false, status: "missing", error: "predictive_study_v16.json ausente.", hint: "npm run model:study-v16" },
    });
    return true;
  }
  if (path === "/api/predictive-study-v17") {
    serveJsonArtifactFile(res, join(ROOT, "research", "modeling", "output", "predictive_study_v17.json"), {
      missingBody: { ok: false, status: "missing", error: "predictive_study_v17.json ausente.", hint: "npm run model:study-v17" },
    });
    return true;
  }
  if (path === "/api/predictive-study-v2") {
    serveJsonArtifactFile(res, join(ROOT, "research", "modeling", "output", "predictive_study_v2.json"), {
      missingBody: { ok: false, status: "missing", error: "predictive_study_v2.json ausente.", hint: "npm run model:study-v2" },
    });
    return true;
  }
  if (path === "/api/pre-audit") {
    return jsonFile("research/modeling/output/pre_audit.json", { error: "pre_audit.json ausente." });
  }
  if (path === "/api/modeling-results") {
    return jsonFile("research/modeling/output/modeling_results.json", {
      error: "Experimentos ainda não executados.",
      hint: "npm run model:all (após build:predictive-validated)",
    });
  }

  if (path === "/api/predictive-readiness") {
    const file = join(ROOT, "exports", "predictive-study", "predictive_readiness.json");
    if (existsSync(file)) {
      send(res, 200, readFileSync(file, "utf8"), {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      return true;
    }
    const bundle = loadResearchArtifacts();
    if (bundle.data?.predictiveReadiness) {
      sendJson(res, 200, bundle.data.predictiveReadiness);
      return true;
    }
    sendJson(res, 404, {
      error: "Base validada ainda não gerada neste ambiente.",
      hint: "Execute npm run build:predictive-validated",
    });
    return true;
  }

  if (path === "/api" || path.startsWith("/api/")) {
    sendApiNotFound(res, path);
    return true;
  }

  return false;
}
