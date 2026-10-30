/**
 * Auditoria econométrica das taxas de churn históricas (sem alterar dados).
 */

import { finiteNumber, sanitizeRate } from "../frontend/display-format.mjs";

function pct(rate) {
  if (rate == null || !Number.isFinite(rate)) return null;
  return Math.round(rate * 1000) / 10;
}

/**
 * @param {object|null} preAudit — research/modeling/output/pre_audit.json
 * @param {object|null} modeling — modeling_results_etapa4.json
 */
export function buildChurnRateAudit(preAudit, modeling = null) {
  if (!preAudit) {
    return { ok: false, reason: "pre_audit_missing" };
  }

  const posRows = finiteNumber(preAudit.positive_rows_90d) ?? 0;
  const negRows = finiteNumber(preAudit.negative_rows_90d) ?? 0;
  const labeledRows = posRows + negRows;
  const rateByObservation = labeledRows ? sanitizeRate(posRows / labeledRows) : null;

  const uniqueLabeled = finiteNumber(preAudit.unique_clients_labeled_90d);
  const uniqueChurnOutcome = finiteNumber(preAudit.unique_clients_with_churn_outcome);
  const rateUniqueEverChurn =
    uniqueLabeled && uniqueChurnOutcome != null ? sanitizeRate(uniqueChurnOutcome / uniqueLabeled) : null;

  const meanPosMonths = finiteNumber(preAudit.positive_months_per_client_mean);
  const impliedUniqueFromRows =
    meanPosMonths && meanPosMonths > 0 ? Math.round(posRows / meanPosMonths) : null;

  const sensitivity = preAudit.sensitivity_exclude_conflicts || {};
  const rateExclConflicts = finiteNumber(sensitivity.prevalence);

  const sample = modeling?.sample || {};
  const prevalenceTrain = sanitizeRate(sample.prevalence_train);
  const prevalenceTest = sanitizeRate(sample.prevalence_test);

  const hsDist = preAudit.hs_distribution || {};
  const lowHsShare = hsDist.count && hsDist.p50 === 0 ? "Mediana HS histórico = 0 — grande massa em faixa baixa/sem engajamento." : null;

  const findings = [];
  const exploratory = [];
  const confirmed = [];

  if (rateByObservation != null) {
    confirmed.push(
      `Taxa por observação cliente-mês rotulada: ${pct(rateByObservation)}% (${posRows} positivas / ${labeledRows} linhas com janela 90d completa).`,
    );
  }
  if (rateUniqueEverChurn != null) {
    confirmed.push(
      `Entre ${uniqueLabeled} clientes únicos elegíveis, ${uniqueChurnOutcome} tiveram pelo menos um mês rotulado como churn nos 90d (${pct(rateUniqueEverChurn)}%) — medida distinta da taxa por linha.`,
    );
  }
  if (meanPosMonths != null && meanPosMonths > 1.2) {
    confirmed.push(
      `Um mesmo episódio de cancelamento gera em média ${meanPosMonths.toFixed(2)} linhas positivas (cliente-mês), inflando a contagem de eventos em relação a clientes únicos.`,
    );
  }
  if (impliedUniqueFromRows != null && uniqueChurnOutcome != null) {
    const diff = Math.abs(impliedUniqueFromRows - uniqueChurnOutcome);
    if (diff <= uniqueChurnOutcome * 0.05) {
      confirmed.push(
        `Contagem de clientes com desfecho positivo (~${uniqueChurnOutcome}) é coerente com eventos em linha ÷ média de meses positivos (~${impliedUniqueFromRows}).`,
      );
    }
  }
  if (prevalenceTrain != null && prevalenceTest != null && Math.abs(prevalenceTrain - prevalenceTest) > 0.08) {
    confirmed.push(
      `No hold-out congelado, a prevalência cai de ${pct(prevalenceTrain)}% (treino) para ${pct(prevalenceTest)}% (teste jun/2026) — comparar taxa global (~${pct(rateByObservation)}%) com teste exige separar período e desenho.`,
    );
  }
  if (rateExclConflicts != null && rateByObservation != null && Math.abs(rateExclConflicts - rateByObservation) < 0.01) {
    exploratory.push(
      `Excluir ${finiteNumber(preAudit.date_conflict_clients) ?? 0} clientes com conflito de datas altera pouco a taxa (${pct(rateExclConflicts)}%) — o nível elevado não vem só de conflitos.`,
    );
  } else if (rateExclConflicts != null) {
    exploratory.push(`Sensibilidade sem conflitos de data: ${pct(rateExclConflicts)}% (${sensitivity.rows ?? "—"} linhas).`);
  }

  if (lowHsShare) findings.push(lowHsShare);

  const cobertura = preAudit.cobertura_mecanismos_counts || {};
  if (cobertura.sem_vinculo && hsDist.count) {
    exploratory.push(
      `${cobertura.sem_vinculo} observações históricas com cobertura de mecanismos “sem vínculo” — composição de risco operacional difere da carteira atual com M reconstruído.`,
    );
  }

  findings.push(
    "A taxa ~30,6% responde à pergunta: “destas linhas mensais com janela completa, em quantas houve churn nos 90 dias seguintes?” — não à taxa anual da carteira nem à probabilidade calibrada por cliente.",
  );

  if (prevalenceTest != null && modeling?.models) {
    exploratory.push(
      "Modelos podem discriminar (ROC-AUC moderado) enquanto probabilidades médias no teste ficam desalinhadas da prevalência — ver Brier e bins de calibração; não usar AUC como ‘% de acerto’.",
    );
  }

  return {
    ok: true,
    measures: {
      rateByObservationClientMonth: rateByObservation,
      rateByUniqueClientWithOutcome: rateUniqueEverChurn,
      rateSensitivityExcludeDateConflicts: rateExclConflicts,
      prevalenceTrainHoldout: prevalenceTrain,
      prevalenceTestHoldout: prevalenceTest,
      labeledRows,
      positiveRows: posRows,
      negativeRows: negRows,
      uniqueClientsLabeled90d: uniqueLabeled,
      uniqueClientsChurnOutcome: uniqueChurnOutcome,
      meanPositiveMonthsPerClient: meanPosMonths,
      dateConflictClients: finiteNumber(preAudit.date_conflict_clients),
      reactivatedProxySpan: finiteNumber(preAudit.reactivated_proxy_multi_month_span),
    },
    confirmed,
    exploratory,
    findings,
    calibrationNote:
      "Calibração confirmatória não realizada — bins de calibração existentes referem-se ao hold-out já usado nos experimentos A–E.",
  };
}

export function extendModelMetrics(models, modeling) {
  if (!modeling?.models || !Array.isArray(models)) return models;
  return models.map((m) => {
    const test = modeling.models[m.id]?.test;
    if (!test) return m;
    return {
      ...m,
      brier: test.brier ?? null,
      logLoss: test.log_loss ?? null,
      testPrevalence: test.prevalence ?? null,
      testN: test.n ?? null,
      testPositives: test.positives ?? null,
    };
  });
}
