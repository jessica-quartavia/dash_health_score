import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadPredictiveStudyV17 } from "../lib/research/predictive-study-v17.mjs";
import { buildPredictiveLabReference } from "../lib/research/predictive-lab-reference.mjs";
import { renderResearchLabModel } from "../public/research-lab-model.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ui = {
  escapeHtml: (s) => String(s ?? ""),
  formatNum: (n, d = 3) => (n == null ? "—" : Number(n).toFixed(d)),
  fmt: { format: (n) => String(n) },
};

test("Etapa 17 — artefato e lab pack", () => {
  const pack = loadPredictiveStudyV17(ROOT);
  if (!pack.ok) {
    assert.match(pack.error, /study-v17|ausente/i);
    return;
  }
  assert.equal(pack.data.status, "ok");
  assert.ok(pack.data.conclusion_abc?.letter);
  const lab = buildPredictiveLabReference(ROOT);
  assert.equal(lab.etapa17?.status, "ok");
  assert.ok(lab.etapa17.experiments?.length >= 5);
});

test("Etapa 17 — seção Podemos confiar nas probabilidades?", () => {
  const labPack = buildPredictiveLabReference(ROOT);
  const html = renderResearchLabModel({ labPack, loading: false }, ui);
  assert.match(html, /Podemos confiar nas probabilidades/i);
  if (labPack.etapa17?.status === "ok") {
    assert.match(html, /Ranking ≠ probabilidade calibrada/i);
    assert.match(html, /Etapa 17/i);
  }
});
