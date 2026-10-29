import assert from "node:assert/strict";
import test from "node:test";
import { recomputeClientScores, applyWeightsToPayload } from "../lib/frontend/weight-recompute.mjs";

test("pesos alteram healthScore e média agregada", () => {
  const rows = [
    {
      engagementScore: 100,
      mechanismScore: 0,
      daysSinceEntry: 200,
      currentCycle: 2,
      totalMeetings: 5,
      implementedCount: 0,
      healthScore: 50,
      finalClass: "Atenção",
    },
  ];
  const heavyE = recomputeClientScores(rows, { engagement: 100, mechanism: 0 });
  assert.equal(heavyE[0].healthScore, 100);
  const heavyM = recomputeClientScores(rows, { engagement: 0, mechanism: 100 });
  assert.equal(heavyM[0].healthScore, 0);
  const payload = applyWeightsToPayload({ clients: rows, summary: {} }, { engagement: 100, mechanism: 0 });
  assert.equal(payload.summary.averageScore, 100);
});
