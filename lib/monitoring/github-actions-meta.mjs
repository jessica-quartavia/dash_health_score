/** Metadados do executor GitHub Actions (sem segredos). */

import { getMonitoringHistoryBundle } from "./business-data-read.mjs";

export function githubActionsWorkflowRef() {
  return {
    repository: "jessica-quartavia/dash_health_score",
    workflowFile: "monitoring-pipeline.yml",
    workflowName: "Monitoring pipeline",
  };
}

/** Cron comentado no YAML até 1ª execução manual OK. */
export function plannedMonthlySchedule() {
  return {
    cronUtc: "0 9 1 * *",
    labelLocal: "Dia 1 · ~06:00 America/Bahia (09:00 UTC quando UTC−3)",
    activeInRepo: false,
    note: "GitHub Actions pode atrasar jobs agendados (sem horário exato garantido).",
  };
}

export async function getGithubActionsMonitoringStatus() {
  const wf = githubActionsWorkflowRef();
  const schedule = plannedMonthlySchedule();
  const ghaApproved = process.env.MONITORING_GHA_SCHEDULE_ACTIVE === "1";

  let history = null;
  try {
    history = await getMonitoringHistoryBundle();
  } catch {
    history = { ok: false };
  }

  const last = history?.ok ? history.lastValidRun : null;
  const automationActive = ghaApproved && schedule.activeInRepo;

  return {
    executor: "github_actions",
    workflow: wf,
    schedule: {
      ...schedule,
      active: automationActive,
      manualDispatchAvailable: true,
    },
    lastValidRun: last,
    recentFailures: history?.ok ? history.recentFailures || [] : [],
    businessDataConfigured: history?.ok !== false && !history?.error,
    message: automationActive
      ? "Automação mensal GHA declarada ativa (MONITORING_GHA_SCHEDULE_ACTIVE=1 + cron no YAML)."
      : "Executor preferido: GitHub Actions. Agendamento ainda inativo — rode workflow_dispatch e descomente o cron após validar.",
  };
}
