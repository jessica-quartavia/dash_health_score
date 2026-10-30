import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildPredictiveLabReference } from "../lib/research/predictive-lab-reference.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("predictive-lab-reference — pacote ok com Modelo E e métricas versionadas", () => {
  const pack = buildPredictiveLabReference(ROOT);
  assert.equal(pack.ok, true);
  assert.equal(pack.referenceModel.id, "E");
  assert.ok(pack.referenceModel.metrics.june2026Exploratory || pack.referenceModel.metrics.v16Holdout);
  const june = pack.referenceModel.metrics.june2026Exploratory;
  if (june) {
    assert.ok(june.rocAuc > 0.5 && june.rocAuc < 1);
    assert.match(june.label, /explorat/i);
    assert.ok(june.source);
  }
  assert.equal(pack.selection.chosenId, "E");
  assert.ok(pack.whyChosenPlain?.length > 40);
});

test("predictive-lab-reference — Etapa 16 não mistura períodos nas métricas E", () => {
  const pack = buildPredictiveLabReference(ROOT);
  const j = pack.referenceModel.metrics.june2026Exploratory;
  const h = pack.referenceModel.metrics.v16Holdout;
  if (j && h) {
    assert.notEqual(j.period, h.period);
  }
});
