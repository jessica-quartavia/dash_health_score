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
