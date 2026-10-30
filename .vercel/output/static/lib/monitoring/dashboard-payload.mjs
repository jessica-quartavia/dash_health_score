import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { auditProfileSegment } from "../hs2a-diagnostics.mjs";
import { PROFILE_LABELS } from "../hs2a-interpretation.mjs";
import { listSnapshots, loadLatestComparable } from "./snapshot-store.mjs";
import { compareSnapshots, coverageTrendFromManifest } from "./snapshot-diff.mjs";
import { buildIssueRecords, aggregateIssuesByCategory } from "./issue-registry.mjs";
import { buildTrackingIndicators, segmentQualityBreakdown } from "./tracking-indicators.mjs";
import { detectMonitoringEnvironment, sanitizeEnvironmentForApi } from "./storage-backend.mjs";
import { listRunLogs } from "./run-log.mjs";
import { buildPersistenceDashboard } from "./persistence-status.mjs";

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

export function buildMonitoringDashboard(clients, { clusterLabel = "recorte atual", audit = null } = {}) {
  const quality = buildTrackingIndicators(clients, { denominatorLabel: clusterLabel });
  const perfis = Object.keys(PROFILE_LABELS)
    .map((code) => auditProfileSegment(clients, code))
    .filter(Boolean);
  const snapshotsListed = listSnapshots();
  const { current, previous, warning } = loadLatestComparable("ativos");
  const temporal =
    current && previous ? compareSnapshots(current, previous) : { comparable: false, reason: "snapshots_insuficientes" };
  if (warning) temporal.warning = warning;
  if (!temporal.comparable) {
    if (snapshotsListed.length === 1) {
      temporal.reason = "Aguardando novos snapshots para comparação temporal.";
    } else if (snapshotsListed.length === 0) {
      temporal.reason =
        "Nenhum snapshot local registrado. Regere com npm run monitoring:pipeline — isso não indica falha na BASE QV.";
    }
  }

  const issues = buildIssueRecords(clients);
  const byProgram = segmentQualityBreakdown(clients, "program");
  const byEp = segmentQualityBreakdown(clients, "engineer");
  const env = detectMonitoringEnvironment();
  const fileAudit = audit || readJson("ENV_AUDIT_ETAPA11.json");
  const persistence = buildPersistenceDashboard(fileAudit || { persistence: { centralizedValidated: false }, vars: {} });
  const lastRun = readJson("pipeline_last_run.json");

  const executive = {
    clientes: clients.length,
    diagnosticos: issues.length,
    ultimoPipeline: lastRun?.run?.finishedAt || lastRun?.run?.startedAt || null,
    ultimoSnapshot: listSnapshots()[0]?.referenceDay || null,
    automacao: {
      permitida: env.schedule.allowed,
      modo: env.schedule.mode,
      destinoDuravel: env.durableDestination.configured,
    },
    temporalResumo: temporal.comparable
      ? {
          novosProblemas: temporal.mudancas?.inconsistencias_novas,
          resolvidos: temporal.mudancas?.inconsistencias_resolvidas,
          entradas: temporal.fluxo_carteira?.entradas,
          saidas: temporal.fluxo_carteira?.saidas,
        }
      : null,
    persistencia: persistence,
  };

  return {
    version: "etapa11-dashboard-v1",
    generatedAt: new Date().toISOString(),
    executive,
    fromFile: {
      portfolio: readJson("portfolio_quality_report.json"),
      temporal: readJson("temporal_comparison_report.json"),
      diagnostics: readJson("managerial_diagnostics.json"),
      tracking: readJson("tracking_indicators.json"),
      envAudit: fileAudit ? { checkedAt: fileAudit.checkedAt, comprovada: fileAudit.persistence?.comprovada } : null,
    },
    live: {
      denominador: quality.denominador,
      indicadores: quality.indicadores,
      principais_problemas: quality.principais_problemas,
      issuesByCategory: aggregateIssuesByCategory(issues),
      diagnosticsPreview: issues.slice(0, 500),
      perfisResumo: perfis.map((p) => ({ perfil: p.label, clientes: p.clientes, hs_mediana: p.hs.mediana })),
      byProgram,
      byEp,
      snapshots: snapshotsListed.slice(0, 12),
      trend: coverageTrendFromManifest(snapshotsListed),
      temporal,
      runLog: listRunLogs(5),
      environment: sanitizeEnvironmentForApi(fileAudit || env),
      persistence,
    },
    separacao: quality.separacao,
    meta: {
      snapshotCount: snapshotsListed.length,
      canCompareTemporal: Boolean(current && previous && current.referenceDay !== previous.referenceDay),
      notBaseQvNote: "Ausência ou atraso de snapshots locais não indica falha de conexão com a BASE QV.",
    },
  };
}

export function problemsExportRows(clients) {
  return buildIssueRecords(clients).map((r) => ({
    codigo: r.clientCode,
    programa: r.programa,
    ep: r.ep,
    categoria: r.categoria,
    tipo: r.tipo,
    campo: r.campo,
    fonte: r.fonte,
    evidencia: r.evidencia,
    prioridade: r.prioridade,
    causa_provavel: r.causaProvavel,
    acao_recomendada: r.acaoRecomendada,
    identificado_em: r.identificadoEm,
    perfil: r.perfil,
  }));
}
