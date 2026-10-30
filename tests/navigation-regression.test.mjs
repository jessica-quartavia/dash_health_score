import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  VIEW_IDS,
  shouldRefetchOnLeaveResearch,
  shouldRefetchOnEnterResearch,
} from "../lib/frontend/view-registry.mjs";
import { PORTFOLIO_COLUMNS } from "../public/portfolio-columns.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("todas as views do menu têm entrada em VIEWS no app.js", () => {
  const html = readFileSync(join(ROOT, "public/index.html"), "utf8");
  const app = readFileSync(join(ROOT, "public/app.js"), "utf8");
  const navViews = [...html.matchAll(/data-view="([^"]+)"/g)].map((m) => m[1]);
  for (const id of navViews) {
    assert.ok(VIEW_IDS.includes(id), `view ${id} ausente no registry`);
    assert.match(app, new RegExp(`${id}:`), `VIEWS sem chave ${id}`);
  }
});

test("safeRender trata cada view registrada", () => {
  const app = readFileSync(join(ROOT, "public/app.js"), "utf8");
  for (const id of VIEW_IDS) {
    if (id === "base") {
      assert.match(app, /renderBase\(payload\)/);
      continue;
    }
    const fn =
      id === "overview"
        ? "renderOverview"
        : id === "portfolio"
          ? "renderPortfolio"
          : id === "health"
            ? "renderHealth"
            : id === "evolution"
              ? "renderEvolution"
              : id === "engagement"
                ? "renderEngagement"
                : id === "mechanisms"
                  ? "renderMechanisms"
                  : id === "nps"
                    ? "renderNps"
                    : id === "quality"
                      ? "renderQuality"
                      : "renderResearch";
    assert.match(app, new RegExp(`state\\.view === "${id}"`), `branch ausente para ${id}`);
    assert.match(app, new RegExp(`${fn}`), `função ${fn} ausente`);
  }
});

test("refetch só ao entrar/sair de research (cluster)", () => {
  assert.equal(shouldRefetchOnLeaveResearch("research", "base"), true);
  assert.equal(shouldRefetchOnLeaveResearch("overview", "base"), false);
  assert.equal(shouldRefetchOnEnterResearch("overview", "research"), true);
});

test("colunas padrão da carteira são compactas", () => {
  const ids = PORTFOLIO_COLUMNS.filter((c) => c.default).map((c) => c.id);
  assert.ok(ids.includes("clientName"));
  assert.ok(ids.includes("healthScore"));
  assert.ok(ids.length <= 8, `esperado ≤8 colunas padrão, got ${ids.length}`);
  assert.ok(PORTFOLIO_COLUMNS.find((c) => c.id === "clientName")?.locked);
});

test("navegação para quality não zera cache de monitoring", () => {
  const app = readFileSync(join(ROOT, "public/app.js"), "utf8");
  assert.doesNotMatch(app, /next === "quality"[\s\S]{0,120}monitoringLoaded = false/);
  assert.match(app, /shouldRefetchOnLeaveResearch/);
});
