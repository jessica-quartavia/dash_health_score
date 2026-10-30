import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { renderResearchLabHow } from "../public/research-lab-how.mjs";
import { renderResearchLabModel } from "../public/research-lab-model.mjs";
import { buildPredictiveLabReference } from "../lib/research/predictive-lab-reference.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ui = {
  escapeHtml: (s) => String(s ?? ""),
  formatNum: (n, d = 3) => (n == null ? "—" : Number(n).toFixed(d)),
  pctFmt: { format: (n) => String(n) },
  fmt: { format: (n) => String(n) },
  kpi: (l, v, s) => `<div>${l}:${v}:${s}</div>`,
};

test("Laboratório — quatro abas no app.js", () => {
  const app = readFileSync(join(ROOT, "public", "app.js"), "utf8");
  assert.match(app, /Visão executiva/);
  assert.match(app, /HS futuro/);
  assert.match(app, /Como funciona/);
  assert.match(app, /Modelo e limitações/);
  assert.doesNotMatch(app, /label: "Diagnóstico 15"/);
  assert.doesNotMatch(app, /label: "Metodologia avançada"/);
});

test("Laboratório — abas how e model renderizam", () => {
  const how = renderResearchLabHow(ui);
  assert.match(how, /regressão logística/i);
  const labPack = buildPredictiveLabReference(ROOT);
  const model = renderResearchLabModel({ labPack, loading: false }, ui);
  assert.match(model, /Modelo E/);
  assert.match(model, /experimental/i);
  assert.match(model, /Podemos confiar nas probabilidades/i);
  assert.doesNotMatch(model, /Artefatos de modelagem indisponíveis/i);
  const loading = renderResearchLabModel({ loading: true }, ui);
  assert.match(loading, /Carregando/i);
});

test("Laboratório — filtro descritivo removido da visão executiva", () => {
  const pano = readFileSync(join(ROOT, "public", "research-panorama.mjs"), "utf8");
  assert.doesNotMatch(pano, /Filtros do recorte descritivo/);
  assert.doesNotMatch(pano, /panoramaProgram/);
  const app = readFileSync(join(ROOT, "public", "app.js"), "utf8");
  assert.doesNotMatch(app, /researchPanoramaFilters/);
});

test("Laboratório — relatório usa métricas versionadas do lab pack", async () => {
  const { buildPredictiveExecutiveReportHtml } = await import("../lib/frontend/predictive-report-html.mjs");
  const labPack = buildPredictiveLabReference(ROOT);
  const panorama = {
    kpis: { horizonDays: 90, referenceModelId: "E", evaluationPeriod: "test" },
    descriptive: { observations: 1, filterLabel: "frozen" },
    profiles: [],
    models: [],
    datasetReconciliation: { rows: [] },
    versionKey: "v1",
    generatedAt: new Date().toISOString(),
  };
  const built = buildPredictiveExecutiveReportHtml(panorama, { engagement: 50, mechanism: 50 }, { labPack });
  assert.equal(built.ok, true);
  assert.match(built.bodyHtml, /Etapa 16|jun\/2026|2026-06/i);
  assert.match(built.bodyHtml, /Modelo E|justificativa/i);
  if (labPack.whyChosenPlain) assert.ok(built.bodyHtml.includes(labPack.whyChosenPlain.slice(0, 40)));
});
