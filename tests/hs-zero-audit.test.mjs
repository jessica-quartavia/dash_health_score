import assert from "node:assert/strict";
import test from "node:test";
import { computeHealthScore, scoreEngagement, scoreMechanisms } from "../lib/scoring.mjs";
import { recomputeClientScores } from "../lib/frontend/weight-recompute.mjs";

test("HS zero legítimo quando E e M são zero", () => {
  assert.equal(scoreEngagement(0), 0);
  assert.equal(scoreMechanisms(0), 0);
  assert.equal(computeHealthScore(0, 0), 0);
});

test("HS ausente não vira zero no recompute — E/M undefined tratados como 0 na fórmula", () => {
  const [row] = recomputeClientScores([{ engagementScore: undefined, mechanismScore: undefined }], {
    engagement: 50,
    mechanism: 50,
  });
  assert.equal(row.healthScore, 0);
});

test("pesos 70/30 alteram HS sem mudar E/M base", () => {
  const base = { engagementScore: 100, mechanismScore: 0, daysSinceEntry: 200, currentCycle: 2, totalMeetings: 5, implementedCount: 0 };
  const a = recomputeClientScores([base], { engagement: 50, mechanism: 50 })[0];
  const b = recomputeClientScores([base], { engagement: 70, mechanism: 30 })[0];
  assert.equal(a.healthScore, 50);
  assert.equal(b.healthScore, 70);
  assert.equal(a.engagementScore, b.engagementScore);
});
