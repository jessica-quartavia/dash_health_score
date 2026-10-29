import { csvFilename } from "./clusters.mjs";

const GERENCIAL_HEADERS = [
  "Cliente",
  "Código",
  "Programa",
  "EP",
  "HS",
  "E",
  "M",
  "Classificação",
  "Fase",
  "Perfil interpretativo",
  "Qualidade informacional",
  "Cobertura reuniões",
  "Cobertura mecanismos",
  "Reuniões",
  "Mecanismos implantados",
  "Dias relacionamento (confiável)",
  "Data referência",
  "Versão fórmula",
  "Versão HS2A",
];

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[;"\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvDateIso(at = new Date()) {
  return at.toISOString().slice(0, 10);
}

export function managerialRowsToCsv(rows, { referenceDate = new Date() } = {}) {
  const ref = csvDateIso(referenceDate);
  const lines = [GERENCIAL_HEADERS.map(csvEscape).join(";")];
  for (const row of rows || []) {
    const h = row.hs2a || {};
    lines.push(
      [
        row.clientName,
        row.clientCode,
        row.program,
        row.engineer,
        row.healthScore,
        row.engagementScore,
        row.mechanismScore,
        row.finalClass,
        h.faseLabel,
        h.perfilLabel,
        h.qualidadeLabel,
        h.coberturaReunioes,
        h.coberturaMecanismos,
        row.totalMeetings,
        row.implementedCount,
        h.entradaConfiavel ? h.diasRelacionamento : "",
        ref,
        h.formulaOficial,
        h.version,
      ]
        .map(csvEscape)
        .join(";"),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function gerencialCsvFilename(clusterId, at = new Date()) {
  const base = csvFilename(clusterId, at).replace(".csv", "");
  return `${base}-gerencial-hs2a.csv`;
}
