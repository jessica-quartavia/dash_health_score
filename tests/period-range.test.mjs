import assert from "node:assert/strict";
import test from "node:test";
import {
  resolvePresetRange,
  formatPeriodLabel,
  PERIOD_PRESETS,
} from "../lib/frontend/period-range.mjs";

test("atalhos de período resolvem intervalo ISO", () => {
  const fixed = new Date("2026-10-23T12:00:00");
  const r7 = resolvePresetRange("7d", fixed);
  assert.equal(r7.to, "2026-10-23");
  assert.equal(r7.from, "2026-10-17");
  const all = resolvePresetRange("all", fixed);
  assert.equal(all.from, "");
  assert.equal(all.to, "");
});

test("rótulo de período legível", () => {
  assert.equal(formatPeriodLabel("", ""), "Todo o período");
  assert.equal(formatPeriodLabel("2026-01-01", "2026-01-31"), "2026-01-01 → 2026-01-31");
});

test("presets incluem atalhos solicitados", () => {
  const ids = PERIOD_PRESETS.map((p) => p.id);
  for (const id of ["today", "7d", "30d", "90d", "6m", "12m", "month", "year", "all", "custom"]) {
    assert.ok(ids.includes(id), id);
  }
});
