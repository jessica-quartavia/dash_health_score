/**
 * Regras do Health Score proposto: Engajamento (E) e Mecanismos (M).
 */

export const DEFAULT_WEIGHTS = {
  engagement: 0.5,
  mechanism: 0.5,
};

function percentLabel(value) {
  return `${Math.round(value * 100)}%`;
}

function decimalLabel(value) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

export function describeWeights(weights = DEFAULT_WEIGHTS) {
  const normalized = {
    engagement: Number(weights.engagement),
    mechanism: Number(weights.mechanism),
  };
  return {
    ...normalized,
    label: `Pesos: Engajamento (E) = ${percentLabel(normalized.engagement)} · Mecanismos (M) = ${percentLabel(normalized.mechanism)}`,
    formula: `Health Score = (E × ${decimalLabel(normalized.engagement)}) + (M × ${decimalLabel(normalized.mechanism)})`,
  };
}

export const WEIGHTS = describeWeights(DEFAULT_WEIGHTS);

export function normalizeWeights(input = {}) {
  const hasPercentInput = input.engagementWeight != null || input.mechanismWeight != null;
  const engagementPercent = Number(hasPercentInput ? input.engagementWeight : Number(input.engagement) * 100);
  const mechanismPercent = Number(hasPercentInput ? input.mechanismWeight : Number(input.mechanism) * 100);
  const bothProvided = Number.isFinite(engagementPercent) && Number.isFinite(mechanismPercent);

  if (
    !bothProvided
    || engagementPercent < 0
    || engagementPercent > 100
    || mechanismPercent < 0
    || mechanismPercent > 100
    || Math.round((engagementPercent + mechanismPercent) * 100) / 100 !== 100
  ) {
    return WEIGHTS;
  }

  return describeWeights({
    engagement: engagementPercent / 100,
    mechanism: mechanismPercent / 100,
  });
}

export const FINAL_CLASSES = [
  { key: "Em implantação", reading: "Menos de 90 dias desde a entrada e ainda sem mecanismo" },
  { key: "Sem registro", reading: "Nenhuma reunião válida e nenhum mecanismo implantado" },
  { key: "Saudável", min: 70, max: 100, reading: "Cliente engajado e com mecanismo rodando" },
  { key: "Atenção", min: 20, max: 69, reading: "Algum sinal fraco, monitorar" },
  { key: "Crítico", min: 0, max: 19, reading: "Alta probabilidade de churn" },
];

/** Média de reuniões/mês → nota E (piso inclusivo, teto exclusivo). */
export function scoreEngagement(avgPerMonth) {
  const m = Number(avgPerMonth);
  if (!Number.isFinite(m) || m <= 0) return 0;
  if (m >= 1) return 100;
  if (m >= 0.25) return 60;
  return 20;
}

/** Quantidade implantada → nota M. */
export function scoreMechanisms(implementedCount) {
  const n = Number(implementedCount) || 0;
  if (n >= 3) return 100;
  if (n >= 1) return 60;
  return 0;
}

/** Nota E ou M → rótulo de leitura (Saudável / Atenção / Crítico). */
export function labelScoreBand(score) {
  const n = Number(score);
  if (n === 100) return "Saudável";
  if (n === 60) return "Atenção";
  return "Crítico";
}

/** Score final sem teto extra e sem arredondamento. */
export function computeHealthScore(engagementScore, mechanismScore, weights = WEIGHTS) {
  const w = normalizeWeights({
    engagementWeight: Number(weights.engagement) * 100,
    mechanismWeight: Number(weights.mechanism) * 100,
  });
  return (Number(engagementScore) || 0) * w.engagement + (Number(mechanismScore) || 0) * w.mechanism;
}

export function classifyByScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return "Crítico";
  if (n >= 70) return "Saudável";
  if (n >= 20) return "Atenção";
  return "Crítico";
}

/**
 * Classificação na ordem do Word: primeira condição que bater.
 * Ciclo > 1 nunca entra em Em implantação.
 */
export function classifyHealth({
  daysSinceEntry,
  currentCycle,
  totalMeetings,
  implementedCount,
  healthScore,
} = {}) {
  const cycle = Number(currentCycle);
  const renewed = Number.isFinite(cycle) && cycle > 1;
  const implemented = Number(implementedCount) || 0;
  if (!renewed && daysSinceEntry != null && daysSinceEntry < 90 && implemented === 0) {
    return "Em implantação";
  }
  if ((Number(totalMeetings) || 0) === 0 && implemented === 0) {
    return "Sem registro";
  }
  return classifyByScore(healthScore);
}
