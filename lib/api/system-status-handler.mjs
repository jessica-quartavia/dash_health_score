import { publicEnvStatus } from "../env.mjs";
import { getMonitoringMeta } from "../monitoring/monitoring-meta.mjs";
import { loadResearchArtifacts } from "../research/artifact-loader.mjs";
import { readJsonIfExists } from "../research/study-io.mjs";
import { buildSystemStatus } from "../platform/system-status.mjs";
import { getMonitoringHistoryBundle } from "../monitoring/business-data-read.mjs";

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export async function handleSystemStatusApi(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return true;
  }
  const env = publicEnvStatus();
  let meta = null;
  let bdSummary = { configured: false };
  try {
    meta = await getMonitoringMeta();
  } catch {
    meta = null;
  }
  try {
    const hist = await getMonitoringHistoryBundle();
    bdSummary = {
      configured: hist.source === "business_data" || Boolean(process.env.BUSINESS_SUPABASE_URL),
      ok: hist.ok,
      validRuns: (hist.runs || []).filter((r) => r.status === "success").length,
      lastReference: hist.lastValidRun?.referenceDate,
      error: hist.error,
    };
  } catch (error) {
    bdSummary = { configured: Boolean(process.env.BUSINESS_SUPABASE_URL), ok: false, error: error.message };
  }

  const bundle = loadResearchArtifacts();
  const weightStudy = readJsonIfExists("research/modeling/output/hs_weight_study.json")?.data;
  const hsFuture = readJsonIfExists("research/modeling/output/hs_future_feasibility.json")?.data;

  const body = buildSystemStatus({
    baseQv: { ready: env.ready, message: env.missing?.join(", ") },
    businessData: {
      configured: bdSummary.configured,
      ok: bdSummary.ok,
      validRuns: bdSummary.validRuns,
      lastReference: bdSummary.lastReference,
      error: bdSummary.error,
    },
    temporal: {
      comparable: meta?.snapshots?.comparable,
      snapshotCount: meta?.snapshots?.count,
      reason: meta?.snapshots?.message,
      de: meta?.snapshots?.comparison?.from,
      para: meta?.snapshots?.comparison?.to,
    },
    automation: {
      githubActions: meta?.githubActions,
      n8nConfigured: Boolean(meta?.orchestration?.workflowId),
    },
    research: { state: bundle.researchState },
    weightStudy: weightStudy
      ? {
          recommendation: weightStudy.recommendation?.decision,
          recommendationSummary: weightStudy.recommendation?.summaryPlain,
        }
      : {},
    hsFuture: hsFuture || {},
    warnings: meta?.environment?.warnings,
  });

  sendJson(res, 200, body);
  return true;
}
