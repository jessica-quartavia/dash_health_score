/**
 * Carrega dados da BASE QV e monta o payload do Health Score.
 */

import { dataConfigurationError } from "./env.mjs";
import { fetchAllRows } from "./data/supabase-rest.mjs";
import { filterExcludedClients } from "./utils.mjs";
import {
  ANALYTICAL_CANCEL_SELECT,
  buildAnalyticalCancellationMap,
} from "./status.mjs";
import { buildFilterOptions, filterHealthClients, parseFiltersFromQuery } from "./filters.mjs";
import { aggregateHealthScore, buildHealthScorePayload } from "./health-score.mjs";
import { csvFilename, rowsToCsv } from "./clusters.mjs";
import { normalizeWeights } from "./scoring.mjs";
import { buildNpsAnalysis } from "./nps.mjs";

const CLIENT_SELECT =
  "id,codigo,name,status,engenheiro_patrimonial,programa,davos_contrato_assinado,data_inicio_ciclo,created_at,data_churn,email,ciclo";
const MEETING_SELECT = "id,client_id,start_time,calendly_event_uri,event_name";
const MANUAL_SELECT = "id,client_id,start_time,title,google_event_id";
const MECHANISM_SELECT = "id,client_id,mecanismo_id,status,implemented_at,created_at";
const ATTENDANCE_SELECT = "calendly_event_uri,status,created_at,updated_at";
const NPS_SELECT = "id,client_id,score,submitted_at,created_at";

let cache = null;
const CACHE_TTL_MS = 60_000;

async function loadRawData(force = false) {
  const configError = dataConfigurationError();
  if (configError) {
    const err = new Error(configError);
    err.code = "DATA_CONFIG";
    throw err;
  }

  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  const started = Date.now();
  const [clientsRaw, calendlyRows, manualRows, mechanismRows, attendanceRows, cancellations, npsRows] = await Promise.all([
    fetchAllRows({ table: "clients", select: CLIENT_SELECT, order: "id.asc" }),
    fetchAllRows({ table: "client_meetings", select: MEETING_SELECT, order: "start_time.asc" }),
    fetchAllRows({ table: "manual_meetings", select: MANUAL_SELECT, order: "start_time.asc" }),
    fetchAllRows({ table: "client_mecanismos", select: MECHANISM_SELECT, order: "implemented_at.asc" }),
    fetchAllRows({ table: "meeting_attendance", select: ATTENDANCE_SELECT, order: "created_at.asc" }),
    fetchAllRows({ table: "cancellations", select: ANALYTICAL_CANCEL_SELECT, order: "id.asc" }),
    fetchAllRows({ table: "nps_responses", select: NPS_SELECT, order: "submitted_at.desc,created_at.desc" }),
  ]);

  // Catálogo mecanismos — opcional (só para metadados)
  let mecanismosCatalog = [];
  try {
    mecanismosCatalog = await fetchAllRows({
      table: "mecanismos",
      select: "id,name,nome",
      order: "id.asc",
    });
  } catch {
    mecanismosCatalog = [];
  }

  const clients = filterExcludedClients(clientsRaw);
  const cancelMap = buildAnalyticalCancellationMap(cancellations, clients);
  const data = {
    clients,
    calendlyRows,
    manualRows,
    mechanismRows,
    attendanceRows,
    npsRows,
    cancelMap,
    mecanismosCatalog,
    loadedAt: new Date().toISOString(),
    loadMs: Date.now() - started,
    counts: {
      clients: clients.length,
      clientMeetings: calendlyRows.length,
      manualMeetings: manualRows.length,
      meetingAttendance: attendanceRows.length,
      clientMecanismos: mechanismRows.length,
      cancellations: cancellations.length,
      npsResponses: npsRows.length,
      mecanismos: mecanismosCatalog.length,
    },
  };
  cache = { at: Date.now(), data };
  return data;
}

export async function getHealthScoreResponse(query = {}, { clientsOnly = false } = {}) {
  const filters = parseFiltersFromQuery(query);
  const activeWeights = normalizeWeights(query);
  const raw = await loadRawData(query.refresh === "1" || query.refresh === "true");
  const { allRows, weights } = buildHealthScorePayload({
    clients: raw.clients,
    calendlyRows: raw.calendlyRows,
    manualRows: raw.manualRows,
    mechanismRows: raw.mechanismRows,
    attendanceRows: raw.attendanceRows,
    npsRows: raw.npsRows,
    cancelMap: raw.cancelMap,
    weights: activeWeights,
  });

  const eligible = filterHealthClients(allRows, filters);
  const filterOptions = buildFilterOptions(allRows);
  const metadata = {
    generatedAt: new Date().toISOString(),
    loadedAt: raw.loadedAt,
    loadMs: raw.loadMs,
    sources: [
      "clients",
      "client_meetings",
      "manual_meetings",
      "meeting_attendance",
      "client_mecanismos",
      "mecanismos",
      "cancellations",
      "nps_responses",
    ],
    counts: raw.counts,
    note: "Dashboard experimental — não é score oficial definitivo de churn.",
    cacheTtlMs: CACHE_TTL_MS,
  };

  if (clientsOnly) {
    return {
      clients: eligible,
      filters: { applied: filters, options: filterOptions },
      metadata,
      summary: {
        totalClients: eligible.length,
      },
    };
  }

  return aggregateHealthScore(eligible, {
    weights,
    filters,
    filterOptions,
    metadata,
    nps: buildNpsAnalysis(eligible),
  });
}

export async function getHealthScoreCsvResponse(query = {}) {
  const payload = await getHealthScoreResponse(query, { clientsOnly: true });
  return {
    filename: csvFilename(payload.filters?.applied?.cluster),
    csv: rowsToCsv(payload.clients || []),
  };
}

export function clearHealthScoreCache() {
  cache = null;
}
