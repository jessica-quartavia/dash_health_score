import assert from "node:assert/strict";
import test from "node:test";
import { PORTFOLIO_COLUMNS, resolvePortfolioCell } from "../public/portfolio-columns.mjs";

test("carteira resolve células virtuais 2.0A", () => {
  const row = { hs2a: { perfilLabel: "P1", qualidadeLabel: "Alta" }, clientName: "A" };
  assert.equal(resolvePortfolioCell(row, "hs2aPerfil"), "P1");
  assert.equal(resolvePortfolioCell(row, "hs2aQualidade"), "Alta");
});

test("cliente locked na coluna nome", () => {
  assert.ok(PORTFOLIO_COLUMNS.find((c) => c.id === "clientName")?.locked);
});
