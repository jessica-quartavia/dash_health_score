import assert from "node:assert/strict";
import test from "node:test";
import { buildClientHealthRow } from "../lib/health-score.mjs";
import { computeHealthScore } from "../lib/scoring.mjs";
import { snapshotFromClients, recomputeClientScores } from "../lib/frontend/weight-recompute.mjs";

function sampleRow(e, m, meetings = 0, mechs = 0) {
  return buildClientHealthRow({
    client: { id: "1", name: "Test", status: "Ativo", programa: "PHARUS", created_at: "2020-01-01T00:00:00Z", ciclo: 2 },
    calendlyByClient: new Map(),
    manualByClient: new Map(),
    implementedByClient: new Map([["1", mechs]]),
    cancelMap: new Map(),
    npsByClient: new Map(),
    now: new Date("2026-06-01T00:00:00Z"),
  });
}

test("HS zero legítimo quando E e M são zero", () => {
  const row = sampleRow(0, 0, 0, 0);
  assert.equal(row.engagementScore, 0);
  assert.equal(row.mechanismScore, 0);
  assert.equal(row.healthScore, 0);
});

test("recomputeClientScores aplica pesos experimentais", () => {
  const row = { ...sampleRow(0, 0, 0, 0), engagementScore: 100, mechanismScore: 60, totalMeetings: 2, implementedCount: 2 };
  const [a] = recomputeClientScores([row], { engagement: 70, mechanism: 30 });
  const expected = computeHealthScore(100, 60, { engagement: 0.7, mechanism: 0.3 });
  assert.equal(a.healthScore, expected);
});

test("snapshotFromClients reflete recorte filtrado", () => {
  const r1 = { ...sampleRow(100, 100, 5, 5), finalClass: "Saudável", healthScore: 100 };
  const r2 = { ...sampleRow(0, 0, 0, 0), finalClass: "Sem registro", healthScore: 0 };
  const snap = snapshotFromClients([r1, r2], { engagement: 50, mechanism: 50 });
  assert.equal(snap.summary.totalClients, 2);
  assert.ok(snap.healthDistribution.length >= 1);
});
