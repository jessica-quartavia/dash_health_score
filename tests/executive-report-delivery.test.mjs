import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadExecutiveReportCore() {
  if (!existsSync(join(ROOT, "dist", "index.html"))) {
    execSync("node scripts/vercel-build.mjs", { cwd: ROOT, stdio: "pipe" });
  }
  return import(new URL("../dist/lib/frontend/executive-report-core.mjs", import.meta.url).href);
}

test("relatório preditivo inclui seções executivas obrigatórias", async () => {
  const { buildPredictiveExecutiveReportHtml, wrapReportDocument } = await loadExecutiveReportCore();
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
  const { buildPredictiveLabReference } = await import("../lib/research/predictive-lab-reference.mjs");
  const labPack = buildPredictiveLabReference(ROOT);
  const built = buildPredictiveExecutiveReportHtml(panorama, { engagement: 70, mechanism: 30 }, { modeling, labPack });
  assert.equal(built.ok, true);
  assert.match(built.bodyHtml, /Estudo preditivo de churn/i);
  assert.match(built.bodyHtml, /1\. Resumo executivo/i);
  assert.match(built.bodyHtml, /regressão logística/i);
  assert.match(built.bodyHtml, /ARIMA/i);
  assert.match(built.bodyHtml, /_dash_health_score/i);
  assert.match(built.bodyHtml, /Etapa 17/i);
  assert.match(built.bodyHtml, /ROC-AUC mede/i);
  assert.match(built.bodyHtml, /não.*operacional|probabilidades individuais/i);
  assert.match(built.bodyHtml, /12\. Apêndice técnico/i);
  assert.match(built.bodyHtml, /Reconciliação de denominadores/i);
  assert.match(built.bodyHtml, /Por que ainda não atingimos/i);
  if (modeling?.models?.A?.coef_top?.[0]?.coef != null) {
    assert.match(built.bodyHtml, /num__freq_media_mes|Coeficientes logísticos/i);
    assert.doesNotMatch(built.bodyHtml, /β₀ = 0\.999/);
  }
  assert.doesNotMatch(built.bodyHtml, /Resumo para sócios/i);
  const doc = wrapReportDocument(built.title, built.bodyHtml);
  assert.match(doc, /Salvar como PDF/i);
});

test("relatório preditivo falha claro sem KPIs", async () => {
  const { buildPredictiveExecutiveReportHtml } = await loadExecutiveReportCore();
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
