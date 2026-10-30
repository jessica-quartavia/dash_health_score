import assert from "node:assert/strict";
import test from "node:test";

/**
 * Regressão: render assíncrono de Qualidade não deve aplicar HTML se a view mudou.
 * Lógica espelhada de public/app.js (renderQuality).
 */
function shouldApplyQualityRender(requestId, activeRequestId, view) {
  return requestId === activeRequestId && view === "quality";
}

test("quality render guard bloqueia pintura fora da aba", () => {
  assert.equal(shouldApplyQualityRender(1, 1, "overview"), false);
  assert.equal(shouldApplyQualityRender(1, 2, "quality"), false);
  assert.equal(shouldApplyQualityRender(2, 2, "quality"), true);
});
