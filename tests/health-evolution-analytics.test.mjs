import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHealthComposition,
  buildProgramHealthStats,
  buildEpHealthStats,
  filterAccompanimentRows,
  compareSnapshotPopulations,
  primaryObservedFactor,
  evolutionInsufficientMessage,
} from "../lib/frontend/health-evolution-analytics.mjs";
import { recomputeClientScores } from "../lib/frontend/weight-recompute.mjs";

function client(overrides) {
  return {
    clientId: "1",
    clientName: "Test",
    program: "Prog A",
    engineer: "EP1",
    engagementScore: 60,
    mechanismScore: 60,
    totalMeetings: 3,
    implementedCount: 2,
    daysSinceEntry: 200,
    currentCycle: 1,
    finalClass: "Atenção",
    hs2a: { qualidadeCodigo: "alta_confiabilidade", qualidadeLabel: "Alta confiabilidade", coberturaMecanismos: "completa", entradaConfiavel: true },
    ...overrides,
  };
}

test("HS zero com Sem registro vs Crítico", () => {
  const semReg = recomputeClientScores(
    [{ totalMeetings: 0, implementedCount: 0, engagementScore: 0, mechanismScore: 0, daysSinceEntry: 200, currentCycle: 2 }],
    { engagement: 50, mechanism: 50 },
  )[0];
  assert.equal(semReg.healthScore, 0);
  assert.equal(semReg.finalClass, "Sem registro");

  const crit = recomputeClientScores(
    [{ totalMeetings: 2, implementedCount: 1, engagementScore: 20, mechanismScore: 0, daysSinceEntry: 200, currentCycle: 2 }],
    { engagement: 50, mechanism: 50 },
  )[0];
  assert.equal(crit.finalClass, "Crítico");
  assert.ok(crit.healthScore < 20);
});

test("buildHealthComposition agrega E/M por nível", () => {
  const rows = [
    client({ finalClass: "Saudável", engagementScore: 100, mechanismScore: 100, healthScore: 100 }),
    client({ clientId: "2", finalClass: "Crítico", engagementScore: 20, mechanismScore: 0, healthScore: 10 }),
  ];
  const comp = buildHealthComposition(rows);
  const saud = comp.levels.find((l) => l.label === "Saudável");
  assert.equal(saud.avgE, 100);
  assert.equal(comp.coverage.semReuniaoObservada.count, 0);
});

test("comparativos por programa e EP", () => {
  const rows = [
    client({ program: "P1", engineer: "E1", healthScore: 80, finalClass: "Saudável" }),
    client({ clientId: "2", program: "P1", engineer: "E1", healthScore: 40, finalClass: "Atenção" }),
    client({ clientId: "3", program: "P2", engineer: "E2", healthScore: 10, finalClass: "Crítico" }),
  ];
  const p = buildProgramHealthStats(rows, { minGroup: 2 });
  assert.equal(p.find((x) => x.program === "P1").hsMedio, 60);
  const ep = buildEpHealthStats(rows, { minGroup: 1 });
  assert.ok(ep.find((x) => x.engineer === "E1").shareAtencaoCritico > 0);
});

test("filtro de acompanhamento por nível", () => {
  const rows = [client({ finalClass: "Atenção" }), client({ clientId: "2", finalClass: "Saudável", healthScore: 90 })];
  const f = filterAccompanimentRows(rows, { healthLevel: "Crítico" });
  assert.equal(f.length, 0);
  const all = filterAccompanimentRows(rows, { healthLevel: "all" });
  assert.equal(all.length, 2);
});

test("compareSnapshotPopulations detecta melhora e piora", () => {
  const prev = new Map([
    ["m_a", { hs: 50, e: 50, m: 50, classe: "Atenção" }],
    ["m_b", { hs: 80, e: 80, m: 80, classe: "Saudável" }],
  ]);
  const next = new Map([
    ["m_a", { hs: 70, e: 60, m: 80, classe: "Saudável" }],
    ["m_b", { hs: 60, e: 60, m: 60, classe: "Atenção" }],
  ]);
  const r = compareSnapshotPopulations(prev, next);
  assert.equal(r.improved, 1);
  assert.equal(r.worsened, 1);
  assert.ok(r.avgHsDelta != null);
});

test("histórico insuficiente — mensagem compacta", () => {
  assert.match(evolutionInsufficientMessage(1), /Histórico em formação/i);
});

test("primaryObservedFactor distingue cobertura e score", () => {
  const scoreRow = client({ engagementScore: 20, mechanismScore: 60, healthScore: 40 });
  assert.match(primaryObservedFactor(scoreRow), /Engajamento/i);
  const covRow = client({
    hs2a: { ...client().hs2a, coberturaMecanismos: "sem_vinculo" },
    engagementScore: 100,
    mechanismScore: 100,
    healthScore: 100,
  });
  assert.match(primaryObservedFactor(covRow), /vínculo|mecanismo/i);
});

test("render health-evolution exporta distribuição", async () => {
  const { healthDistributionBar } = await import("../public/health-evolution.mjs");
  const html = healthDistributionBar([{ label: "Saudável", count: 2, percent: 100 }], {
    fmt: new Intl.NumberFormat("pt-BR"),
    pctFmt: new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }),
    escapeHtml: (s) => s,
  });
  assert.match(html, /stack-chart/);
  assert.match(html, /Saudável/);
});
