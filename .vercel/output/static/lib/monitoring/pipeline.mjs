/**
 * Pipeline de monitoramento — Etapa 10 (BASE QV read-only).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getHealthScoreResponse } from "../service.mjs";
import { auditProfileSegment, buildQualityIndicators, PROFILE_RULES } from "../hs2a-diagnostics.mjs";
import { PROFILE_LABELS, HS2A_VERSION, OFFICIAL_FORMULA_VERSION } from "../hs2a-interpretation.mjs";
import {
  buildSnapshotRecords,
  writeSnapshot,
  listSnapshots,
  loadLatestComparable,
  verifySnapshotIntegrity,
  RETENTION_POLICY,
} from "./snapshot-store.mjs";
import { compareSnapshots, coverageTrendFromManifest } from "./snapshot-diff.mjs";
import { buildIssueRecords, aggregateIssuesByCategory } from "./issue-registry.mjs";
import { buildTrackingIndicators, segmentQualityBreakdown } from "./tracking-indicators.mjs";
import { buildProspectiveFreeze, writeProspectiveFreeze } from "./prospective-freeze.mjs";
import { detectMonitoringEnvironment, auditMonitoringEnvironment } from "./storage-backend.mjs";
import { persistPipelineBundle } from "./persistence.mjs";
import { persistMonitoringToBusinessData } from "./business-data-persist.mjs";
import { monitoringRoot } from "./storage-backend.mjs";
import { appendRunLog, startRunMeta, finishRunMeta } from "./run-log.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "research", "monitoring", "output");
const PROFILE_CODES = Object.keys(PROFILE_LABELS);

function parseReferenceDate(arg) {
  if (!arg) return new Date();
  const d = new Date(`${arg}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Data de referência inválida: ${arg}`);
  return d;
}

export async function runMonitoringPipeline(options = {}) {
  const audit = await auditMonitoringEnvironment({ probeRemote: Boolean(options.probeStorage) });
  const env = detectMonitoringEnvironment();
  env.persistenceValidated = audit.persistence.centralizedValidated;
  const referenceDate = parseReferenceDate(options.referenceDate);
  const referenceDay = referenceDate.toISOString().slice(0, 10);
  const force = Boolean(options.force);
  const skipData = Boolean(options.checkEnvOnly);

  let run = startRunMeta({
    referenceDay,
    scheduleMode: options.scheduleMode || env.schedule.mode,
    force,
  });

  if (skipData) {
    mkdirSync(OUT, { recursive: true });
    run = finishRunMeta(run, { status: "env_check", environment: env, audit: audit.publicSummary });
    appendRunLog(run);
    writeFileSync(join(OUT, "ENV_AUDIT_ETAPA11.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    return { run, environment: env, audit };
  }

  if (options.requireAutomation && !env.schedule.allowed) {
    const err = new Error("Automação não aprovada ou destino durável indisponível.");
    err.code = "AUTOMATION_BLOCKED";
    run = finishRunMeta(run, { status: "failed", errors: [err.message], environment: env });
    appendRunLog(run);
    throw err;
  }

  try {
    mkdirSync(OUT, { recursive: true });
    const payload = await getHealthScoreResponse({ cluster: "ativos" });
    const clients = payload.clients || [];
    run.clientCount = clients.length;

    const perfis = PROFILE_CODES.map((code) => auditProfileSegment(clients, code)).filter(Boolean);
    const quality = buildTrackingIndicators(clients, { denominatorLabel: "clientes ativos (cluster ativos)" });
    const issues = buildIssueRecords(clients, { identifiedAt: referenceDate });
    const issuesByCategory = aggregateIssuesByCategory(issues);
    const byProgram = segmentQualityBreakdown(clients, "program");
    const byEp = segmentQualityBreakdown(clients, "engineer");

    const snapshot = buildSnapshotRecords(clients, {
      referenceDate,
      population: "ativos",
      formulaVersion: OFFICIAL_FORMULA_VERSION,
      hs2aVersion: HS2A_VERSION,
      filters: payload.filters?.applied || {},
    });
    const snapResult = writeSnapshot(snapshot, { idempotent: true, force });
    run.snapshot = {
      skipped: snapResult.skipped,
      fileName: snapResult.fileName,
      integrity: snapResult.integrity,
    };

    if (snapResult.path && existsSync(snapResult.path)) {
      const loaded = JSON.parse(readFileSync(snapResult.path, "utf8"));
      run.snapshot.integrity = verifySnapshotIntegrity(loaded);
    }

    const sources = {
      clients: true,
      meetings: clients.some((c) => (c.totalMeetings || 0) > 0),
      mechanisms: clients.some((c) => (c.implementedCount || 0) > 0),
      nps: clients.some((c) => c.npsScore != null),
    };
    const freeze = buildProspectiveFreeze(clients, { referenceDate, population: "ativos", sources });
    const freezeResult = writeProspectiveFreeze(freeze, { idempotent: true, force });
    run.prospectiveFreeze = freezeResult;

    const { current, previous, warning } = loadLatestComparable("ativos");
    let temporal = previous && current ? compareSnapshots(current, previous) : { comparable: false, reason: "primeiro_snapshot_ou_incompativel" };
    if (warning) temporal.warning = warning;

    const portfolioReport = {
      version: "etapa10-v1",
      generatedAt: new Date().toISOString(),
      referenceDay,
      populacao: { cluster: "ativos", n: clients.length },
      regras_perfil: PROFILE_RULES,
      perfis,
      qualidade: quality,
      nota: "Sem inferência causal a partir das distribuições.",
    };

    writeFileSync(join(OUT, "portfolio_quality_report.json"), `${JSON.stringify(portfolioReport, null, 2)}\n`, "utf8");
    writeFileSync(
      join(OUT, "managerial_diagnostics.json"),
      `${JSON.stringify({ version: "etapa10-v1", total: issues.length, byCategory: issuesByCategory, items: issues.slice(0, 8000) }, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(OUT, "tracking_indicators.json"),
      `${JSON.stringify({ version: "etapa10-v1", quality, byProgram, byEp, temporal }, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(OUT, "temporal_comparison_report.json"),
      `${JSON.stringify({ version: "etapa10-v1", ...temporal, trend: coverageTrendFromManifest(listSnapshots()) }, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(OUT, "pipeline_last_run.json"),
      `${JSON.stringify({ version: "etapa10-v1", environment: env, run }, null, 2)}\n`,
      "utf8",
    );
    writeFileSync(
      join(OUT, "RELATORIO_ETAPA10.md"),
      `# Relatório Etapa 10\n\nGerado: ${run.finishedAt}\n\nClientes: ${clients.length}\n\nSnapshot: ${snapResult.skipped ? "idempotente" : "gravado"} (${snapResult.fileName || "—"})\n\nFreeze mensal: ${freezeResult.skipped ? "existente" : "gravado"}\n\nAutomação permitida: ${env.schedule.allowed}\n\nVer docs/MONITORING_ETAPA10.md\n`,
      "utf8",
    );

    const manifestPath = join(monitoringRoot(), "manifest.json");
    const runLogPath = join(monitoringRoot(), "runs", "run-log.json");
    const persistResult = await persistPipelineBundle({
      referenceDate,
      snapshotPath: snapResult.path,
      snapshotFileName: snapResult.fileName,
      freezePath: freezeResult.path,
      freezeFileName: freezeResult.path ? freezeResult.path.split(/[/\\]/).pop() : null,
      manifestPath,
      reportPaths: [
        join(OUT, "portfolio_quality_report.json"),
        join(OUT, "managerial_diagnostics.json"),
        join(OUT, "tracking_indicators.json"),
        join(OUT, "temporal_comparison_report.json"),
      ],
      runLogPath: existsSync(runLogPath) ? runLogPath : null,
      force,
    });
    run.persistence = persistResult;

    let businessData = null;
    if (options.persistBusinessData !== false) {
      try {
        const loadedSnap =
          snapResult.path && existsSync(snapResult.path) ? JSON.parse(readFileSync(snapResult.path, "utf8")) : snapshot;
        businessData = await persistMonitoringToBusinessData({
          runMeta: run,
          snapshot: loadedSnap,
          freeze,
          issues,
          clients,
          n8nExecutionId: options.n8nExecutionId || null,
          force: Boolean(options.force),
        });
        run.businessData = businessData;
      } catch (bdErr) {
        run.warnings = [...(run.warnings || []), `Business Data: ${bdErr.message}`];
        run.businessData = { ok: false, error: bdErr.message, code: bdErr.code };
      }
    }

    writeFileSync(join(OUT, "ENV_AUDIT_ETAPA11.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
    if (!audit.persistence.comprovada) {
      run.warnings.push("Persistência centralizada ainda não comprovada — ver ENV_AUDIT_ETAPA11.json");
    }

    run = finishRunMeta(run, { status: "success", warnings: run.warnings });
    appendRunLog(run);

    return {
      run,
      businessData: run.businessData ?? null,
      environment: env,
      clientCount: clients.length,
      snapshot: snapResult,
      retention: RETENTION_POLICY,
    };
  } catch (error) {
    run = finishRunMeta(run, {
      status: "failed",
      errors: [...(run.errors || []), error?.message || String(error)],
    });
    appendRunLog(run);
    throw error;
  }
}
