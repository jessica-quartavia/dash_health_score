import assert from "node:assert/strict";
import test from "node:test";
import {
  ANALYTICAL_COLUMNS,
  resolveAnalyticalCell,
  analyticalSortValue,
  formatAnalyticalCellHtml,
} from "../public/analytical-columns.mjs";

test("colunas padrão base analítica são enxutas", () => {
  const defaults = ANALYTICAL_COLUMNS.filter((c) => c.default);
  assert.ok(defaults.length >= 5 && defaults.length <= 12);
  assert.ok(defaults.some((c) => c.id === "healthScore"));
});

test("resolve células virtuais hs2a", () => {
  const row = { hs2a: { perfilLabel: "P2", qualidadeLabel: "Parcial" }, clientName: "X" };
  const h = { formatDate: () => "—", formatNum: (n) => String(n), fmt: { format: String } };
  assert.equal(resolveAnalyticalCell(row, "hs2aPerfil", h), "P2");
  assert.equal(resolveAnalyticalCell(row, "hs2aQualidade", h), "Parcial");
});

test("distingue zero legítimo de ausente", () => {
  const h = { formatDate: () => "—", formatNum: (n) => String(n), fmt: { format: String } };
  const zero = {
    healthScore: 0,
    engagementScore: 0,
    mechanismScore: 0,
    finalClass: "Sem registro",
    npsScore: null,
  };
  assert.equal(analyticalSortValue(zero, "engagementScore"), 0);
  assert.equal(analyticalSortValue(zero, "npsScore"), null);
  const cellZero = formatAnalyticalCellHtml(zero, "engagementScore", h);
  assert.equal(cellZero.kind, "zero");
  const cellMiss = formatAnalyticalCellHtml(zero, "npsScore", h);
  assert.equal(cellMiss.kind, "missing");
});
