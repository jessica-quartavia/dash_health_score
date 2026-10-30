/**
 * Histórico mensal reconstruído (export pesquisa) — somente leitura local.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { clientRef, pseudonymSecret } from "./predictive/pseudonym.mjs";

const EXPORT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "exports", "predictive-study");

function parseCsvLine(line, headers) {
  const obj = {};
  const parts = line.split(";");
  headers.forEach((h, i) => {
    obj[h] = (parts[i] || "").replace(/^\uFEFF/, "").trim();
  });
  return obj;
}

export function loadClientMonthlyHistory(clientId, { maxMonths = 18 } = {}) {
  const path = join(EXPORT_DIR, "hs_historico_mensal.csv");
  if (!existsSync(path)) return { available: false, reason: "export_ausente", points: [] };
  const cref = clientRef(clientId, pseudonymSecret(EXPORT_DIR));
  const raw = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  if (raw.length < 2) return { available: false, reason: "vazio", points: [] };
  const headers = raw[0].replace(/^\uFEFF/, "").split(";");
  const points = [];
  for (let i = 1; i < raw.length; i += 1) {
    const row = parseCsvLine(raw[i], headers);
    if (row.cliente_ref !== cref) continue;
    points.push({
      mes: row.mes_referencia,
      dataReferencia: row.data_referencia,
      hs: row.hs_historico === "" ? null : Number(row.hs_historico),
      e: row.engajamento_historico === "" ? null : Number(row.engajamento_historico),
      m: row.mecanismos_historico === "" ? null : Number(row.mecanismos_historico),
      reunioes: row.reunioes_acumuladas === "" ? null : Number(row.reunioes_acumuladas),
      mecanismos: row.mecanismos_implantados === "" ? null : Number(row.mecanismos_implantados),
      coberturaEng: row.cobertura_engajamento,
      coberturaMech: row.cobertura_mecanismos,
      confiabilidade: row.confiabilidade_reconstrucao,
      classificacao: row.classificacao_historica,
      fonte: "hs_historico_mensal_export",
    });
  }
  points.sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
  const trimmed = points.slice(-maxMonths);
  return {
    available: trimmed.length > 0,
    clienteRef: cref,
    points: trimmed,
    nota: "Série point-in-time da pesquisa; pode divergir do snapshot operacional após correções cadastrais.",
  };
}
