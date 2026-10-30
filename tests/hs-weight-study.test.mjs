import assert from "node:assert/strict";
import test from "node:test";
import { buildHsWeightStudy } from "../lib/research/hs-weight-study.mjs";

test("grid de pesos tem 21 combinações e mantém 50/50 oficial", () => {
  const study = buildHsWeightStudy({ modeling: { status: "ok", ranking_test: [], models: {} } });
  assert.equal(study.grid.length, 21);
  assert.equal(study.grid.find((g) => g.official)?.engagementPercent, 50);
  assert.equal(study.recommendation.doNotChangeOperationalV1, true);
});

test("não proclama ótimo sem modeling ok", () => {
  const study = buildHsWeightStudy({});
  assert.equal(study.recommendation.decision, "insufficient_artifacts");
});
