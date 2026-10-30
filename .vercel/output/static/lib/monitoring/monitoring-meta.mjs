import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { listSnapshots, loadLatestComparable } from "./snapshot-store.mjs";
import { listRunLogs } from "./run-log.mjs";
import { buildPersistenceDashboard } from "./persistence-status.mjs";
import { auditMonitoringEnvironment, sanitizeEnvironmentForApi } from "./storage-backend.mjs";
import { businessDataConfig } from "../business-data/config.mjs";
import { getMonitoringHistoryBundle } from "./business-data-read.mjs";
import { getN8nOrchestrationMeta } from "./n8n-orchestration-meta.mjs";
import { getGithubActionsMonitoringStatus } from "./github-actions-meta.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "research", "monitoring", "output");

function readJson(name) {
  const path = join(OUT, name);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export async function getMonitoringMeta() {
  const audit = await auditMonitoringEnvironment({ probeRemote: false });
  const { current, previous } = loadLatestComparable("ativos");
  const snapshots = listSnapshots();
  const bdCfg = businessDataConfig();
  const businessHistory = bdCfg.ready ? await getMonitoringHistoryBundle() : { ok: false, reason: "not_configured" };
  const githubActions = await getGithubActionsMonitoringStatus();
  const bdTrend = businessHistory.ok ? businessHistory.trend : [];
  const snapshotCount = businessHistory.ok ? bdTrend.length : snapshots.length;
  const canCompareBd = businessHistory.ok ? businessHistory.canCompareTemporal : false;
  return {
    version: "monitoring-meta-v2",
    businessData: {
      configured: bdCfg.ready,
      projectRef: bdCfg.projectRef,
      schema: bdCfg.schema,
      history: businessHistory.ok ? { runs: businessHistory.runs?.length || 0, trendPoints: bdTrend.length } : null,
      error: businessHistory.ok ? null : businessHistory.error || businessHistory.reason,
    },
    snapshots: {
      count: snapshotCount,
      latest: businessHistory.ok ? businessHistory.runs?.[0] : snapshots[0] || null,
      canCompareTemporal: businessHistory.ok
        ? canCompareBd
        : Boolean(current && previous && current.referenceDay !== previous.referenceDay),
      message:
        snapshotCount < 2
          ? "Aguardando novos snapshots para comparação temporal."
          : null,
      source: businessHistory.ok ? "business_data" : "local_files",
    },
    runs: listRunLogs(8),
    persistence: buildPersistenceDashboard(audit),
    environment: sanitizeEnvironmentForApi(audit),
    files: {
      portfolio: Boolean(readJson("portfolio_quality_report.json")),
      diagnostics: Boolean(readJson("managerial_diagnostics.json")),
      envAudit: Boolean(readJson("ENV_AUDIT_ETAPA11.json")),
    },
    regenerate: "npm run monitoring:pipeline",
    notBaseQvError: "Ausência de snapshots locais não indica falha na BASE QV.",
    orchestration: getN8nOrchestrationMeta(),
    githubActions,
  };
}
