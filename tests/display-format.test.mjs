import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNoInvalidNumbers,
  finiteNumber,
  formatCount,
  formatPercentFromRate,
} from "../lib/frontend/display-format.mjs";

test("finiteNumber rejeita NaN e undefined", () => {
  assert.equal(finiteNumber(undefined), null);
  assert.equal(finiteNumber(NaN), null);
  assert.equal(finiteNumber("12"), 12);
});

test("formatCount não emite NaN", () => {
  const fmt = new Intl.NumberFormat("pt-BR");
  assert.equal(formatCount(fmt, undefined), "—");
  assert.equal(formatCount(fmt, NaN), "—");
  assert.match(formatCount(fmt, 18638), /18/);
});

test("formatPercentFromRate com taxa ausente", () => {
  const pctFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
  assert.equal(formatPercentFromRate(pctFmt, null), "—");
  assert.match(formatPercentFromRate(pctFmt, 0.306), /30/);
});

test("assertNoInvalidNumbers detecta NaN", () => {
  const issues = assertNoInvalidNumbers({ a: 1, b: NaN });
  assert.deepEqual(issues, ["b"]);
});
