/**
 * Mecanismos implantados (BASE QV client_mecanismos).
 */

import { blankToNull, foldText, parseDate } from "./utils.mjs";

export function isImplementedStatus(rawStatus) {
  const token = foldText(rawStatus);
  return (
    token === "concluido"
    || token === "concluida"
    || token === "implementado"
    || token === "completed"
  );
}

export function dedupeClientMechanisms(rows) {
  const best = new Map();
  for (const row of rows || []) {
    const clientId = blankToNull(row.client_id);
    const mechanismId = blankToNull(row.mecanismo_id);
    if (!clientId) continue;
    const key = mechanismId ? `${clientId}|${mechanismId}` : `${clientId}|row:${row.id || Math.random()}`;
    const current = best.get(key);
    if (!current) {
      best.set(key, row);
      continue;
    }
    const aCreated = parseDate(row.created_at)?.getTime() || 0;
    const bCreated = parseDate(current.created_at)?.getTime() || 0;
    if (aCreated > bCreated) best.set(key, row);
  }
  return [...best.values()];
}

export function isDroppedMechanism(rawStatus) {
  const token = foldText(rawStatus);
  if (!token) return false;
  return (
    token === "cancelado"
    || token === "cancelada"
    || token === "canceled"
    || token === "cancelled"
    || token === "recusado"
    || token === "rejeitado"
    || token === "descartado"
    || token === "nao implementado"
    || token.includes("cancel")
  );
}

/** Implantados, em andamento e tipos por cliente. Não altera a regra de M. */
export function summarizeMechanismsByClient(cmRows = [], catalog = []) {
  const names = new Map();
  for (const item of catalog || []) {
    if (item?.id == null) continue;
    names.set(String(item.id), blankToNull(item.name) || blankToNull(item.nome) || "Não informado");
  }
  const map = new Map();
  for (const row of dedupeClientMechanisms(cmRows)) {
    const clientId = String(blankToNull(row.client_id) || "");
    if (!clientId) continue;
    const current = map.get(clientId) || { implemented: 0, inProgress: 0, types: [] };
    if (isImplementedStatus(row.status)) {
      current.implemented += 1;
      current.types.push(names.get(String(row.mecanismo_id || "")) || "Não informado");
    } else if (!isDroppedMechanism(row.status)) {
      current.inProgress += 1;
    }
    map.set(clientId, current);
  }
  return map;
}

/** Contagem de mecanismos implantados por client_id. */
export function countImplementedByClient(cmRows = []) {
  const map = new Map();
  for (const row of dedupeClientMechanisms(cmRows)) {
    if (!isImplementedStatus(row.status)) continue;
    const clientId = String(blankToNull(row.client_id) || "");
    if (!clientId) continue;
    map.set(clientId, (map.get(clientId) || 0) + 1);
  }
  return map;
}
