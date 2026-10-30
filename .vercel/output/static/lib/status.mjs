/**
 * Status analítico simplificado (regra oficial de cancelamento efetivado).
 * INTENÇÃO/PEDIDO NÃO tiram cliente da carteira ativa.
 */

import { blankToNull, foldText, parseDate } from "./utils.mjs";

export const ANALYTICAL_CANCEL_SELECT =
  "id,client_id,churn_efetivado_at,distrato_assinado_at,distrato,archived_at,updated_at,created_at";

export function isDistratoTextSigned(raw) {
  const t = foldText(raw);
  if (!t) return false;
  if (/\bnao\b/.test(t) || t.includes("pendente") || t.includes("aguardando")) return false;
  return t === "assinado";
}

export function normalizeClientStatus(rawStatus) {
  const token = foldText(rawStatus);
  if (!token || token === "null" || token === "undefined" || token === "vazio") {
    return "Não informado";
  }
  if (["ativo", "active", "ativa"].includes(token)) return "Ativo";
  if (
    ["churn", "cancelado", "cancelada", "canceled", "cancelled", "encerrado", "encerrada", "inativo", "inativa", "inactive"].includes(token)
    || token.includes("cancel")
    || token.includes("churn")
    || token.includes("encerr")
  ) {
    return "Cancelado";
  }
  if (
    ["congelado", "congelada", "freeze", "frozen", "pausado", "pausada"].includes(token)
    || token.includes("congel")
    || token.includes("pausad")
  ) {
    return "Congelado";
  }
  return "Não informado";
}

function getCancelFromRow(row) {
  if (!row || parseDate(row.archived_at)) {
    return { isCancelled: false, date: null, hasConfirmedDate: false };
  }
  const churnDate = parseDate(row.churn_efetivado_at);
  if (churnDate) return { isCancelled: true, date: churnDate, hasConfirmedDate: true };
  const signedDate = parseDate(row.distrato_assinado_at);
  if (signedDate) return { isCancelled: true, date: signedDate, hasConfirmedDate: true };
  if (isDistratoTextSigned(row.distrato)) {
    return { isCancelled: true, date: null, hasConfirmedDate: false };
  }
  return { isCancelled: false, date: null, hasConfirmedDate: false };
}

/**
 * Mapa client_id → { isCancelled, date, hasConfirmedDate }.
 * Une cancellations + clients.data_churn.
 */
export function buildAnalyticalCancellationMap(cancellations, clients = []) {
  const map = new Map();

  for (const row of cancellations || []) {
    const clientId = blankToNull(row.client_id);
    if (!clientId) continue;
    const key = String(clientId);
    const info = getCancelFromRow(row);
    if (!info.isCancelled) continue;
    const prev = map.get(key);
    if (!prev || (info.hasConfirmedDate && !prev.hasConfirmedDate) || (info.date && (!prev.date || info.date > prev.date))) {
      map.set(key, info);
    }
  }

  for (const client of clients || []) {
    const id = blankToNull(client?.id ?? client?.client_id);
    if (!id) continue;
    const key = String(id);
    const dataChurn = parseDate(client.data_churn);
    if (!dataChurn) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { isCancelled: true, date: dataChurn, hasConfirmedDate: true });
      continue;
    }
    if (!prev.date || dataChurn > prev.date) {
      map.set(key, {
        isCancelled: true,
        date: prev.hasConfirmedDate && prev.date ? prev.date : dataChurn,
        hasConfirmedDate: true,
      });
    } else if (!prev.hasConfirmedDate) {
      map.set(key, { isCancelled: true, date: dataChurn, hasConfirmedDate: true });
    }
  }

  return map;
}

export function resolveAnalyticalStatus(rawStatus, cancelInfo) {
  if (cancelInfo?.isCancelled) {
    return cancelInfo.hasConfirmedDate && cancelInfo.date ? "Cancelado" : "Cancelado efetivado sem data";
  }
  const normalized = normalizeClientStatus(rawStatus);
  if (normalized === "Cancelado") return "Marcado como cancelado sem confirmação";
  return normalized;
}

export function matchesAnalyticalStatusFilter(analyticalStatus, filterKeyOrLabel) {
  if (!filterKeyOrLabel || filterKeyOrLabel === "all") return true;
  const st = String(analyticalStatus || "");
  const key = String(filterKeyOrLabel).toLowerCase().trim().replace(/\s+/g, "_");

  if (key === "active" || key === "ativo" || filterKeyOrLabel === "Ativo") return st === "Ativo";
  if (key === "frozen" || key === "congelado") return st === "Congelado";
  if (key === "cancelled" || key === "cancelado") {
    return st === "Cancelado" || st === "Cancelado efetivado sem data";
  }
  if (key === "cancelled_no_date" || key === "marked_no_evidence") {
    return st === "Marcado como cancelado sem confirmação";
  }
  if (key === "unknown" || key === "nao_informado") return st === "Não informado";
  if (key === "active_or_frozen") return st === "Ativo" || st === "Congelado";
  return st === filterKeyOrLabel;
}

export const STATUS_FILTER_OPTIONS = [
  { value: "active", label: "Ativos" },
  { value: "active_or_frozen", label: "Ativos e congelados" },
  { value: "frozen", label: "Congelados" },
  { value: "cancelled", label: "Cancelados" },
  { value: "cancelled_no_date", label: "Marcados sem confirmação" },
  { value: "unknown", label: "Não informado" },
  { value: "all", label: "Todos" },
];
