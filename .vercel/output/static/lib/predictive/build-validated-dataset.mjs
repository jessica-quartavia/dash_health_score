import { parseDate } from "../utils.mjs";
import { buildAttendanceStatusMap } from "../meetings.mjs";
import { clientRef } from "./pseudonym.mjs";
import { consolidateChurnEpisodes, episodesByClientRef } from "./churn-consolidation.mjs";
import {
  monthStartsBetween,
  monthKey,
  resolveObservationAsOf,
} from "./dates.mjs";
import {
  buildHistoricalEngagement,
  buildHistoricalHealthRow,
  buildHistoricalMechanisms,
  endOfUtcMonth,
  isObservationAllowed,
  outcomeHorizons,
  resolveCycleDate,
  resolveOnboardingDate,
  resolveReactivationDate,
} from "./historical-features.mjs";

function indexByClient(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const id = String(row.client_id);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(row);
  }
  return map;
}

export function buildValidatedPredictivePipeline(raw, { extractedAt = new Date(), maxMonthsPerClient = 36, secret } = {}) {
  const clients = raw.clients || [];
  const calendly = raw.calendlyRows || raw.clientMeetings || [];
  const manual = raw.manualRows || raw.manualMeetings || [];
  const mechanisms = raw.mechanismRows || raw.clientMecanismos || [];
  const attendanceMap = buildAttendanceStatusMap(raw.attendanceRows || raw.meetingAttendance || []);
  const calendlyByClient = indexByClient(calendly);
  const manualByClient = indexByClient(manual);

  const meetingStarts = [];
  for (const row of [...calendly, ...manual]) {
    const d = parseDate(row.start_time);
    if (d && d <= extractedAt) meetingStarts.push(d);
  }
  const asOf = resolveObservationAsOf({
    meetingStarts,
    mechanismRows: mechanisms,
    npsRows: raw.npsRows || [],
    extractedAt,
  });

  const firstMeeting = meetingStarts.length ? meetingStarts.reduce((a, b) => (a < b ? a : b)) : null;

  const { episodes, stats: churnStats, policy } = consolidateChurnEpisodes(
    {
      clients,
      cancellations: raw.cancellations || [],
      churnLogs: raw.churnLogs || [],
      cancellationEvents: raw.cancellationEvents || [],
    },
    { secret },
  );
  const churnByRef = episodesByClientRef(episodes);

  const hsHistorico = [];
  const validated = [];
  const audit = {
    clientsTotal: clients.length,
    asOf: asOf.toISOString(),
    firstMeetingCoverage: firstMeeting ? firstMeeting.toISOString() : null,
    hsIntegral: 0,
    hsParcial: 0,
    hsNaoReconstruivel: 0,
    rowsExcludedPostChurn: 0,
    rowsEligible90: 0,
    rowsEligible180: 0,
    positives90: 0,
    negatives90: 0,
    positives180: 0,
    negatives180: 0,
    censored90: 0,
    censored180: 0,
    excludedNoCoverage: 0,
    eventsByMonth: {},
  };

  for (const client of clients) {
    const clientId = String(client.id);
    const cref = clientRef(clientId, secret);
    const onboarding = resolveOnboardingDate(client);
    const entry = onboarding || resolveCycleDate(client);
    if (!entry) {
      audit.excludedNoCoverage += 1;
      continue;
    }

    const churnEp = churnByRef.get(cref);
    const churnDate = churnEp?.churnDate || null;
    const reactivation = resolveReactivationDate(client, churnDate);
    const endPanel = churnDate && (!reactivation || reactivation > churnDate)
      ? (reactivation && reactivation > churnDate ? asOf : churnDate)
      : asOf;
    const panelEnd = endPanel > asOf ? asOf : endPanel;

    const months = monthStartsBetween(entry, panelEnd, maxMonthsPerClient);
    const calRows = calendlyByClient.get(clientId) || [];
    const manRows = manualByClient.get(clientId) || [];

    for (const monthStart of months) {
      const refEnd = endOfUtcMonth(monthStart);
      if (refEnd > asOf) continue;

      if (!isObservationAllowed(refEnd, churnDate, reactivation)) {
        audit.rowsExcludedPostChurn += 1;
        continue;
      }

      const engagement = buildHistoricalEngagement({
        client,
        calendlyRows: calRows,
        manualRows: manRows,
        attendanceMap,
        refEnd,
        firstMeetingCoverageAt: firstMeeting,
      });
      const mech = buildHistoricalMechanisms({
        mechanismRows: mechanisms,
        clientId,
        refEnd,
        asOf,
      });
      const health = buildHistoricalHealthRow({ client, refEnd, engagement, mechanisms: mech });

      if (health.confiabilidade_reconstrucao === "integral") audit.hsIntegral += 1;
      else if (health.confiabilidade_reconstrucao === "parcial") audit.hsParcial += 1;
      else audit.hsNaoReconstruivel += 1;

      const horizons = outcomeHorizons(refEnd, churnDate, asOf);
      const coberturaOk = engagement.cobertura_engajamento !== "pre_fonte";
      const elegivel90 = coberturaOk;
      const elegivel180 = coberturaOk;
      const rotulo90 = coberturaOk && horizons.janela90;
      const rotulo180 = coberturaOk && horizons.janela180;
      if (elegivel90) {
        audit.rowsEligible90 += 1;
        if (rotulo90) {
          if (horizons.churn90) audit.positives90 += 1;
          else audit.negatives90 += 1;
        } else audit.censored90 += 1;
      }
      if (elegivel180) {
        audit.rowsEligible180 += 1;
        if (rotulo180) {
          if (horizons.churn180) audit.positives180 += 1;
          else audit.negatives180 += 1;
        } else audit.censored180 += 1;
      }

      const mk = monthKey(monthStart);
      const hsRow = {
        cliente_ref: cref,
        data_referencia: refEnd.toISOString(),
        mes_referencia: mk,
        ...health,
        reunioes_acumuladas: engagement.totalMeetings,
        reunioes_30d: engagement.reunioes_30d,
        reunioes_90d: engagement.reunioes_90d,
        reunioes_180d: engagement.reunioes_180d,
        recencia_dias: engagement.recencia_dias ?? "",
        freq_media_mes: engagement.freq_media_mes ?? "",
        mecanismos_implantados: mech.mecanismos_implantados,
      };
      hsHistorico.push(hsRow);

      validated.push({
        ...hsRow,
        programa: client.programa || "",
        ciclo_atual_snapshot: client.ciclo ?? "",
        elegivel_modelagem_90d: rotulo90,
        elegivel_modelagem_180d: rotulo180,
        observacao_elegivel: coberturaOk,
        desfecho_churn_90d: horizons.churn90,
        desfecho_churn_180d: horizons.churn180,
        censura_90d: horizons.censura90,
        censura_180d: horizons.censura180,
        janela_90d_completa: horizons.janela90,
        janela_180d_completa: horizons.janela180,
        data_observacao_asof: asOf.toISOString(),
        motivo_exclusao: engagement.cobertura_engajamento === "pre_fonte" ? "pre_cobertura_reunioes" : "",
      });
    }
  }

  for (const ep of episodes) {
    if (!ep.churn_confirmado || !ep.churn_data) continue;
    const d = parseDate(ep.churn_data);
    if (!d) continue;
    const mk = monthKey(d);
    audit.eventsByMonth[mk] = (audit.eventsByMonth[mk] || 0) + 1;
  }

  return {
    episodes,
    churnStats,
    policy,
    hsHistorico,
    validated,
    audit,
    asOf,
  };
}
