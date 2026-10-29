/** Consultas gerenciais — só runs concluídos com snapshots completos; exclui smoke Etapa 12. */

export const SMOKE_REFERENCE_DATE_CUTOFF = "2090-01-01";

/** PostgREST filter fragment (AND). */
export function reportingRunQuerySuffix() {
  return [
    "status=eq.success",
    "snapshot_rows=gt.0",
    `reference_date=lt.${SMOKE_REFERENCE_DATE_CUTOFF}`,
  ].join("&");
}

export function shouldSkipIdempotentRun(existing) {
  if (!existing) return false;
  if (existing.status !== "success") return false;
  const rows = existing.snapshot_rows ?? 0;
  const clients = existing.client_count ?? 0;
  if (rows <= 0) return false;
  if (clients > 0 && rows !== clients) return false;
  return true;
}
