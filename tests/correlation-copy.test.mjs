import assert from "node:assert/strict";
import test from "node:test";
import { describeCorrelation } from "../lib/frontend/correlation-copy.mjs";

test("correlação fraca positiva com amostra >= 30", () => {
  const d = describeCorrelation({ pearson: 0.22, sampleSize: 40, subject: "E e NPS" });
  assert.match(d.headline, /positiva/i);
  assert.match(d.detail, /não prova/i);
});

test("amostra pequena marca exploratório", () => {
  const d = describeCorrelation({ pearson: 0.5, sampleSize: 10 });
  assert.match(d.detail, /exploratório/i);
});
