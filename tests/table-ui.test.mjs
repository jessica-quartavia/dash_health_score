import assert from "node:assert/strict";
import test from "node:test";
import { paginate, DEFAULT_PAGE_SIZE } from "../public/table-ui.mjs";

test("paginate 20 linhas e rótulo de intervalo", () => {
  const items = Array.from({ length: 45 }, (_, i) => i);
  const pg = paginate(items, 2, DEFAULT_PAGE_SIZE);
  assert.equal(pg.pageSize, 20);
  assert.equal(pg.slice.length, 20);
  assert.equal(pg.slice[0], 20);
  assert.match(pg.rangeLabel, /21–40 de 45/);
});

test("paginação estado vazio", () => {
  const pg = paginate([], 1);
  assert.equal(pg.rangeLabel, "Nenhum registro");
  assert.equal(pg.pages, 1);
});
