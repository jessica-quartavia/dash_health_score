/**
 * Filtros e opções do dashboard Health Score.
 */

import { foldText } from "./utils.mjs";
import { MODEL_COMPLETO, normalizeModel } from "./scoring.mjs";
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
  const normalized = normalizeProgramToken(selected) || selected;
  return programTokensFromRow(row).has(normalized) || row.program === normalized;
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
    situation: "all",
    model: MODEL_COMPLETO,
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
    situation: String(query.situation || query.situacao || defaults.situation).trim() || defaults.situation,
    model: normalizeModel(query.model || query.modelo || defaults.model),
  };
}

function matchesSituationFilter(client, situation) {
  if (!situation || situation === "all") return true;
  const raw = String(situation);
  const match = raw.match(/^s([1-4]):(.+)$/i);
  if (match) {
    const idx = match[1];
    const wanted = match[2].trim().toLowerCase();
    const key = client[`s${idx}Key`] || client[`s${idx}Label`] || "";
    return foldText(key) === foldText(wanted) || foldText(client[`s${idx}Label`]) === foldText(wanted);
  }
  return (
    foldText(client.s1Key) === foldText(raw)
    || foldText(client.s2Key) === foldText(raw)
    || foldText(client.s3Key) === foldText(raw)
    || foldText(client.s4Key) === foldText(raw)
    || foldText(client.finalClass) === foldText(raw)
  );
}

export function isMissingScoreData(row) {
  return (Number(row?.totalMeetings) || 0) === 0 && (Number(row?.implementedCount) || 0) === 0;
}

export function filterRecorteClients(clients, filters = {}) {
  const f = { ...defaultFilters(), ...filters };
  return (Array.isArray(clients) ? clients : []).filter((c) => {
    if (!belongsToCluster(c, f.cluster)) return false;
    if (f.ep !== "all" && c.engineer !== f.ep) return false;
    if (!programMatches(c, f.program)) return false;
    if (!matchesSearch(c, f.search)) return false;
    return true;
  });
}

export function partitionScoreSample(clients, filters = {}) {
  const recorte = filterRecorteClients(clients, filters);
  const discarded = [];
  const withData = [];
  for (const row of recorte) {
    if (isMissingScoreData(row)) discarded.push(row);
    else withData.push(row);
  }
  const f = { ...defaultFilters(), ...filters };
  const eligible = withData.filter((c) => {
    if (f.finalClass !== "all" && f.finalClass !== "Risco" && c.finalClass !== f.finalClass) return false;
    if (f.finalClass === "Risco") return false;
    if (!matchesSituationFilter(c, f.situation)) return false;
    return true;
  });
  return { discarded, eligible };
}

export function filterHealthClients(clients, filters = {}) {
  return partitionScoreSample(clients, filters).eligible;
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
      ...[...eps].sort((a, b) => a.localeCompare(b, "pt-BR")).map((v) => ({ value: v, label: v })),
    ],
    program: [
      { value: "all", label: "Todos" },
      ...PROGRAM_ALLOWLIST.map((v) => ({ value: v, label: v })),
    ],
    finalClass: [
      { value: "all", label: "Todas" },
      { value: "Saudável", label: "Saudável" },
      { value: "Atenção", label: "Atenção" },
      { value: "Crítico", label: "Crítico" },
    ],
    model: [
      { value: "completo", label: "Modelo Completo" },
      { value: "simplificado", label: "Modelo Simplificado" },
    ],
    situation: [
      { value: "all", label: "Todas" },
      { value: "s1:Saudável", label: "S1 · Saudável" },
      { value: "s1:Atenção", label: "S1 · Atenção" },
      { value: "s1:Crítico", label: "S1 · Crítico" },
      { value: "s1:Fase natural de acompanhamento", label: "S1 · Fase natural" },
      { value: "s2:Saudável", label: "S2 · Saudável" },
      { value: "s2:Atenção", label: "S2 · Atenção" },
      { value: "s2:Crítico", label: "S2 · Crítico" },
      { value: "s3:Saudável", label: "S3 · Saudável" },
      { value: "s3:Atenção", label: "S3 · Atenção" },
      { value: "s3:Crítico", label: "S3 · Crítico" },
      { value: "s3:Fase natural de implantação", label: "S3 · Fase natural" },
      { value: "s4:Saudável", label: "S4 · Saudável" },
      { value: "s4:Crítico", label: "S4 · Crítico" },
      { value: "s4:Fase natural de implantação", label: "S4 · Fase natural" },
    ],
  };
}
