/**
 * Reconstrução point-in-time de E e M (regras do dashboard).
 */
import { daysBetween, monthsBetween, parseDate, round2 } from "../utils.mjs";
import { collectValidMeetings } from "../meetings.mjs";
import { dedupeClientMechanisms, isImplementedStatus, isDroppedMechanism } from "../mechanisms.mjs";
import {
  classifyHealth,
  computeHealthScore,
  scoreEngagement,
  scoreMechanisms,
  WEIGHTS,
} from "../scoring.mjs";
import { renewalFromClient } from "../cycle.mjs";
import { endOfUtcMonth, addUtcDays } from "./dates.mjs";

export const FORMULA_VERSION = "hs-experimental-v1-50-50";

function resolveCycleDate(client) {
  return parseDate(client.data_inicio_ciclo) || parseDate(client.created_at);
}

function resolveOnboardingDate(client) {
  return parseDate(client.created_at) || parseDate(client.data_inicio_ciclo);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function meetingsInWindow(meetingStarts, refEnd, days) {
  const from = addUtcDays(refEnd, -days);
  let count = 0;
  for (const start of meetingStarts) {
    if (start <= refEnd && start > from) count += 1;
  }
  return count;
}

export function buildHistoricalEngagement({
  client,
  calendlyRows = [],
  manualRows = [],
  attendanceMap = null,
  refEnd,
  firstMeetingCoverageAt = null,
}) {
  const cycleDate = resolveCycleDate(client);
  const meetings = collectValidMeetings({
    clientId: client.id,
    calendlyRows,
    manualRows,
    entryDate: cycleDate,
    now: refEnd,
    attendanceMap,
  });
  const starts = meetings.map((m) => m.start);
  const total = starts.length;
  const monthSpan = cycleDate ? monthsBetween(cycleDate, refEnd) : null;
  let coverage = "completa";
  if (firstMeetingCoverageAt && refEnd < firstMeetingCoverageAt) {
    coverage = "pre_fonte";
  } else if (!cycleDate) {
    coverage = "indisponivel";
  }

  if (coverage === "pre_fonte" || coverage === "indisponivel") {
    return {
      totalMeetings: total,
      reunioes_30d: 0,
      reunioes_90d: 0,
      reunioes_180d: 0,
      recencia_dias: null,
      freq_media_mes: null,
      intervalo_mediano_dias: null,
      engagementScore: null,
      cobertura_engajamento: coverage,
    };
  }

  const avgPerMonth = monthSpan ? round2(total / monthSpan) : null;
  const last = starts.length ? starts[starts.length - 1] : null;
  const intervals = [];
  for (let i = 1; i < starts.length; i += 1) {
    intervals.push(daysBetween(starts[i - 1], starts[i]));
  }

  return {
    totalMeetings: total,
    reunioes_30d: meetingsInWindow(starts, refEnd, 30),
    reunioes_90d: meetingsInWindow(starts, refEnd, 90),
    reunioes_180d: meetingsInWindow(starts, refEnd, 180),
    recencia_dias: last ? Math.max(0, daysBetween(last, refEnd)) : null,
    freq_media_mes: avgPerMonth,
    intervalo_mediano_dias: intervals.length ? median(intervals) : null,
    engagementScore: avgPerMonth != null ? scoreEngagement(avgPerMonth) : null,
    cobertura_engajamento: coverage,
  };
}

/**
 * M na referência: implantado se implemented_at (ou created_at) <= ref e status comprova implantação.
 * Status cancelado/dropped: conta apenas até asOf com cobertura parcial (fim desconhecido).
 */
export function buildHistoricalMechanisms({
  mechanismRows = [],
  clientId,
  refEnd,
  asOf,
}) {
  const rows = dedupeClientMechanisms(
    mechanismRows.filter((row) => String(row.client_id) === String(clientId)),
  );
  let implemented = 0;
  let coverage = "completa";
  let partial = false;

  for (const row of rows) {
    const implAt = parseDate(row.implemented_at) || parseDate(row.created_at);
    if (!implAt || implAt > refEnd) continue;
    if (isImplementedStatus(row.status)) {
      implemented += 1;
    } else if (isDroppedMechanism(row.status)) {
      if (refEnd <= asOf) {
        implemented += 1;
        partial = true;
      }
    }
  }

  if (!rows.length) coverage = "sem_vinculo";
  else if (partial) coverage = "parcial";

  return {
    mecanismos_implantados: implemented,
    mechanismScore: coverage === "indisponivel" ? null : scoreMechanisms(implemented),
    cobertura_mecanismos: coverage,
  };
}

export function buildHistoricalHealthRow({
  client,
  refEnd,
  engagement,
  mechanisms,
  weights = WEIGHTS,
}) {
  const onboarding = resolveOnboardingDate(client);
  const renewal = renewalFromClient(client);
  const daysSinceEntry = onboarding ? Math.max(0, daysBetween(onboarding, refEnd)) : null;

  const eScore = engagement.engagementScore;
  const mScore = mechanisms.mechanismScore;
  let hs = null;
  let confiabilidade = "integral";
  if (engagement.cobertura_engajamento === "pre_fonte" || engagement.cobertura_engajamento === "indisponivel") {
    confiabilidade = "nao_reconstruivel";
  } else if (mechanisms.cobertura_mecanismos === "parcial") {
    confiabilidade = "parcial";
  } else if (eScore == null || mScore == null) {
    confiabilidade = "nao_reconstruivel";
  } else {
    hs = computeHealthScore(eScore, mScore, weights);
  }

  let classificacao = "";
  if (hs != null) {
    classificacao = classifyHealth({
      daysSinceEntry,
      currentCycle: renewal.currentCycle,
      totalMeetings: engagement.totalMeetings,
      implementedCount: mechanisms.mecanismos_implantados,
      healthScore: hs,
    });
  }

  return {
    engajamento_historico: eScore,
    mecanismos_historico: mScore,
    hs_historico: hs,
    classificacao_historica: classificacao,
    cobertura_engajamento: engagement.cobertura_engajamento,
    cobertura_mecanismos: mechanisms.cobertura_mecanismos,
    confiabilidade_reconstrucao: confiabilidade,
    versao_formula: FORMULA_VERSION,
  };
}

export function resolveReactivationDate(client, churnDate) {
  if (!churnDate) return null;
  const cycleStart = parseDate(client.data_inicio_ciclo);
  const status = String(client.status || "").toLowerCase();
  const activeAgain = status.includes("ativo") || status === "active";
  if (cycleStart && cycleStart > churnDate && activeAgain) return cycleStart;
  const descongel = parseDate(client.data_descongelamento);
  if (descongel && descongel > churnDate) return descongel;
  return null;
}

export function isObservationAllowed(refEnd, churnDate, reactivationDate) {
  if (!churnDate) return true;
  if (refEnd <= churnDate) return true;
  if (reactivationDate && refEnd >= reactivationDate) return true;
  return false;
}

export function outcomeHorizons(refEnd, churnDate, asOf) {
  const end90 = addUtcDays(refEnd, 90);
  const end180 = addUtcDays(refEnd, 180);
  const janela90 = end90 <= asOf;
  const janela180 = end180 <= asOf;
  let churn90 = false;
  let churn180 = false;
  if (churnDate && churnDate > refEnd) {
    churn90 = churnDate <= end90;
    churn180 = churnDate <= end180;
  }
  /** Censura = janela ainda não fechou na data as-of (não rotular y=0). */
  const censura90 = !janela90;
  const censura180 = !janela180;
  const negativo90 = janela90 && !churn90;
  const negativo180 = janela180 && !churn180;
  return { churn90, churn180, janela90, janela180, censura90, censura180, negativo90, negativo180 };
}

export { endOfUtcMonth, resolveCycleDate, resolveOnboardingDate };
