/**
 * Filtros e opções do dashboard Health Score.
 */

import { foldText } from "./utils.mjs";
import { CLUSTER_FILTER_OPTIONS, belongsToCluster, normalizeCluster } from "./clusters.mjs";

export const PROGRAM_ALLOWLIST = ["Pharus", "Davos"];

export function normalizeProgramToken(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  if (/pharus/i.test(text)) return "Pharus";
  if (/davos/i.test(text)) return "Davos";
  return null;
}

export function programTokensFromRow(row) {
  const tokens = new Set();
  if (row?.davosContractSigned === true || row?.davos_contrato_assinado === true) {
    tokens.add("Davos");
  }
  const raw = row?.program ?? row?.programa ?? null;
  const values = Array.isArray(raw) ? raw : String(raw || "").split(/[;,|+]/);
  for (const value of values) {
    const normalized = normalizeProgramToken(value);
    if (normalized) tokens.add(normalized);
  }
  return tokens;
}

export function resolveClientProgram(client) {
  if (!client) return "Não informado";
  if (client.davosContractSigned === true || client.davos_contrato_assinado === true) return "Davos";
  const tokens = programTokensFromRow(client);
  if (tokens.has("Davos")) return "Davos";
  if (tokens.has("Pharus")) return "Pharus";
  return "Não informado";
}

export function programMatches(row, selected) {
  if (!selected || selected === "all") return true;
  if (selected === "Não informado") return row.program === "Não informado";
  const normalized = normalizeProgramToken(selected) || selected;
  return programTokensFromRow(row).has(normalized) || row.program === normalized;
}

export function compareWithUnknownLast(a, b) {
  const unknown = (value) => value === "Não informado";
  if (unknown(a) && !unknown(b)) return 1;
  if (!unknown(a) && unknown(b)) return -1;
  return String(a).localeCompare(String(b), "pt-BR");
}

function isoDay(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function matchesPeriod(row, from, to) {
  if (!from && !to) return true;
  const day = String(row?.entryDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export function matchesSearch(row, query) {
  const needle = foldText(query);
  if (!needle) return true;
  const hay = [row.clientName, row.clientCode, row.clientId].map(foldText).join(" ");
  return hay.includes(needle);
}

export function defaultFilters() {
  return {
    search: "",
    cluster: "ativos",
    ep: "all",
    program: "all",
    finalClass: "all",
    from: "",
    to: "",
  };
}

export function parseFiltersFromQuery(query = {}) {
  const defaults = defaultFilters();
  return {
    search: String(query.search || query.q || "").trim(),
    cluster: normalizeCluster(query.cluster || query.status || defaults.cluster),
    ep: String(query.ep || query.engineer || defaults.ep).trim() || defaults.ep,
    program: String(query.program || query.programa || defaults.program).trim() || defaults.program,
    finalClass: String(query.finalClass || query.classificacao || defaults.finalClass).trim() || defaults.finalClass,
    from: isoDay(query.from),
    to: isoDay(query.to),
  };
}

export function filterRecorteClients(clients, filters = {}) {
  const f = { ...defaultFilters(), ...filters };
  return (Array.isArray(clients) ? clients : []).filter((c) => {
    if (!belongsToCluster(c, f.cluster)) return false;
    if (f.ep !== "all" && c.engineer !== f.ep) return false;
    if (!programMatches(c, f.program)) return false;
    if (!matchesPeriod(c, f.from, f.to)) return false;
    if (!matchesSearch(c, f.search)) return false;
    return true;
  });
}

export function filterHealthClients(clients, filters = {}) {
  const f = { ...defaultFilters(), ...filters };
  return filterRecorteClients(clients, filters).filter((c) => {
    if (f.finalClass !== "all" && c.finalClass !== f.finalClass) return false;
    return true;
  });
}

export function buildFilterOptions(allClients) {
  const eps = new Set();
  for (const c of allClients || []) {
    if (c.engineer) eps.add(c.engineer);
  }
  return {
    cluster: CLUSTER_FILTER_OPTIONS,
    ep: [
      { value: "all", label: "Todos" },
      ...[...eps].sort(compareWithUnknownLast).map((v) => ({ value: v, label: v })),
    ],
    program: [
      { value: "all", label: "Todos" },
      ...PROGRAM_ALLOWLIST.map((v) => ({ value: v, label: v })),
      { value: "Não informado", label: "Não informado" },
    ],
    finalClass: [
      { value: "all", label: "Todas" },
      { value: "Em implantação", label: "Em implantação" },
      { value: "Sem registro", label: "Sem registro" },
      { value: "Saudável", label: "Saudável" },
      { value: "Atenção", label: "Atenção" },
      { value: "Crítico", label: "Crítico" },
    ],
  };
}
