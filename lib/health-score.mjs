/**
 * Cálculo do Health Score por cliente e agregações do dashboard.
 */

import { blankToNull, daysBetween, monthsBetween, parseDate, pct, round1, round2 } from "./utils.mjs";
import { buildAttendanceStatusMap, listValidMeetingStarts } from "./meetings.mjs";
import { countImplementedByClient } from "./mechanisms.mjs";
import { resolveClientProgram } from "./filters.mjs";
import {
  WEIGHTS,
  classifyHealth,
  computeHealthScore,
  labelScoreBand,
  normalizeWeights,
  scoreEngagement,
  scoreMechanisms,
} from "./scoring.mjs";
import { resolveAnalyticalStatus } from "./status.mjs";
import { renewalFromClient } from "./cycle.mjs";
import { latestNpsByClient } from "./nps.mjs";

/** Data de entrada (carência de 90 dias): created_at, com fallback no ciclo. */
function resolveOnboardingDate(client) {
  const created = parseDate(client.created_at);
  if (created) return { date: created, source: "created_at" };
  const cycle = parseDate(client.data_inicio_ciclo);
  if (cycle) return { date: cycle, source: "data_inicio_ciclo" };
  return { date: null, source: "unavailable" };
}

/** Início do ciclo (cadência de reuniões): data_inicio_ciclo, com fallback na entrada. */
function resolveCycleDate(client) {
  const cycle = parseDate(client.data_inicio_ciclo);
  if (cycle) return { date: cycle, source: "data_inicio_ciclo" };
  const created = parseDate(client.created_at);
  if (created) return { date: created, source: "created_at" };
  return { date: null, source: "unavailable" };
}

function engineerLabel(value) {
  return blankToNull(value) || "Não informado";
}

function bump(map, key) {
  const k = key == null || key === "" ? "Não informado" : String(key);
  map.set(k, (map.get(k) || 0) + 1);
}

export const DISTRIBUTION_ORDER = {
  health: ["Saudável", "Atenção", "Crítico", "Em implantação", "Sem registro"],
  engagement: ["Saudável", "Atenção", "Crítico"],
  mechanism: ["Saudável", "Atenção", "Crítico"],
};

export function distributionFromMap(map, total, order = []) {
  const seen = new Set();
  const rows = [];
  for (const label of order) {
    const count = map.get(label) || 0;
    rows.push({ label, count, percent: pct(count, total) });
    seen.add(label);
  }
  for (const [label, count] of map.entries()) {
    if (seen.has(label)) continue;
    rows.push({ label, count, percent: pct(count, total) });
  }
  return rows;
}

export function buildClientHealthRow({
  client,
  calendlyByClient,
  manualByClient,
  implementedByClient,
  cancelMap,
  attendanceMap = null,
  npsByClient = new Map(),
  now = new Date(),
  weights = WEIGHTS,
} = {}) {
  const clientId = String(client.id);
  const onboarding = resolveOnboardingDate(client);
  const cycle = resolveCycleDate(client);
  const entryDate = onboarding.date;
  const cycleDate = cycle.date;
  const daysSinceEntry = entryDate ? Math.max(0, daysBetween(entryDate, now)) : null;
  const cycleDays = cycleDate ? Math.max(0, daysBetween(cycleDate, now)) : null;
  const meetingStarts = listValidMeetingStarts({
    clientId,
    calendlyRows: calendlyByClient.get(clientId) || [],
    manualRows: manualByClient.get(clientId) || [],
    entryDate: cycleDate,
    now,
    attendanceMap,
  });
  const totalMeetings = meetingStarts.length;
  const monthSpan = cycleDate ? monthsBetween(cycleDate, now) : 1;
  const avgMeetingsPerMonth = round2(totalMeetings / monthSpan);
  const implementedCount = implementedByClient.get(clientId) || 0;
  const cancelInfo = cancelMap?.get(clientId) || null;
  const analyticalStatus = resolveAnalyticalStatus(client.status, cancelInfo);
  const renewal = renewalFromClient(client);
  const nps = npsByClient.get(clientId) || null;
  const hasCancellationEvidence = Boolean(cancelInfo?.isCancelled);
  const cancellationDate = cancelInfo?.date instanceof Date && !Number.isNaN(cancelInfo.date.getTime())
    ? cancelInfo.date.toISOString()
    : null;

  const engagementScore = scoreEngagement(avgMeetingsPerMonth);
  const mechanismScore = scoreMechanisms(implementedCount);
  const activeWeights = normalizeWeights(weights);
  const healthScore = computeHealthScore(engagementScore, mechanismScore, activeWeights);
  const finalClass = classifyHealth({
    daysSinceEntry,
    currentCycle: renewal.currentCycle,
    totalMeetings,
    implementedCount,
    healthScore,
  });
  const program = resolveClientProgram(client);

  return {
    clientId,
    clientName: blankToNull(client.name) || "Sem nome",
    clientCode: blankToNull(client.codigo) || "—",
    engineer: engineerLabel(client.engenheiro_patrimonial),
    status: analyticalStatus,
    analyticalStatus,
    program,
    programa: program,
    davos_contrato_assinado: Boolean(client.davos_contrato_assinado),
    entryDate: entryDate ? entryDate.toISOString() : null,
    entrySource: onboarding.source,
    cycleDate: cycleDate ? cycleDate.toISOString() : null,
    cycleSource: cycle.source,
    daysSinceEntry,
    cycleDays,
    totalMeetings,
    avgMeetingsPerMonth,
    implementedCount,
    engagementScore,
    engagementLabel: labelScoreBand(engagementScore),
    mechanismScore,
    mechanismLabel: labelScoreBand(mechanismScore),
    healthScore,
    finalClass,
    currentCycle: renewal.currentCycle,
    hasRenewed: renewal.hasRenewed,
    renewalCount: renewal.renewalCount,
    npsScore: nps?.score ?? null,
    npsClass: nps?.npsClass ?? null,
    npsSubmittedAt: nps?.submittedAt ?? null,
    hasCancellationEvidence,
    cancellationDate,
  };
}

