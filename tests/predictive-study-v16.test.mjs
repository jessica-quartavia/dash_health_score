import assert from "node:assert/strict";
import test from "node:test";
import { loadPredictiveStudyV16 } from "../lib/research/predictive-study-v16.mjs";
import { renderResearchStudyV16 } from "../public/research-study-v16.mjs";

const ui = {
  escapeHtml: (s) => String(s ?? ""),
  formatNum: (n, d = 3) => (n == null ? "—" : Number(n).toFixed(d)),
  pctFmt: { format: (n) => String(n) },
  fmt: { format: (n) => String(n) },
};

test("Etapa 16 — validação temporal e modelos", () => {
  const pack = loadPredictiveStudyV16();
  if (!pack.ok) return;
  assert.notEqual(pack.study.temporal_validation?.holdout_month, "2026-06");
  assert.equal(pack.study.temporal_validation?.june_2026_role, "reference_only_not_used_for_selection");
  const html = renderResearchStudyV16(pack, ui);
  assert.match(html, /Etapa 16/);
  assert.match(html, /Modelos comparados/);
});
