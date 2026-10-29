import assert from "node:assert/strict";
import test from "node:test";
import { buildResearchAudit, researchRowsForPopulation } from "../lib/research-audit.mjs";

test("buildResearchAudit agrega população e definições", () => {
  const raw = {
    clients: [{ id: 1, status: "ativo" }, { id: 2, status: "churn" }],
    cancellations: [{ archived_at: null }, { archived_at: "2024-01-01" }],
    counts: { clients: 2, cancellations: 2 },
    meetingSpanMin: "2024-01-01",
    meetingSpanMax: "2025-01-01",
  };
  const rows = [
    { hasCancellationEvidence: true, hasRenewed: false, npsScore: 9, analyticalStatus: "Ativo" },
    { hasCancellationEvidence: false, hasRenewed: true, npsScore: null, analyticalStatus: "Cancelado" },
  ];
  const audit = buildResearchAudit(raw, rows);
  assert.equal(audit.population.clientsLoaded, 2);
  assert.equal(audit.population.cancelEvidence, 1);
  assert.equal(audit.cancellationsTable.archivedRows, 1);
  assert.ok(audit.definitions.churnDashboard.includes("churn_efetivado"));
});

test("researchRowsForPopulation filtra clusters de estudo", () => {
  const rows = [
    { analyticalStatus: "Ativo", hasCancellationEvidence: false, hasRenewed: false },
    { analyticalStatus: "Cancelado", hasCancellationEvidence: true, hasRenewed: false },
    { analyticalStatus: "Ativo", hasCancellationEvidence: false, hasRenewed: true },
  ];
  assert.equal(researchRowsForPopulation(rows, "total").length, 3);
  assert.equal(researchRowsForPopulation(rows, "cancelados").length, 1);
  assert.equal(researchRowsForPopulation(rows, "renovados").length, 1);
});