function indexByClientId(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const id = blankToNull(row.client_id);
    if (!id) continue;
    const key = String(id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

export function buildHealthScorePayload({
  clients = [],
  calendlyRows = [],
  manualRows = [],
  mechanismRows = [],
  attendanceRows = [],
  npsRows = [],
  cancelMap = new Map(),
  now = new Date(),
  weights = WEIGHTS,
} = {}) {
  const calendlyByClient = indexByClientId(calendlyRows);
  const manualByClient = indexByClientId(manualRows);
  const implementedByClient = countImplementedByClient(mechanismRows);
  const attendanceMap = buildAttendanceStatusMap(attendanceRows);
  const npsByClient = latestNpsByClient(npsRows);
  const activeWeights = normalizeWeights(weights);

  const allRows = (clients || []).map((client) =>
    buildClientHealthRow({
      client,
      calendlyByClient,
      manualByClient,
      implementedByClient,
      cancelMap,
      attendanceMap,
      npsByClient,
      now,
      weights: activeWeights,
    }),
  );

  return { allRows, weights: activeWeights };
}

export function aggregateHealthScore(filteredClients, {
  weights = WEIGHTS,
  filters,
  filterOptions,
  metadata,
  nps = null,
} = {}) {
  const total = filteredClients.length;
  const healthMap = new Map();
  const engagementMap = new Map();
  const mechanismMap = new Map();

  let scoreSum = 0;
  for (const c of filteredClients) {
    scoreSum += c.healthScore;
    bump(healthMap, c.finalClass);
    bump(engagementMap, c.engagementLabel || labelScoreBand(c.engagementScore));
    bump(mechanismMap, c.mechanismLabel || labelScoreBand(c.mechanismScore));
  }

  const healthy = healthMap.get("Saudável") || 0;
  const attention = healthMap.get("Atenção") || 0;
  const critical = healthMap.get("Crítico") || 0;
  const implanting = healthMap.get("Em implantação") || 0;
  const noRecord = healthMap.get("Sem registro") || 0;

  return {
    summary: {
      totalClients: total,
      averageScore: total ? round1(scoreSum / total) : 0,
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
    weights: {
      engagement: weights.engagement,
      mechanism: weights.mechanism,
      label: weights.label,
      formula: weights.formula,
    },
    distributions: {
      engagement: distributionFromMap(engagementMap, total, DISTRIBUTION_ORDER.engagement),
      mechanism: distributionFromMap(mechanismMap, total, DISTRIBUTION_ORDER.mechanism),
    },
    healthDistribution: distributionFromMap(healthMap, total, DISTRIBUTION_ORDER.health),
    clients: filteredClients,
    filters: {
      applied: filters,
      options: filterOptions,
    },
    metadata,
    nps,
  };
}
