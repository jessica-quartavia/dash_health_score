import assert from "node:assert/strict";
import test from "node:test";
import { buildResearchPanorama } from "../lib/research/panorama-aggregates.mjs";

test("panorama inclui auditoria econométrica de churn", () => {
  const p = buildResearchPanorama({});
  if (!p.churnRateAudit?.ok) return;
  assert.ok(p.churnRateAudit.measures.rateByObservationClientMonth > 0.3);
  assert.ok(Array.isArray(p.churnRateAudit.confirmed));
});

test("KPIs não rotulam 18638 como elegíveis 90d", () => {
  const p = buildResearchPanorama({});
  if (!p.kpis.observationsHistorical) return;
  assert.equal(p.kpis.observationsHistorical, 18638);
  assert.ok(p.kpis.observationsLabeled90d <= p.kpis.observationsHistorical);
  assert.notEqual(p.kpis.observationsLabeled90d, p.kpis.observationsHistorical);
});

test("faixas HS têm taxa e n quando robustness presente", () => {
  const p = buildResearchPanorama({});
  const bands = p.descriptive?.hsBands || [];
  if (!bands.length) return;
  const b0 = bands.find((b) => b.band === "0-20");
  assert.ok(b0);
  assert.ok(b0.n > 1000);
  assert.ok(b0.churnRate > 0.3);
});

test("modelos A–E expõem ROC quando modelagem ok", () => {
  const p = buildResearchPanorama({});
  if (!p.models?.length) return;
  assert.ok(p.models.some((m) => m.id === "A" || m.id === "E"));
  assert.ok(p.models.every((m) => m.rocAuc == null || m.rocAuc <= 1));
});

test("matriz E×M suprime células pequenas", () => {
  const p = buildResearchPanorama({});
  const m = p.descriptive?.emMatrix || [];
  if (!m.length) return;
  const tiny = m.filter((c) => c.n > 0 && c.n < 30);
  assert.ok(tiny.every((c) => c.suppressed));
});

test("KPIs e agregados não contêm NaN no contrato", () => {
  const p = buildResearchPanorama({});
  const raw = JSON.stringify(p);
  assert.doesNotMatch(raw, /"NaN"/);
  assert.ok(p.kpis.censored90d == null || Number.isFinite(p.kpis.censored90d));
  if (p.descriptive?.hsBands?.length) {
    assert.ok(p.descriptive.hsBands.every((b) => b.churnRate == null || Number.isFinite(b.churnRate)));
  }
  assert.equal(p.descriptiveAvailability?.ok, true);
});

test("faixas E e M presentes com CSV validado", () => {
  const p = buildResearchPanorama({});
  if (p.descriptiveAvailability?.source !== "csv") return;
  assert.ok((p.descriptive?.eBands || []).length >= 3);
  assert.ok((p.descriptive?.mBands || []).length >= 3);
  assert.ok((p.descriptive?.emMatrix || []).length >= 16);
});
