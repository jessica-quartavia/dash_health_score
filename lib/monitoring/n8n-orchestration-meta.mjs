/** Metadados de orquestração n8n (sem segredos) — Etapa 13. */

export const N8N_HEALTH_WORKFLOW_ID = "0gRJGp39YOXrXEZY";

export function getN8nOrchestrationMeta() {
  const pipelineUrlConfigured = Boolean(process.env.MONITORING_PIPELINE_URL?.trim());
  const tokenConfigured = Boolean(process.env.MONITORING_PIPELINE_TOKEN?.trim());
  const scheduleApproved = process.env.MONITORING_N8N_SCHEDULE_ACTIVE === "1";
  const workflowId = process.env.N8N_HEALTH_WORKFLOW_ID?.trim() || N8N_HEALTH_WORKFLOW_ID;

  return {
    workflowId,
    workflowName: "Health Analytics — Pipeline (desativado)",
    schedule: {
      cadence: "monthly",
      dayOfMonth: 1,
      timeLocal: "06:00",
      timezone: "America/Bahia",
      active: scheduleApproved,
      note: scheduleApproved
        ? "Agendamento mensal aprovado via MONITORING_N8N_SCHEDULE_ACTIVE=1."
        : "Schedule n8n permanece inativo até teste remoto com MONITORING_PIPELINE_URL pública.",
    },
    trigger: {
      type: "POST /api/monitoring/pipeline/run",
      auth: "Bearer MONITORING_PIPELINE_TOKEN",
      executorRecommended:
        "Preferir GitHub Actions (.github/workflows/monitoring-pipeline.yml) — job Node ~2–5 min/mês, sem HTTP público. Alternativa: servidor Node long-running se já existir.",
      githubActions: {
        workflowFile: "monitoring-pipeline.yml",
        manual: "workflow_dispatch",
        monthlyCronComment: "0 9 1 * * UTC (≈ 06:00 Bahia) — descomentar schedule após validação",
      },
    },
    configured: {
      pipelineUrl: pipelineUrlConfigured,
      pipelineToken: tokenConfigured,
      readyForRemoteN8n: pipelineUrlConfigured && tokenConfigured,
    },
  };
}
