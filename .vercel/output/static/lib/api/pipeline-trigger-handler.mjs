import { runMonitoringPipeline } from "../monitoring/pipeline.mjs";
import { buildPipelineRunApiResponse } from "./pipeline-run-response.mjs";

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function authorize(req) {
  const expected = process.env.MONITORING_PIPELINE_TOKEN?.trim();
  if (!expected) return { ok: false, code: "TOKEN_NOT_CONFIGURED" };
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : (req.headers["x-pipeline-token"] || "").trim();
  if (!token || token !== expected) return { ok: false, code: "UNAUTHORIZED" };
  return { ok: true };
}

let running = false;

export async function handlePipelineTriggerApi(req, res, url) {
  if (url.pathname.replace(/\/$/, "") !== "/api/monitoring/pipeline/run" || req.method !== "POST") {
    return false;
  }

  const auth = authorize(req);
  if (!auth.ok) {
    sendJson(res, auth.code === "TOKEN_NOT_CONFIGURED" ? 503 : 401, {
      error: auth.code === "TOKEN_NOT_CONFIGURED" ? "MONITORING_PIPELINE_TOKEN não configurado." : "Não autorizado.",
      code: auth.code,
    });
    return true;
  }

  if (running) {
    sendJson(res, 409, { error: "Pipeline já em execução.", code: "ALREADY_RUNNING" });
    return true;
  }

  running = true;
  const startedAt = new Date().toISOString();
  const n8nExecutionId = req.headers["x-n8n-execution-id"] || null;
  try {
    const body = req.method === "POST" && req.headers["content-length"]
      ? await new Promise((resolve) => {
          let data = "";
          req.on("data", (c) => { data += c; });
          req.on("end", () => {
            try {
              resolve(data ? JSON.parse(data) : {});
            } catch {
              resolve({});
            }
          });
        })
      : {};

    const result = await runMonitoringPipeline({
      referenceDate: body.referenceDate,
      force: Boolean(body.force),
      persistBusinessData: body.persistBusinessData !== false,
      n8nExecutionId,
      probeStorage: false,
    });
    const finishedAt = new Date().toISOString();
    const resultWithBd = {
      ...result,
      businessData: result.businessData ?? result.run?.businessData ?? null,
    };
    sendJson(res, 200, buildPipelineRunApiResponse({ result: resultWithBd, startedAt, finishedAt }));
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error.message,
      code: error.code || "PIPELINE_FAILED",
    });
  } finally {
    running = false;
  }
  return true;
}
