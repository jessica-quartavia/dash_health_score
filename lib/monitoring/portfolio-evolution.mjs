import { businessHistoryAvailable, listSnapshotTrend, listReportingRunIds } from "./business-data-read.mjs";
import { SMOKE_REFERENCE_DATE_CUTOFF } from "../business-data/reporting-filters.mjs";
import { bdSelect } from "../business-data/rest.mjs";
import { compareSnapshotPopulations } from "../frontend/health-evolution-analytics.mjs";
import { stableClientRef } from "./snapshot-store.mjs";

async function fetchSnapshotsForDays(referenceDays, population) {
  if (!referenceDays.length || !businessHistoryAvailable()) return [];
  const runIds = await listReportingRunIds({ limit: 48 });
  if (!runIds.length) return [];
  const inRuns = runIds.map((id) => encodeURIComponent(id)).join(",");
  const inDays = referenceDays.map((d) => encodeURIComponent(d)).join(",");
  const q = `reference_date=in.(${inDays})&population=eq.${encodeURIComponent(population)}&reference_date=lt.${SMOKE_REFERENCE_DATE_CUTOFF}&run_id=in.(${inRuns})&select=reference_date,client_ref,health_score,engagement_score,mechanism_score,final_class,program,engineer&limit=80000`;
  return bdSelect("client_snapshots", { query: q });
}

function rowToPoint(r) {
  return {
    hs: r.health_score != null ? Number(r.health_score) : null,
    e: r.engagement_score != null ? Number(r.engagement_score) : null,
    m: r.mechanism_score != null ? Number(r.mechanism_score) : null,
    classe: r.final_class,
    program: r.program,
    engineer: r.engineer,
  };
}

function filterRows(rows, { program, engineer, clientRefSet }) {
  return (rows || []).filter((r) => {
    if (clientRefSet && !clientRefSet.has(r.client_ref)) return false;
    if (program && program !== "all" && (r.program || "Não informado") !== program) return false;
    if (engineer && engineer !== "all" && (r.engineer || "Não informado") !== engineer) return false;
    return true;
  });
}

function mapByRef(rows) {
  const m = new Map();
  for (const r of rows || []) {
    m.set(r.client_ref, rowToPoint(r));
  }
  return m;
}

export async function getPortfolioEvolutionSummary({
  population = "ativos",
  program = "all",
  engineer = "all",
  clientRefs = null,
  clientIds = null,
} = {}) {
  let refSet = clientRefs?.length ? new Set(clientRefs) : null;
  if (!refSet && clientIds?.length) {
    refSet = new Set(clientIds.map((id) => stableClientRef(id)));
  }
  if (!businessHistoryAvailable()) {
    return { ok: false, comparable: false, reason: "not_configured" };
  }
  try {
    const trend = await listSnapshotTrend({ population, limit: 48 });
    const days = [...new Set((trend || []).map((t) => t.dia))].sort();
    if (days.length < 2) {
      return {
        ok: true,
        comparable: false,
        snapshotCount: days.length,
        message: days.length ? "Aguardando nova referência comparável." : "Sem snapshots persistidos.",
      };
    }
    const prevDay = days[days.length - 2];
    const nextDay = days[days.length - 1];
    const raw = await fetchSnapshotsForDays([prevDay, nextDay], population);
    const prevRows = filterRows(
      raw.filter((r) => r.reference_date === prevDay),
      { program, engineer, clientRefSet: refSet },
    );
    const nextRows = filterRows(
      raw.filter((r) => r.reference_date === nextDay),
      { program, engineer, clientRefSet: refSet },
    );
    const insight = compareSnapshotPopulations(mapByRef(prevRows), mapByRef(nextRows));
    return {
      ok: true,
      comparable: true,
      prevDay,
      nextDay,
      snapshotCount: days.length,
      population,
      formulaNote: "HS histórico persistido com fórmula congelada da execução (oficial 50/50) — independente dos pesos experimentais na interface.",
      ...insight,
    };
  } catch (error) {
    return { ok: false, comparable: false, error: error.message };
  }
}
