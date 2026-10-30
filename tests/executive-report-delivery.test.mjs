import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPredictiveExecutiveReportHtml, wrapReportDocument } from "../lib/frontend/executive-report-core.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("relatório preditivo inclui seções executivas obrigatórias", () => {
  const panorama = {
    generatedAt: "2026-01-15T12:00:00.000Z",
    kpis: {
      horizonDays: 90,
      observationsHistorical: 1000,
      observationsLabeled90d: 800,
      uniqueClientsResearch: 200,
      observedChurnRate90d: 0.12,
      bestModelId: "C",
      bestModelLabel: "HS + E + M",
      evaluationPeriod: "2024–2025 hold-out",
    },
    descriptive: {
      hsBands: [{ band: "0-20", n: 50, churnRate: 0.25 }],
      eBands: [{ band: "0", n: 40, churnRate: 0.2 }],
      mBands: [{ band: "0", n: 30, churnRate: 0.18 }],
    },
    models: [{ id: "A", label: "Baseline", rocAuc: 0.55, prAuc: 0.12 }],
    profiles: [{ id: "baixa_atividade", observations: 10, churnRate: 0.3 }],
  };
  let modeling = null;
  try {
    modeling = JSON.parse(
      readFileSync(join(ROOT, "research", "modeling", "output", "modeling_results_etapa4.json"), "utf8"),
    );
  } catch {
    /* optional in CI */
  }
  const built = buildPredictiveExecutiveReportHtml(panorama, { engagement: 70, mechanism: 30 }, { modeling });
  assert.equal(built.ok, true);
  assert.match(built.bodyHtml, /Estudo Preditivo de Churn/i);
  assert.match(built.bodyHtml, /Resumo para sócios/i);
  assert.match(built.bodyHtml, /regressão logística/i);
  assert.match(built.bodyHtml, /Churn observado por faixa de HS/i);
  assert.match(built.bodyHtml, /ROC-AUC/i);
  assert.match(built.bodyHtml, /não operacional|operacional/i);
  assert.match(built.bodyHtml, /Apêndice estatístico/i);
  assert.match(built.bodyHtml, /Reconciliação de denominadores/i);
  if (modeling?.models?.A?.coef_top?.[0]?.coef != null) {
    assert.match(built.bodyHtml, /num__freq_media_mes|coef_top/);
    assert.doesNotMatch(built.bodyHtml, /β₀ = 0\.999/);
  }
  const doc = wrapReportDocument(built.title, built.bodyHtml);
  assert.match(doc, /Salvar como PDF/i);
});

test("relatório preditivo falha claro sem KPIs", () => {
  const built = buildPredictiveExecutiveReportHtml(null, {});
  assert.equal(built.ok, false);
  assert.ok(built.error);
});

test("sidebar recolhida mantém botão toggle visível (não display:none)", () => {
  const css = readFileSync(join(ROOT, "public", "styles.css"), "utf8");
  assert.doesNotMatch(css, /\.shell\.collapsed[\s\S]*?\.sidebar-toggle\s*\{\s*display:\s*none/);
  assert.match(css, /\.sidebar-toggle/);
  assert.match(css, /\.shell\.collapsed[\s\S]*?clip:\s*rect\(0,\s*0,\s*0,\s*0\)/);
});

test("drawer lateral — estilos de perfil", () => {
  const css = readFileSync(join(ROOT, "public", "styles.css"), "utf8");
  assert.match(css, /dialog\.client-drawer/);
  assert.match(css, /profile-drawer-body/);
  assert.match(css, /inset: 0 0 0 auto/);
});

test("index expõe switch moderno de fixar filtros", () => {
  const html = readFileSync(join(ROOT, "public", "index.html"), "utf8");
  assert.match(html, /switch-ui/);
  assert.match(html, /filters-grid-v3/);
  assert.match(html, /sidebar-toggle/);
});
