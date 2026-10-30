/** Utilitários testáveis do dashboard (sem DOM). */

export function barSharePercent(item) {
  if (item?.percent != null && Number.isFinite(Number(item.percent))) return Number(item.percent);
  if (item?.share != null && Number.isFinite(Number(item.share))) return Number(item.share) * 100;
  return 0;
}

export function normalizeHealthScorePayload(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "payload_invalido" };
  const clients = Array.isArray(body.clients) ? body.clients : [];
  return {
    ok: true,
    payload: {
      ...body,
      clients,
      summary: body.summary || {},
      filters: body.filters || { applied: {}, options: {} },
      metadata: body.metadata || {},
      hs2aManagerial: body.hs2aManagerial || null,
      hs2aComparisons: body.hs2aComparisons || null,
    },
  };
}

export function loadingStateAfterFetch({ ok, hasPayload }) {
  if (ok && hasPayload) return "ready";
  if (!ok && hasPayload) return "partial_error";
  if (!ok) return "critical_error";
  return "loading";
}
