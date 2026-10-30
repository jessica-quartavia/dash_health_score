import { listSnapshots } from "./snapshot-store.mjs";
import { listRunLogs } from "./run-log.mjs";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { monitoringRoot } from "./storage-backend.mjs";
import { verifySnapshotIntegrity, loadSnapshot } from "./snapshot-store.mjs";

export function latestMonthlyFreeze() {
  const dir = join(monitoringRoot(), "prospective");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse();
  return files[0] || null;
}

export function buildOperationalStates(audit) {
  const centralized = audit?.persistence?.centralizedValidated === true;
  const approved = audit?.vars?.automationApproved === true;
  const cronActive = audit?.vars?.cronActive === true;
  const lastRuns = listRunLogs(3);
  const lastSuccess = lastRuns.find((r) => r.status === "success");
  const lastFailed = lastRuns.find((r) => r.status === "failed");

  let automationState = "nao_aprovada";
  if (approved && !centralized) automationState = "aprovada_sem_destino";
  if (approved && centralized && !cronActive) automationState = "aprovada_aguardando_cron";
  if (approved && centralized && cronActive && lastSuccess) automationState = "ativa";
  if (lastFailed && (!lastSuccess || lastFailed.startedAt > lastSuccess.startedAt)) automationState = "falha_recente";

  let persistenceState = "local";
  if (centralized) persistenceState = "centralizada_validada";
  else if (audit?.persistence?.mirrorConfigured || audit?.persistence?.supabaseConfigured) {
    persistenceState = "central_pendente_validacao";
  }

  return {
    persistenceState,
    automationState,
    labels: {
      local: "Somente local",
      centralizada_validada: "Persistência centralizada validada",
      central_pendente_validacao: "Destino configurado — validação pendente",
      nao_aprovada: "Automação não aprovada",
      aprovada_sem_destino: "Aprovada — falta destino durável",
      aprovada_aguardando_cron: "Aprovada — cron não ativo",
      ativa: "Automação ativa",
      falha_recente: "Falha na execução recente",
    },
  };
}

export function buildPersistenceDashboard(audit) {
  const snaps = listSnapshots();
  const latest = snaps[0];
  let lastSnapshotValidated = false;
  if (latest?.file) {
    const loaded = loadSnapshot(latest.file);
    lastSnapshotValidated = verifySnapshotIntegrity(loaded).ok;
  }
  const states = buildOperationalStates(audit);
  const lastRuns = listRunLogs(5);
  const failures = lastRuns.filter((r) => r.status === "failed");

  return {
    ultimaExecucao: lastRuns[0]?.finishedAt || lastRuns[0]?.startedAt || null,
    ultimaExecucaoStatus: lastRuns[0]?.status || null,
    ultimoSnapshotDia: latest?.referenceDay || null,
    ultimoSnapshotValidado: lastSnapshotValidated,
    quantidadeSnapshots: snaps.length,
    ultimoFreezeMensal: latestMonthlyFreeze(),
    destino: audit?.publicSummary || null,
    estados: states,
    falhasRecentes: failures.slice(0, 3).map((f) => ({
      runId: f.runId,
      referenceDay: f.referenceDay,
      status: f.status,
      errors: f.errors,
    })),
    automacaoAtivaDeclarada: states.automationState === "ativa",
  };
}
