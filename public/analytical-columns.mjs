/** Base Analítica — grupos de colunas configuráveis (sessão). */



export const ANALYTICAL_GROUPS = [

  { id: "cadastro", label: "Cadastro" },

  { id: "hs", label: "Health Score" },

  { id: "engagement", label: "Engajamento" },

  { id: "mechanisms", label: "Mecanismos" },

  { id: "satisfaction", label: "Satisfação" },

  { id: "contracts", label: "Contrato" },

  { id: "churn", label: "Churn / evidências" },

  { id: "quality", label: "Qualidade" },

  { id: "history", label: "Histórico" },

];



export const ANALYTICAL_COLUMNS = [

  { id: "clientName", label: "Cliente", group: "cadastro", default: true, locked: true, sortKey: "clientName" },

  { id: "clientCode", label: "Código", group: "cadastro", default: false },

  { id: "program", label: "Programa", group: "cadastro", default: true },

  { id: "engineer", label: "EP", group: "cadastro", default: true },

  { id: "analyticalStatus", label: "Status analítico", group: "cadastro", default: true },

  { id: "status", label: "Status BASE", group: "cadastro", default: false },

  { id: "entryDate", label: "Entrada", group: "cadastro", default: false, virtual: true },

  { id: "entrySource", label: "Fonte entrada", group: "cadastro", default: false },

  { id: "daysSinceEntry", label: "Dias de casa", group: "cadastro", default: false },

  { id: "cycleDate", label: "Ref. ciclo", group: "contracts", default: false, virtual: true },

  { id: "cycleSource", label: "Fonte ciclo", group: "contracts", default: false },

  { id: "currentCycle", label: "Ciclo", group: "contracts", default: false },

  { id: "cycleDays", label: "Dias no ciclo", group: "contracts", default: false },

  { id: "davosContrato", label: "DAVOS assinado", group: "contracts", default: false, virtual: true },

  { id: "healthScore", label: "HS", group: "hs", default: true, sortKey: "healthScore" },

  { id: "engagementScore", label: "E", group: "hs", default: true },

  { id: "engagementLabel", label: "Faixa E", group: "hs", default: false },

  { id: "mechanismScore", label: "M", group: "hs", default: true },

  { id: "mechanismLabel", label: "Faixa M", group: "hs", default: false },

  { id: "finalClass", label: "Classificação", group: "hs", default: true },

  { id: "hs2aPerfil", label: "Perfil 2.0A", group: "hs", default: false, virtual: true },

  { id: "hs2aQualidade", label: "Qualidade dados", group: "hs", default: true, virtual: true },

  { id: "hs2aConfiabilidade", label: "Confiabilidade", group: "hs", default: false, virtual: true },

  { id: "totalMeetings", label: "Reuniões", group: "engagement", default: false },

  { id: "avgMeetingsPerMonth", label: "Média/mês", group: "engagement", default: false },

  { id: "lastMeetingAt", label: "Última reunião", group: "engagement", default: false, virtual: true },

  { id: "daysSinceLastMeeting", label: "Recência (d)", group: "engagement", default: false },

  { id: "reunioes30d", label: "Reuniões 30d", group: "engagement", default: false },

  { id: "medianIntervalDays", label: "Intervalo mediano", group: "engagement", default: false },

  { id: "attendanceRate", label: "Presença %", group: "engagement", default: false, virtual: true },

  { id: "attendanceTracked", label: "Reuniões rastreadas", group: "engagement", default: false },

  { id: "implementedCount", label: "Mec. implantados", group: "mechanisms", default: false },

  { id: "inProgressCount", label: "Em andamento", group: "mechanisms", default: false },

  { id: "mechanismTypes", label: "Tipos mec.", group: "mechanisms", default: false, virtual: true },

  { id: "npsScore", label: "NPS", group: "satisfaction", default: false },

  { id: "npsClass", label: "Faixa NPS", group: "satisfaction", default: false },

  { id: "npsSubmittedAt", label: "Data NPS", group: "satisfaction", default: false, virtual: true },

  { id: "hasRenewed", label: "Renovou (flag)", group: "contracts", default: false, virtual: true },

  { id: "renewalCount", label: "Renovações", group: "contracts", default: false },

  { id: "hasCancellationEvidence", label: "Evid. cancel.", group: "churn", default: false, virtual: true },

  { id: "cancellationDate", label: "Data cancel.", group: "churn", default: false, virtual: true },

];



export const ANALYTICAL_COLUMNS_KEY = "ha3_analytical_columns_v1";



export function loadAnalyticalColumnIds() {

  try {

    const raw = sessionStorage.getItem(ANALYTICAL_COLUMNS_KEY);

    if (!raw) return ANALYTICAL_COLUMNS.filter((c) => c.default).map((c) => c.id);

    const ids = JSON.parse(raw);

    if (!Array.isArray(ids) || !ids.length) return ANALYTICAL_COLUMNS.filter((c) => c.default).map((c) => c.id);

    const locked = ANALYTICAL_COLUMNS.filter((c) => c.locked).map((c) => c.id);

    return [...new Set([...locked, ...ids.filter((id) => ANALYTICAL_COLUMNS.some((c) => c.id === id))])];

  } catch {

    return ANALYTICAL_COLUMNS.filter((c) => c.default).map((c) => c.id);

  }

}



