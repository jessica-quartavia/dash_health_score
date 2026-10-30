/**
 * Fonte única de verdade para ciclo / renovação (BASE QV · clients.ciclo).
 * Regra oficial do portal:
 *   hasRenewed = currentCycle > 1
 *   renewalCount = max(currentCycle - 1, 0)
 */

export function parseCurrentCycle(clientOrRaw) {
  const raw =
    clientOrRaw != null && typeof clientOrRaw === "object"
      ? (clientOrRaw.currentCycle ?? clientOrRaw.ciclo ?? clientOrRaw.cycle)
      : clientOrRaw;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function renewalFromCycle(cycle) {
  if (cycle == null || !Number.isFinite(cycle)) {
    return { currentCycle: null, renewalCount: 0, hasRenewed: false, valid: false };
  }
  const c = Math.trunc(cycle);
  if (c <= 0) {
    return { currentCycle: c, renewalCount: 0, hasRenewed: false, valid: false };
  }
  const hasRenewed = c > 1;
  return {
    currentCycle: c,
    renewalCount: Math.max(c - 1, 0),
    hasRenewed,
    valid: true,
  };
}

export function renewalFromClient(client) {
  return renewalFromCycle(parseCurrentCycle(client));
}
