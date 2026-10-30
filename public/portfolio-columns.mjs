/** Colunas da Carteira de Clientes — toggles persistidos na sessão. */

export const PORTFOLIO_COLUMNS = [
  { id: "clientName", label: "Cliente", default: true, locked: true },
  { id: "program", label: "Programa", default: true },
  { id: "engineer", label: "EP", default: true },
  { id: "healthScore", label: "Health Score", default: true, sortKey: "healthScore" },
  { id: "finalClass", label: "Nível de saúde", default: true },
  { id: "hs2aQualidade", label: "Qualidade dos dados", default: true, virtual: true },
  { id: "hsDeltaLabel", label: "Evolução HS", default: true, virtual: true },
  { id: "clientCode", label: "Código", default: false },
  { id: "engagementScore", label: "E", default: false },
  { id: "mechanismScore", label: "M", default: false },
  { id: "analyticalStatus", label: "Status", default: false },
  { id: "hs2aPerfil", label: "Perfil 2.0A", default: false, virtual: true },
  { id: "lastMeetingAt", label: "Última reunião", default: false },
  { id: "totalMeetings", label: "Reuniões", default: false },
  { id: "daysSinceLastMeeting", label: "Recência", default: false },
  { id: "implementedCount", label: "Mecanismos", default: false },
  { id: "npsScore", label: "NPS", default: false },
  { id: "projectionLabel", label: "Projeção", default: false, virtual: true },
];

export const PORTFOLIO_COLUMNS_KEY = "ha3_portfolio_columns_v2";

export function loadVisibleColumnIds() {
  try {
    const raw = sessionStorage.getItem(PORTFOLIO_COLUMNS_KEY);
    if (!raw) return PORTFOLIO_COLUMNS.filter((c) => c.default).map((c) => c.id);
    const ids = JSON.parse(raw);
    if (!Array.isArray(ids) || !ids.length) return PORTFOLIO_COLUMNS.filter((c) => c.default).map((c) => c.id);
    const locked = PORTFOLIO_COLUMNS.filter((c) => c.locked).map((c) => c.id);
    return [...new Set([...locked, ...ids.filter((id) => PORTFOLIO_COLUMNS.some((c) => c.id === id))])];
  } catch {
    return PORTFOLIO_COLUMNS.filter((c) => c.default).map((c) => c.id);
  }
}

export function saveVisibleColumnIds(ids) {
  sessionStorage.setItem(PORTFOLIO_COLUMNS_KEY, JSON.stringify(ids));
}

export function resolvePortfolioCell(row, columnId) {
  if (columnId === "hs2aPerfil") return row.hs2a?.perfilLabel || "—";
  if (columnId === "hs2aQualidade") return row.hs2a?.qualidadeLabel || "—";
  if (columnId === "hsDeltaLabel") return row._hsDeltaLabel || "—";
  if (columnId === "projectionLabel") return row._projectionLabel || "Simulador";
  return row[columnId];
}
