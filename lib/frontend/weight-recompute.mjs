import {
  computeHealthScore,
  classifyHealth,
  normalizeWeights,
} from "../scoring.mjs";

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function pct(n, total) {
  return total ? Math.round((n / total) * 1000) / 10 : 0;
}

const HEALTH_ORDER = ["Saudável", "Atenção", "Crítico", "Em implantação", "Sem registro"];

export function recomputeClientScores(rows, weightPercents) {
  const w = normalizeWeights({
    engagementWeight: weightPercents.engagement,
    mechanismWeight: weightPercents.mechanism,
  });
  return (rows || []).map((row) => {
    const healthScore = computeHealthScore(row.engagementScore, row.mechanismScore, w);
    const finalClass = classifyHealth({
      daysSinceEntry: row.daysSinceEntry,
      currentCycle: row.currentCycle,
      totalMeetings: row.totalMeetings,
      implementedCount: row.implementedCount,
      healthScore,
    });
    return { ...row, healthScore, finalClass };
  });
}

export function buildSummaryFromClients(clients, weightsDesc) {
  const total = clients.length;
  const healthMap = new Map();
  let scoreSum = 0;
  for (const c of clients) {
    scoreSum += Number(c.healthScore) || 0;
    bump(healthMap, c.finalClass);
  }
  const healthy = healthMap.get("Saudável") || 0;
  const attention = healthMap.get("Atenção") || 0;
  const critical = healthMap.get("Crítico") || 0;
  const implanting = healthMap.get("Em implantação") || 0;
  const noRecord = healthMap.get("Sem registro") || 0;
  const distributionFromMap = (map, order) =>
    order
      .map((label) => {
        const count = map.get(label) || 0;
        return { label, count, percent: pct(count, total) };
      })
      .filter((item) => item.count > 0);

  return {
    summary: {
      totalClients: total,
      averageScore: total ? Math.round((scoreSum / total) * 10) / 10 : 0,
      healthy,
      attention,
      critical,
      implanting,
      noRecord,
      healthyPercent: pct(healthy, total),
      attentionPercent: pct(attention, total),
      criticalPercent: pct(critical, total),
      implantingPercent: pct(implanting, total),
      noRecordPercent: pct(noRecord, total),
    },
    healthDistribution: distributionFromMap(healthMap, HEALTH_ORDER),
    weights: weightsDesc,
  };
}

/** Resumo e distribuição a partir do recorte filtrado (mesma lógica do payload). */
export function snapshotFromClients(rows, weightPercents) {
  const w = normalizeWeights({
    engagementWeight: weightPercents.engagement,
    mechanismWeight: weightPercents.mechanism,
  });
  const clients = recomputeClientScores(rows, weightPercents);
  return buildSummaryFromClients(clients, {
    engagement: w.engagement,
    mechanism: w.mechanism,
    label: w.label,
    formula: w.formula,
  });
}

export function applyWeightsToPayload(payload, weightPercents) {
  if (!payload?.clients?.length) return payload;
  const w = normalizeWeights({
    engagementWeight: weightPercents.engagement,
    mechanismWeight: weightPercents.mechanism,
  });
  const clients = recomputeClientScores(payload.clients, weightPercents);
  const partial = buildSummaryFromClients(clients, {
    engagement: w.engagement,
    mechanism: w.mechanism,
    label: w.label,
    formula: w.formula,
  });
  return {
    ...payload,
    clients,
    summary: partial.summary,
    healthDistribution: partial.healthDistribution,
    weights: partial.weights,
  };
}
