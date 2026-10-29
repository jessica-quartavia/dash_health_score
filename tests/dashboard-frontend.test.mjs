import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  barSharePercent,
  normalizeHealthScorePayload,
  loadingStateAfterFetch,
} from "../lib/frontend/dashboard-utils.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("app.js parseia sem erro de sintaxe (regressão ?? com ||)", () => {
  execSync("node --check public/app.js", { cwd: ROOT, stdio: "pipe" });
});

test("normalizeHealthScorePayload tolera campos opcionais ausentes", () => {
  const min = normalizeHealthScorePayload({ clients: [{ clientId: 1, healthScore: 50 }] });
  assert.equal(min.ok, true);
  assert.equal(min.payload.clients.length, 1);
  assert.equal(min.payload.hs2aManagerial, null);

  const bad = normalizeHealthScorePayload(null);
  assert.equal(bad.ok, false);
});

test("barSharePercent evita expressão inválida no template", () => {
  assert.equal(barSharePercent({ percent: 12.5 }), 12.5);
  assert.equal(barSharePercent({ share: 0.2 }), 20);
  assert.equal(barSharePercent({}), 0);
});

test("estados de loading concluem após sucesso ou falha", () => {
  assert.equal(loadingStateAfterFetch({ ok: true, hasPayload: true }), "ready");
  assert.equal(loadingStateAfterFetch({ ok: false, hasPayload: false }), "critical_error");
  assert.equal(loadingStateAfterFetch({ ok: false, hasPayload: true }), "partial_error");
});

test("period-utils presets alinhados ao seletor compartilhado", async () => {
  const { PERIOD_PRESETS } = await import("../public/period-utils.mjs");
  assert.ok(PERIOD_PRESETS.some((p) => p.id === "30d"));
  assert.ok(PERIOD_PRESETS.some((p) => p.id === "custom"));
});

test("tooltips expõem chaves principais", async () => {
  const { TOOLTIPS } = await import("../public/tooltips.mjs");
  assert.ok(TOOLTIPS.hs_medio);
  assert.ok(TOOLTIPS.qualidade_info);
});

test("payload mínimo suporta renderOverview (clientes array)", () => {
  const { payload } = normalizeHealthScorePayload({
    clients: [{ clientId: "a", clientName: "A", healthScore: 40, finalClass: "Atenção", program: "P", engineer: "E" }],
    summary: { averageScore: 40, attention: 1, critical: 0 },
    healthDistribution: [{ label: "Atenção", count: 1, percent: 100 }],
  });
  assert.ok(Array.isArray(payload.clients));
  assert.ok(payload.summary);
});
