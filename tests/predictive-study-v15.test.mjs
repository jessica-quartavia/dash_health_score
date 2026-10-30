import assert from "node:assert/strict";
import test from "node:test";
import { loadPredictiveStudyV15 } from "../lib/research/predictive-study-v15.mjs";
import { renderResearchStudyV15 } from "../public/research-study-v15.mjs";

const ui = {
  escapeHtml: (s) => String(s ?? ""),
  formatNum: (n, d = 3) => (n == null ? "—" : Number(n).toFixed(d)),
  pctFmt: { format: (n) => String(n) },
  fmt: { format: (n) => String(n) },
};

test("Etapa 15 — comparação justa E vs V2", () => {
  const pack = loadPredictiveStudyV15();
  if (!pack.ok) return;
  assert.equal(pack.study.fair_comparison.protocol.test_months.includes("2026-06"), true);
  const html = renderResearchStudyV15(pack, ui);
  assert.match(html, /Por que o modelo ainda não melhorou/);
  assert.match(html, /Comparação justa/);
});
