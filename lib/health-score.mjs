/**
 * Cálculo do Health Score por cliente e agregações do dashboard.
 */

import { blankToNull, daysBetween, monthsBetween, parseDate, pct, round1, round2 } from "./utils.mjs";
import { buildAttendanceStatusMap, countMeetingsInFirstDays, listValidMeetingStarts } from "./meetings.mjs";
import { countImplementedByClient } from "./mechanisms.mjs";
import { resolveClientProgram } from "./filters.mjs";
import {
  MODEL_COMPLETO,
  WEIGHTS,
  classifyFinal,
  classifySituation1,
  classifySituation2,
  classifySituation3,
  classifySituation4,
  computeWeightedScore,
  normalizeModel,
} from "./scoring.mjs";
import { resolveAnalyticalStatus } from "./status.mjs";
import { renewalFromClient } from "./cycle.mjs";

function resolveEntryDate(client) {
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
  const k = key || "Não informado";
  map.set(k, (map.get(k) || 0) + 1);
}

export const DISTRIBUTION_ORDER = {
  health: ["Saudável", "Atenção", "Crítico"],
  s1: ["Saudável", "Atenção", "Crítico", "Fase natural de acompanhamento"],
  s2: ["Saudável", "Atenção", "Crítico"],
  s3: ["Saudável", "Atenção", "Crítico", "Fase natural de implantação"],
  s4: [
    "Saudável (≥4)",
    "Saudável (3)",
    "Saudável (2)",
    "Saudável (1)",
    "Crítico",
    "Fase natural de implantação",
  ],
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
  now = new Date(),
  model = MODEL_COMPLETO,
} = {}) {
  const clientId = String(client.id);
  const entry = resolveEntryDate(client);
  const entryDate = entry.date;
  const cycleDays = entryDate ? Math.max(0, daysBetween(entryDate, now)) : null;
  const meetingStarts = listValidMeetingStarts({
    clientId,
    calendlyRows: calendlyByClient.get(clientId) || [],
    manualRows: manualByClient.get(clientId) || [],
    entryDate,
    now,
    attendanceMap,
  });
  const totalMeetings = meetingStarts.length;
  const meetingsFirst45 = entryDate ? countMeetingsInFirstDays(meetingStarts, entryDate, 45) : 0;
  const monthSpan = entryDate ? monthsBetween(entryDate, now) : 1;
  const avgMeetingsPerMonth = round2(totalMeetings / monthSpan);
  const implementedCount = implementedByClient.get(clientId) || 0;
  const cancelInfo = cancelMap?.get(clientId) || null;
  const analyticalStatus = resolveAnalyticalStatus(client.status, cancelInfo);
  const renewal = renewalFromClient(client);
  const hasCancellationEvidence = Boolean(cancelInfo?.isCancelled);
  const cancellationDate = cancelInfo?.date instanceof Date && !Number.isNaN(cancelInfo.date.getTime())
    ? cancelInfo.date.toISOString()
    : null;

  const s1 = classifySituation1({ meetingsFirst45, cycleDays });
  const s2 = classifySituation2(avgMeetingsPerMonth);
  const s3 = classifySituation3({ implementedCount, cycleDays });
  const s4 = classifySituation4({ implementedCount, cycleDays });

  const healthScore = round1(
    computeWeightedScore({ s1: s1.score, s2: s2.score, s3: s3.score, s4: s4.score }, model),
  );
  const finalClass = classifyFinal(healthScore);
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
    entrySource: entry.source,
    cycleDays,
    totalMeetings,
    meetingsFirst45,
    avgMeetingsPerMonth,
    implementedCount,
    s1Key: s1.key,
    s1Label: s1.label,
    s1Score: s1.score,
    s2Key: s2.key,
    s2Label: s2.label,
    s2Score: s2.score,
    s3Key: s3.key,
    s3Label: s3.label,
    s3Score: s3.score,
    s4Key: s4.key,
    s4Label: s4.label,
    s4Score: s4.score,
    healthScore,
    finalClass,
    currentCycle: renewal.currentCycle,
    hasRenewed: renewal.hasRenewed,
    renewalCount: renewal.renewalCount,
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
  cancelMap = new Map(),
  filters = {},
  now = new Date(),
} = {}) {
  const model = normalizeModel(filters.model);
  const weights = WEIGHTS[model];
  const calendlyByClient = indexByClientId(calendlyRows);
  const manualByClient = indexByClientId(manualRows);
  const implementedByClient = countImplementedByClient(mechanismRows);
  const attendanceMap = buildAttendanceStatusMap(attendanceRows);

  const allRows = (clients || []).map((client) =>
    buildClientHealthRow({
      client,
      calendlyByClient,
      manualByClient,
      implementedByClient,
      cancelMap,
      attendanceMap,
      now,
      model,
    }),
  );

  // Import dinâmico evitado: filter é puro
  return { allRows, model, weights };
}

export function aggregateHealthScore(filteredClients, {
  model,
  weights,
  filters,
  filterOptions,
  metadata,
  discardedForMissingData = 0,
}) {
  const total = filteredClients.length;
  const healthMap = new Map();
  const s1Map = new Map();
  const s2Map = new Map();
  const s3Map = new Map();
  const s4Map = new Map();

  let scoreSum = 0;
  for (const c of filteredClients) {
    scoreSum += c.healthScore;
    bump(healthMap, c.finalClass);
    bump(s1Map, c.s1Label);
    bump(s2Map, c.s2Label);
    bump(s3Map, c.s3Label);
    bump(s4Map, c.s4Label);
  }

  const healthy = healthMap.get("Saudável") || 0;
  const attention = healthMap.get("Atenção") || 0;
  const critical = healthMap.get("Crítico") || 0;

  return {
    summary: {
      totalClients: total,
      discardedForMissingData,
      averageScore: total ? round1(scoreSum / total) : 0,
      healthy,
      attention,
      critical,
      healthyPercent: pct(healthy, total),
      attentionPercent: pct(attention, total),
      criticalPercent: pct(critical, total),
    },
    weights: {
      model,
      s1: weights.s1,
      s2: weights.s2,
      s3: weights.s3,
      s4: weights.s4,
      label: weights.label,
      formula: weights.formula,
    },
    models: {
      completo: WEIGHTS.completo,
      simplificado: WEIGHTS.simplificado,
    },
    situationDistributions: {
      s1: distributionFromMap(s1Map, total, DISTRIBUTION_ORDER.s1),
      s2: distributionFromMap(s2Map, total, DISTRIBUTION_ORDER.s2),
      s3: distributionFromMap(s3Map, total, DISTRIBUTION_ORDER.s3),
      s4: distributionFromMap(s4Map, total, DISTRIBUTION_ORDER.s4),
    },
    healthDistribution: distributionFromMap(healthMap, total, DISTRIBUTION_ORDER.health),
    clients: filteredClients,
    filters: {
      applied: filters,
      options: filterOptions,
    },
    metadata,
  };
}
