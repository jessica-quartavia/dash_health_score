import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichClientWithHs2a,
  primaryRelationshipProfile,
  HS2A_VERSION,
  OFFICIAL_FORMULA_VERSION,
  resolveContractualEntry,
} from "../lib/hs2a-interpretation.mjs";
import { buildManagerialSummary } from "../lib/hs2a-managerial.mjs";
import { parseDate } from "../lib/utils.mjs";

test("HS2A preserva score V1 e versão oficial", () => {
  const row = {
    healthScore: 55,
    engagementScore: 50,
    mechanismScore: 60,
    finalClass: "Atenção",
    totalMeetings: 4,
    implementedCount: 2,
    inProgressCount: 0,
    avgMeetingsPerMonth: 0.8,
  };
  const client = { id: 1, data_inicio_ciclo: "2025-06-01", created_at: "2026-02-27T00:00:00.000Z" };
  const out = enrichClientWithHs2a(row, { client, mechanismLinked: true, reunioes30d: 0 });
  assert.equal(out.healthScore, 55);
  assert.equal(out.hs2a.hsScore, 55);
  assert.equal(out.hs2a.formulaOficial, OFFICIAL_FORMULA_VERSION);
  assert.equal(out.hs2a.version, HS2A_VERSION);
});

test("implantação não vira perfil de baixo engajamento automático", () => {
  const perfil = primaryRelationshipProfile({
    finalClass: "Em implantação",
    totalMeetings: 0,
    engagementScore: 5,
    coberturaMecanismos: "sem_vinculo",
    confiabilidadeReconstrucao: "integral",
    confiabilidadeEntrada: "alta",
  });
  assert.equal(perfil, "em_implantacao");
});

test("entrada contratual prefere ciclo sobre created_at migrado", () => {
  const entry = resolveContractualEntry({
    data_inicio_ciclo: "2024-01-15",
    created_at: "2026-02-27T00:00:00.000Z",
  });
  assert.equal(entry.confiavel, true);
  assert.equal(entry.source, "data_inicio_ciclo");
  assert.equal(entry.date.toISOString().slice(0, 10), "2024-01-15");
});

test("contagens gerenciais — perfis exclusivos somam total", () => {
  const base = {
    healthScore: 10,
    engagementScore: 10,
    mechanismScore: 10,
    finalClass: "Em implantação",
    totalMeetings: 0,
    implementedCount: 0,
    program: "PHARUS",
    engineer: "EP",
  };
  const clients = [
    enrichClientWithHs2a({ ...base, clientId: "1" }, { client: { data_inicio_ciclo: "2025-01-01" }, mechanismLinked: false }),
    enrichClientWithHs2a(
      { ...base, finalClass: "Atenção", totalMeetings: 5, engagementScore: 50, healthScore: 40, clientId: "2" },
      { client: { data_inicio_ciclo: "2024-01-01" }, mechanismLinked: true },
    ),
  ];
  const sum = buildManagerialSummary(clients);
  const exclusiveTotal = sum.perfisExclusivos.reduce((a, p) => a + p.count, 0);
  assert.equal(exclusiveTotal, 2);
});

test("sem probabilidade de churn no objeto hs2a", () => {
  const out = enrichClientWithHs2a(
    { healthScore: 1, engagementScore: 0, mechanismScore: 0, finalClass: "Crítico", totalMeetings: 0, implementedCount: 0 },
    { client: {}, mechanismLinked: false },
  );
  assert.equal("churnProbability" in (out.hs2a || {}), false);
  assert.equal("riskScore" in (out.hs2a || {}), false);
});
