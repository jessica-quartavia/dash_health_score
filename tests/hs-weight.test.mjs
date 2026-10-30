import assert from "node:assert/strict";
import test from "node:test";
import { snapEngagementWeight, weightsFromEngagement, isOfficialHsWeights } from "../lib/frontend/hs-weight.mjs";
import { applyWeightsToPayload, recomputeClientScores } from "../lib/frontend/weight-recompute.mjs";

test("slider aceita valores de 5 em 5 e soma 100", () => {
  for (const e of [0, 5, 25, 50, 75, 95, 100]) {
    const w = weightsFromEngagement(e);
    assert.equal(w.engagement + w.mechanism, 100);
    assert.equal(w.engagement % 5, 0);
  }
  assert.equal(snapEngagementWeight(47), 45);
  assert.equal(snapEngagementWeight(48), 50);
});

test("pesos 0/100 e 100/0 recalculam HS e KPI médio", () => {
  const row = {
    engagementScore: 80,
    mechanismScore: 20,
    daysSinceEntry: 200,
    currentCycle: 2,
    totalMeetings: 5,
    implementedCount: 1,
    healthScore: 50,
    finalClass: "Atenção",
  };
  const onlyE = recomputeClientScores([row], weightsFromEngagement(100));
  assert.equal(onlyE[0].healthScore, 80);
  const onlyM = recomputeClientScores([row], weightsFromEngagement(0));
  assert.equal(onlyM[0].healthScore, 20);
  const payload = applyWeightsToPayload(
    { clients: [row], summary: {}, healthDistribution: [] },
    weightsFromEngagement(100),
  );
  assert.equal(payload.summary.averageScore, 80);
});

test("oficial V1 apenas em 50/50", () => {
  assert.equal(isOfficialHsWeights({ engagement: 50, mechanism: 50 }), true);
  assert.equal(isOfficialHsWeights({ engagement: 75, mechanism: 25 }), false);
});
