import { businessDataConfig } from "../business-data/config.mjs";
import { reportingRunQuerySuffix, SMOKE_REFERENCE_DATE_CUTOFF } from "../business-data/reporting-filters.mjs";
import { bdSelect } from "../business-data/rest.mjs";
import { stableClientRef } from "./snapshot-store.mjs";
import { getN8nOrchestrationMeta } from "./n8n-orchestration-meta.mjs";
import { getGithubActionsMonitoringStatus } from "./github-actions-meta.mjs";
import { describeBusinessDataPersistence } from "./business-data-status.mjs";

export async function listReportingRunIds({ limit = 24 } = {}) {
  const q = `select=run_id&${reportingRunQuerySuffix()}&order=reference_date.desc&limit=${limit}`;
  const runs = await bdSelect("pipeline_runs", { query: q });
  return (runs || []).map((r) => r.run_id);
}

export function businessHistoryAvailable() {
  return businessDataConfig().ready;
}

export async function listPersistedRuns({ limit = 12 } = {}) {
  if (!businessHistoryAvailable()) return { ok: false, reason: "not_configured", runs: [] };
  const q = `select=run_id,reference_date,status,client_count,snapshot_rows,issue_rows,freeze_rows,started_at,finished_at,n8n_execution_id,pipeline_version,version_fingerprint&${reportingRunQuerySuffix()}&order=reference_date.desc&limit=${limit}`;
  const runs = await bdSelect("pipeline_runs", { query: q });
  const failedQ = `select=run_id,reference_date,status,finished_at,errors&status=in.(failed,running,partial)&reference_date=lt.${SMOKE_REFERENCE_DATE_CUTOFF}&order=finished_at.desc&limit=5`;
  const recentFailures = await bdSelect("pipeline_runs", { query: failedQ }).catch(() => []);
  return { ok: true, runs: runs || [], recentFailures: recentFailures || [] };
}

export async function listSnapshotTrend({ population = "ativos", limit = 24 } = {}) {
  if (!businessHistoryAvailable()) return [];
  const runIds = await listReportingRunIds({ limit });
  if (!runIds.length) return [];
  const inRuns = runIds.map((id) => encodeURIComponent(id)).join(",");
  const q = `select=reference_date,population&population=eq.${encodeURIComponent(population)}&reference_date=lt.${SMOKE_REFERENCE_DATE_CUTOFF}&run_id=in.(${inRuns})&order=reference_date.desc&limit=${limit * 2000}`;
  const rows = await bdSelect("client_snapshots", { query: q });
  const byDay = new Map();
  for (const r of rows || []) {
    const day = r.reference_date;
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }
  return [...byDay.entries()]
    .map(([dia, clientes]) => ({ dia, clientes, source: "business_data" }))
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .slice(-limit);
}

export async function getClientSnapshotHistory(clientId, { limit = 24 } = {}) {
  if (!businessHistoryAvailable()) return { ok: false, reason: "not_configured", points: [] };
  const clientRef = stableClientRef(clientId);
  const runIds = await listReportingRunIds({ limit: 48 });
  if (!runIds.length) {
    return { ok: true, clientRef, points: [], reason: "no_reporting_runs" };
  }
  const inRuns = runIds.map((id) => encodeURIComponent(id)).join(",");
  const q = `client_ref=eq.${encodeURIComponent(clientRef)}&reference_date=lt.${SMOKE_REFERENCE_DATE_CUTOFF}&run_id=in.(${inRuns})&select=reference_date,health_score,engagement_score,mechanism_score,final_class,profile_code,quality_code&order=reference_date.desc&limit=${limit}`;
  const rows = await bdSelect("client_snapshots", { query: q });
  return {
    ok: true,
    clientRef,
    points: (rows || []).reverse().map((r) => ({
      dia: r.reference_date,
      hs: r.health_score,
      e: r.engagement_score,
      m: r.mechanism_score,
      classe: r.final_class,
      perfil: r.profile_code,
      qualidade: r.quality_code,
    })),
  };
}

export async function listProspectiveFreezes({ limit = 12 } = {}) {
  if (!businessHistoryAvailable()) return [];
  const q = `select=freeze_id,reference_month,reference_date,population,row_count,horizon_days,maturation_date,integrity_hash,transform_version&order=reference_month.desc&limit=${limit}`;
  return bdSelect("prospective_freezes", { query: q });
}

export async function getMonitoringHistoryBundle() {
  const configured = businessHistoryAvailable();
  if (!configured) {
    const persistence = describeBusinessDataPersistence({ configured: false });
    return {
      ok: false,
      source: "business_data",
      error: "Business Data não configurado para leitura (service role ausente).",
      runs: [],
      trend: [],
      freezes: [],
      persistence,
    };
  }
  try {
    const [runsRes, trend, freezes] = await Promise.all([
      listPersistedRuns(),
      listSnapshotTrend(),
      listProspectiveFreezes(),
    ]);
    const lastRun = runsRes.runs?.[0] || null;
    const lastValidRun = lastRun
      ? {
          referenceDate: lastRun.reference_date,
          status: lastRun.status,
          clientCount: lastRun.client_count,
          snapshotRows: lastRun.snapshot_rows,
          finishedAt: lastRun.finished_at,
          n8nExecutionId: lastRun.n8n_execution_id,
        }
      : null;
    let trendOut = trend;
    const snapshotRows = lastValidRun?.snapshotRows ?? 0;
    if (!trendOut.length && lastValidRun?.referenceDate && snapshotRows > 0) {
      trendOut = [
        {
          dia: lastValidRun.referenceDate,
          clientes: lastValidRun.clientCount || snapshotRows,
          source: "business_data",
        },
      ];
    }
    const distinctDays = trendOut.length;
    const orchestration = getN8nOrchestrationMeta();
    const historyCore = {
      ok: true,
      runs: runsRes.runs,
      recentFailures: runsRes.recentFailures,
      lastValidRun,
    };
    const githubActions = await getGithubActionsMonitoringStatus(historyCore);
    const persistence = describeBusinessDataPersistence({
      configured: true,
      ok: true,
      runs: runsRes.runs,
      trend,
      freezes,
      lastValidRun,
    });
    return {
      ok: true,
      source: "business_data",
      checkedAt: new Date().toISOString(),
      runs: runsRes.runs,
      recentFailures: runsRes.recentFailures,
      trend: trendOut,
      freezes,
      distinctReferenceDays: distinctDays,
      snapshotCount: distinctDays || (snapshotRows > 0 ? 1 : 0),
      totalSnapshotRows: snapshotRows,
      canCompareTemporal: distinctDays >= 2,
      lastValidRun,
      orchestration,
      githubActions,
      persistence,
    };
  } catch (error) {
    const persistence = describeBusinessDataPersistence({
      configured: true,
      ok: false,
      error: error.message,
    });
    return {
      ok: false,
      source: "business_data",
      error: error.message,
      code: error.code || "BUSINESS_DATA_READ",
      runs: [],
      trend: [],
      freezes: [],
      persistence,
    };
  }
}
