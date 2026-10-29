/**
 * Carrega dados da BASE QV e monta o payload do Health Score.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
import { buildResearchAudit } from "./research-audit.mjs";
import { HS2A_VERSION, OFFICIAL_FORMULA_VERSION } from "./hs2a-interpretation.mjs";
import { distributionFromClients, profileDistributionFromClients } from "./hs2a-managerial.mjs";
import { gerencialCsvFilename, managerialRowsToCsv } from "./hs2a-export.mjs";
import { loadClientMonthlyHistory } from "./client-hs-history.mjs";
import { buildMonitoringDashboard, problemsExportRows } from "./monitoring/dashboard-payload.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadResearchHs2Snapshot() {
  const path = join(ROOT, "research", "modeling", "output", "etapa7_manifest.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

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
    const err = new Error(configError.message);
    err.code = configError.code;
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
      select: "id,name",
      order: "id.asc",
    });
  } catch {
    mecanismosCatalog = [];
  }

  const clients = filterExcludedClients(clientsRaw);
  const cancelMap = buildAnalyticalCancellationMap(cancellations, clients);
  const meetingStarts = [
    ...calendlyRows.map((row) => row.start_time),
    ...manualRows.map((row) => row.start_time),
  ].filter(Boolean);
  const data = {
    clients,
    calendlyRows,
    manualRows,
    mechanismRows,
    attendanceRows,
    npsRows,
    cancellations,
    cancelMap,
    mecanismosCatalog,
    meetingSpanMin: meetingStarts.length ? meetingStarts.reduce((a, b) => (a < b ? a : b)) : null,
    meetingSpanMax: meetingStarts.length ? meetingStarts.reduce((a, b) => (a > b ? a : b)) : null,
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
    mecanismosCatalog: raw.mecanismosCatalog,
    weights: activeWeights,
  });

  const eligible = filterHealthClients(allRows, filters);
  const filterOptions = buildFilterOptions(allRows);
  const researchAudit = buildResearchAudit(raw, allRows);
  researchAudit.population.rowsInCurrentFilter = eligible.length;
  researchAudit.population.appliedCluster = filters.cluster;
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
    researchAudit,
    note: "Dashboard experimental — não é score oficial definitivo de churn.",
    cacheTtlMs: CACHE_TTL_MS,
    hs2a: {
      version: HS2A_VERSION,
      formulaOficial: OFFICIAL_FORMULA_VERSION,
      interpretacaoOnly: true,
    },
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

  const aggregated = aggregateHealthScore(eligible, {
    weights,
    filters,
    filterOptions,
    metadata,
    nps: buildNpsAnalysis(eligible),
  });

  const researchSnap = loadResearchHs2Snapshot();
  aggregated.metadata.hs2aLab = {
    carteiraAtual: {
      hsDistribuicao: distributionFromClients(eligible),
      perfis: profileDistributionFromClients(eligible),
      qualidade: aggregated.hs2aManagerial?.qualidadeInformacional || [],
    },
    pesquisaHistorica: researchSnap?.comparison_summary || researchSnap?.highlights || null,
    nota: "Comparação descritiva — não extrapolar churn histórico como risco atual.",
  };

  return aggregated;
}

export async function getHealthScoreCsvResponse(query = {}) {
  const payload = await getHealthScoreResponse(query, { clientsOnly: true });
  const gerencial = query.export === "gerencial" || query.format === "gerencial";
  if (gerencial) {
    return {
      filename: gerencialCsvFilename(payload.filters?.applied?.cluster),
      csv: managerialRowsToCsv(payload.clients || [], { referenceDate: new Date() }),
    };
  }
  return {
    filename: csvFilename(payload.filters?.applied?.cluster),
    csv: rowsToCsv(payload.clients || []),
  };
}

export async function getClientHsHistory(clientId) {
  if (!clientId) return { error: "clientId obrigatório" };
  return loadClientMonthlyHistory(clientId);
}

export function clearHealthScoreCache() {
  cache = null;
}

function problemsToCsv(rows) {
  const header = [
    "codigo",
    "programa",
    "ep",
    "categoria",
    "tipo",
    "campo",
    "fonte",
    "evidencia",
    "prioridade",
    "causa_provavel",
    "acao_recomendada",
    "identificado_em",
    "perfil",
  ];
  const esc = (v) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.join(",")];
  for (const r of rows) lines.push(header.map((k) => esc(r[k])).join(","));
  return `${lines.join("\n")}\n`;
}

export async function getMonitoringSummary(query = {}) {
  const cluster = query.cluster || "ativos";
  const payload = await getHealthScoreResponse({ ...query, cluster }, { clientsOnly: true });
  const label = cluster === "ativos" ? "clientes ativos (cluster ativos)" : `cluster ${cluster}`;
  return buildMonitoringDashboard(payload.clients || [], { clusterLabel: label });
}

export async function getMonitoringProblemsCsv(query = {}) {
  const cluster = query.cluster || "ativos";
  const payload = await getHealthScoreResponse({ ...query, cluster }, { clientsOnly: true });
  const rows = problemsExportRows(payload.clients || []);
  const day = new Date().toISOString().slice(0, 10);
  return {
    filename: `qualidade-problemas-${cluster}-${day}.csv`,
    csv: problemsToCsv(rows),
  };
}