export function saveAnalyticalColumnIds(ids) {

  sessionStorage.setItem(ANALYTICAL_COLUMNS_KEY, JSON.stringify(ids));

}



const NUMERIC_SORT_IDS = new Set([
  "healthScore",
  "engagementScore",
  "mechanismScore",
  "totalMeetings",
  "avgMeetingsPerMonth",
  "daysSinceLastMeeting",
  "reunioes30d",
  "medianIntervalDays",
  "implementedCount",
  "inProgressCount",
  "npsScore",
  "renewalCount",
  "daysSinceEntry",
  "cycleDays",
  "currentCycle",
  "attendanceRate",
  "attendanceTracked",
]);

export function analyticalSortValue(row, columnId) {
  if (columnId === "healthScore") return Number(row.healthScore);
  if (NUMERIC_SORT_IDS.has(columnId)) {
    const v = row[columnId];
    return v == null || v === "" ? null : Number(v);
  }
  if (columnId === "hs2aPerfil") return row.hs2a?.perfilLabel ?? "";
  if (columnId === "hs2aQualidade" || columnId === "hs2aConfiabilidade") return row.hs2a?.qualidadeLabel ?? "";
  if (columnId === "entryDate") return row.entryDate ?? "";
  if (columnId === "cycleDate") return row.cycleDate ?? "";
  if (columnId === "lastMeetingAt") return row.lastMeetingAt ?? "";
  if (columnId === "npsSubmittedAt") return row.npsSubmittedAt ?? "";
  if (columnId === "cancellationDate") return row.cancellationDate ?? "";
  if (columnId === "mechanismTypes") return (row.mechanismTypes || []).join(", ");
  if (columnId === "hasRenewed") return row.hasRenewed ? 1 : 0;
  if (columnId === "hasCancellationEvidence") return row.hasCancellationEvidence ? 1 : 0;
  if (columnId === "davosContrato") return row.davos_contrato_assinado ? 1 : 0;
  const v = row[columnId];
  return v == null || v === "" ? "" : v;
}

/** HTML da célula (0, —, n/a) — HS usa hsScoreCell no app. */
export function formatAnalyticalCellHtml(row, columnId, helpers, { hsScoreCell } = {}) {
  if (columnId === "healthScore" && hsScoreCell) return hsScoreCell(row);
  if (columnId === "finalClass") {
    const cls = row.finalClass ?? "—";
    return cls;
  }
  const raw = analyticalSortValue(row, columnId);
  if (raw === "" || raw == null || (typeof raw === "number" && Number.isNaN(raw))) {
    if (row.finalClass === "Em implantação" && (columnId === "npsScore" || columnId === "npsClass")) {
      return { kind: "na", text: "n/a" };
    }
    return { kind: "missing", text: "—" };
  }
  if (typeof raw === "number" && raw === 0 && NUMERIC_SORT_IDS.has(columnId)) {
    return { kind: "zero", text: "0" };
  }
  if (columnId === "finalClass") return { kind: "text", text: String(raw) };
  const display = resolveAnalyticalCell(row, columnId, helpers);
  return { kind: "text", text: String(display) };
}

export function resolveAnalyticalCell(row, columnId, helpers) {

  const h = row.hs2a || {};

  if (columnId === "hs2aPerfil") return h.perfilLabel || "—";

  if (columnId === "hs2aQualidade") return h.qualidadeLabel || "—";

  if (columnId === "hs2aConfiabilidade") return h.qualidadeLabel || "—";

  if (columnId === "entryDate") return helpers.formatDate(row.entryDate);

  if (columnId === "cycleDate") return helpers.formatDate(row.cycleDate);

  if (columnId === "lastMeetingAt") return helpers.formatDate(row.lastMeetingAt);

  if (columnId === "npsSubmittedAt") return helpers.formatDate(row.npsSubmittedAt);

  if (columnId === "mechanismTypes") return (row.mechanismTypes || []).join(", ") || "—";

  if (columnId === "attendanceRate") {

    return row.attendanceRate == null ? "—" : `${helpers.formatNum(row.attendanceRate, 0)}%`;

  }

  if (columnId === "hasRenewed") return row.hasRenewed ? "Sim" : row.currentCycle > 1 ? "Ciclo>1" : "Não";

  if (columnId === "hasCancellationEvidence") return row.hasCancellationEvidence ? "Sim" : "Não";

  if (columnId === "cancellationDate") return helpers.formatDate(row.cancellationDate);

  if (columnId === "davosContrato") return row.davos_contrato_assinado ? "Sim" : "Não";

  if (columnId === "status") return row.status || "—";

  const v = row[columnId];

  if (v == null || v === "") return "—";

  return v;

}

