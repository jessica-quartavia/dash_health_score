/**
 * Recortes da tela de Health Score: Ativos, Renovados, Cancelados e Total.
 */

export const CLUSTER_IDS = ["ativos", "renovados", "cancelados", "total"];

export const CLUSTER_FILTER_OPTIONS = [
  { value: "ativos", label: "Ativos" },
  { value: "renovados", label: "Renovados" },
  { value: "cancelados", label: "Cancelados" },
  { value: "total", label: "Total" },
];

export const CSV_HEADERS = [
  "Cliente",
  "Código",
  "EP",
  "Status",
  "Programa",
  "Ciclo atual",
  "Renovado",
  "Data de cancelamento",
  "Reuniões",
  "Média reuniões/mês",
  "Score S1",
  "Score S2",
  "Mecanismos implantados",
  "Score S3",
  "Score S4",
  "Health Score",
  "Classificação",
];

export function normalizeCluster(raw) {
  const key = String(raw || "").trim().toLowerCase();
  if (CLUSTER_IDS.includes(key)) return key;
  if (key === "active" || key === "ativo") return "ativos";
  if (key === "cancelled" || key === "cancelado") return "cancelados";
  if (key === "all" || key === "todos") return "total";
  return "ativos";
}

export function belongsToCluster(row, clusterId) {
  const id = normalizeCluster(clusterId);
  if (id === "total") return true;
  if (id === "ativos") return row?.analyticalStatus === "Ativo";
  if (id === "renovados") return Boolean(row?.hasRenewed);
  if (id === "cancelados") return Boolean(row?.hasCancellationEvidence);
  return false;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[;"\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvNumber(value, digits) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(digits).replace(".", ",");
}

function csvDate(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getUTCFullYear()}`;
}

export function clusterRowToCsvFields(row) {
  return [
    row.clientName ?? "",
    row.clientCode ?? "",
    row.engineer ?? "",
    row.analyticalStatus ?? row.status ?? "",
    row.program ?? "",
    row.currentCycle == null ? "" : String(row.currentCycle),
    row.hasRenewed ? "sim" : "não",
    csvDate(row.cancellationDate),
    csvNumber(row.totalMeetings ?? 0, 0),
    csvNumber(row.avgMeetingsPerMonth, 2),
    csvNumber(row.s1Score, 0),
    csvNumber(row.s2Score, 0),
    csvNumber(row.implementedCount ?? 0, 0),
    csvNumber(row.s3Score, 0),
    csvNumber(row.s4Score, 0),
    csvNumber(row.healthScore, 1),
    row.finalClass ?? "",
  ];
}

export function rowsToCsv(rows) {
  const lines = [CSV_HEADERS.map(csvEscape).join(";")];
  for (const row of rows || []) {
    lines.push(clusterRowToCsvFields(row).map(csvEscape).join(";"));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function csvFilename(clusterId, at = new Date()) {
  const id = normalizeCluster(clusterId);
  const y = at.getUTCFullYear();
  const m = String(at.getUTCMonth() + 1).padStart(2, "0");
  const d = String(at.getUTCDate()).padStart(2, "0");
  return `health-score-${id}-${y}-${m}-${d}.csv`;
}
