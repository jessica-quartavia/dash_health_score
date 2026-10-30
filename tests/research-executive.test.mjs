import assert from "node:assert/strict";
import test from "node:test";
import { buildExecutiveConclusion, insightHsBands, LIMITATIONS_PLAIN } from "../public/research-executive.mjs";

test("conclusão executiva não promete previsão individual", () => {
  const text = buildExecutiveConclusion({
    kpis: { observedChurnRate90d: 0.3, observationsLabeled90d: 100, bestModelId: "E", evaluationPeriod: "2026-06" },
  });
  assert.match(text, /previsão individual/i);
  assert.match(text, /Modelo E/i);
  assert.match(text, /produção/i);
});

test("insight HS com faixas válidas", () => {
  const bands = [
    { band: "0-20", n: 100, churnRate: 0.4 },
    { band: "80-100", n: 50, churnRate: 0.05 },
  ];
  const s = insightHsBands(bands);
  assert.ok(s.length > 20);
});

test("limitações em linguagem simples", () => {
  assert.ok(LIMITATIONS_PLAIN.length >= 4);
  assert.ok(LIMITATIONS_PLAIN.some((l) => /individual/i.test(l)));
});
