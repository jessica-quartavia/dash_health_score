import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildResearchPanorama } from "../research/panorama-aggregates.mjs";
import { probePanoramaArtifacts, reasonMessage } from "../research/panorama-artifacts.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, max-age=120",
  });
  res.end(JSON.stringify(body));
}

export function handleResearchPanoramaApi(req, res, url) {
  if (req.method !== "GET") {
    sendJson(res, 405, {
      status: "error",
      error: "Method not allowed",
      descriptiveAvailability: { ok: false, reason: "http_error", message: reasonMessage("http_error") },
    });
    return true;
  }
  const t0 = performance.now();
  const artifacts = probePanoramaArtifacts(ROOT);
  try {
    const query = Object.fromEntries(url.searchParams.entries());
    const body = buildResearchPanorama(query, { root: ROOT, artifactsProbe: artifacts });
    const processingMs = Math.round(performance.now() - t0);
    const av = body.descriptiveAvailability || {};
    let status = "ok";
    if (av.ok === false) status = "unavailable";
    else if (av.ok === "partial") status = "partial";
    sendJson(res, 200, {
      ...body,
      status,
      processingMs,
      artifacts,
      modelsAvailable: Boolean(body.models?.length),
    });
  } catch (error) {
    const processingMs = Math.round(performance.now() - t0);
    console.error("[research-panorama]", error);
    sendJson(res, 500, {
      status: "error",
      version: "panorama-v1",
      error: error.message || "processing_error",
      descriptiveAvailability: {
        ok: false,
        reason: "processing_error",
        message: reasonMessage("processing_error"),
        detail: error.message,
      },
      artifacts,
      processingMs,
      modelsAvailable: artifacts.entries?.modeling?.present || artifacts.entries?.modelingFallback?.present,
      hint: "Verifique logs do servidor. Se faltar CSV: npm run build:predictive-validated (requer .env BASE QV e .pseudonym-secret estável).",
    });
  }
  return true;
}
