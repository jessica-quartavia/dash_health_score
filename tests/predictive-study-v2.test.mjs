import assert from "node:assert/strict";
import test from "node:test";
import { loadPredictiveStudyV2, assertStudyV2Contract } from "../lib/research/predictive-study-v2.mjs";
import { renderResearchStudyV2 } from "../public/research-study-v2.mjs";

const ui = {
  escapeHtml: (s) => String(s ?? ""),
  formatNum: (n, d = 2) => (n == null ? "—" : Number(n).toFixed(d)),
  pctFmt: { format: (n) => String(n) },
  fmt: { format: (n) => String(n) },
  kpi: (a, b, c) => `<div>${a}</div>`,
  bars: () => "<div>b</div>",
  hBarMetrics: () => "<div>h</div>",
};

test("loader Estudo 2.0 quando artefato existe", () => {
  const pack = loadPredictiveStudyV2();
  if (!pack.ok) return;
  assert.equal(pack.study.status, "ok");
  assert.ok(pack.study.candidates?.length >= 3);
  assert.deepEqual(assertStudyV2Contract(pack.study), []);
});

test("UI Estudo 2.0 inclui comparação e auditoria", () => {
  const pack = loadPredictiveStudyV2();
  if (!pack.ok) return;
  const html = renderResearchStudyV2(pack, ui);
  assert.match(html, /Estudo Preditivo 2\.0/);
  assert.match(html, /ROC-AUC/);
  assert.match(html, /Auditoria/);
  assert.match(html, /v2_logistic/);
});
