/** Estados de leitura do Business Data — sem mascarar erro como lista vazia. */

export function describeBusinessDataPersistence({
  configured,
  ok,
  error,
  runs = [],
  trend = [],
  freezes = [],
  lastValidRun = null,
} = {}) {
  if (!configured) {
    return {
      state: "disconnected",
      label: "Business Data desconectado",
      detail: "Configure BUSINESS_SUPABASE_URL (ou AUTH no projeto rckpuebaiswrxzmywllv) e service role.",
    };
  }
  if (!ok) {
    return {
      state: "error",
      label: "Erro ao consultar Business Data",
      detail: error || "Falha de autenticação ou PostgREST.",
    };
  }
  const successRuns = (runs || []).filter((r) => r.status === "success" && (r.snapshot_rows ?? 0) > 0);
  if (!successRuns.length) {
    return {
      state: "connected_empty",
      label: "Conectado — sem runs válidas",
      detail: "Schema acessível, porém nenhuma execução success com snapshots.",
    };
  }
  const snapRows = lastValidRun?.snapshotRows ?? successRuns[0]?.snapshot_rows ?? 0;
  const distinctDays = trend?.length || 0;
  const freezeCount = freezes?.length || 0;
  if (distinctDays <= 1 && snapRows > 0) {
    return {
      state: "single_snapshot",
      label: "Histórico em formação",
      detail: `Referência ${lastValidRun?.referenceDate || successRuns[0]?.reference_date || "—"} · ${snapRows} snapshots · aguardando nova referência.`,
      snapshotRows: snapRows,
      freezeCount,
    };
  }
  if (distinctDays >= 2) {
    return {
      state: "comparable",
      label: "Snapshots comparáveis",
      detail: `${distinctDays} dias distintos · ${successRuns.length} run(s) válida(s).`,
      snapshotRows: snapRows,
      freezeCount,
    };
  }
  return {
    state: "connected_incomplete",
    label: "Runs incompletas",
    detail: "Há execuções, mas tendência agregada indisponível — verifique population e filtros.",
    snapshotRows: snapRows,
    freezeCount,
  };
}
