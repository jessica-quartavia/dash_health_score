/** Resposta segura para n8n — sem credenciais nem payloads brutos da BASE QV. */
export function buildPipelineRunApiResponse({ result, startedAt, finishedAt }) {
  const bd = result.businessData || null;
  const idempotent = Boolean(bd?.idempotent || (bd?.skipped && bd?.ok !== false));
  const persistenceOk = bd == null ? null : bd.ok !== false || idempotent;

  return {
    ok: true,
    idempotent,
    persistenceOk,
    clientCount: result.clientCount,
    referenceDay: result.run?.referenceDay || bd?.referenceDay || null,
    durationMs: finishedAt && startedAt ? new Date(finishedAt).getTime() - new Date(startedAt).getTime() : null,
    run: {
      runId: result.run?.runId,
      status: result.run?.status,
      referenceDay: result.run?.referenceDay,
    },
    businessData: bd
      ? {
          ok: bd.ok !== false,
          skipped: Boolean(bd.skipped),
          idempotent: Boolean(bd.idempotent),
          runId: bd.runId,
          referenceDay: bd.referenceDay,
          snapshotRows: bd.snapshotRows,
          issueRows: bd.issueRows,
          freezeRows: bd.freezeRows,
          reason: bd.reason || null,
          error: bd.error || null,
        }
      : null,
  };
}
