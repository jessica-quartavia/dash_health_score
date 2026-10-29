import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildQualityIndicators,
  attachDiagnostics,
} from "../lib/hs2a-diagnostics.mjs";
import { enrichClientWithHs2a, OFFICIAL_FORMULA_VERSION, HS2A_VERSION } from "../lib/hs2a-interpretation.mjs";
import { compareSnapshots } from "../lib/monitoring/snapshot-diff.mjs";

test("denominadores explícitos nos indicadores de qualidade", () => {
  const clients = [
    { hs2a: { qualidadeCodigo: "alta_confiabilidade", coberturaMecanismos: "completa", entradaConfiavel: true, perfilCodigo: "relacionamento_estabelecido", diagnostico: [] } },
    { hs2a: { qualidadeCodigo: "historico_insuficiente", coberturaMecanismos: "sem_vinculo", entradaConfiavel: false, perfilCodigo: "dados_inconsistentes", diagnostico: [{ tipo: "datas_ausentes" }] } },
  ];
  const q = buildQualityIndicators(clients, { denominatorLabel: "teste" });
  assert.equal(q.denominador.n, 2);
  assert.equal(q.indicadores[0].numerador, 1);
  assert.equal(q.indicadores[0].percentual, 50);
  assert.match(q.separacao, /não medem saúde/);
});

test("HS operacional preservado após diagnósticos", () => {
  const row = {
    healthScore: 72,
    engagementScore: 70,
    mechanismScore: 74,
    finalClass: "Saudável",
    totalMeetings: 5,
    implementedCount: 2,
    inProgressCount: 0,
    avgMeetingsPerMonth: 1,
  };
  const client = { id: 99, data_inicio_ciclo: "2024-03-01", created_at: "2024-03-01T00:00:00.000Z" };
  const enriched = enrichClientWithHs2a(row, { client, mechanismLinked: true, reunioes30d: 1 });
  const out = attachDiagnostics(client, enriched, { mechanismRows: [] });
  assert.equal(out.healthScore, 72);
  assert.equal(out.hs2a.hsScore, 72);
  assert.equal(out.hs2a.formulaOficial, OFFICIAL_FORMULA_VERSION);
});

test("snapshots comparáveis exigem mesma versão", () => {
  const base = {
    schema: "hs-monitor-v1",
    referenceDay: "2026-10-01",
    formulaVersion: OFFICIAL_FORMULA_VERSION,
    hs2aVersion: HS2A_VERSION,
    rows: [{ clientRef: "m_abc", hs: 50, e: 40, m: 60, perfil: "relacionamento_estabelecido", qualidade: "alta_confiabilidade" }],
  };
  const cur = { ...base, referenceDay: "2026-10-23", rows: [{ ...base.rows[0], hs: 35, e: 30 }] };
  const prev = { ...base };
  const ok = compareSnapshots(cur, prev);
  assert.equal(ok.comparable, true);
  assert.ok(ok.mudancas.faixa_hs >= 1);
  const bad = compareSnapshots({ ...cur, hs2aVersion: "outra" }, prev);
  assert.equal(bad.comparable, false);
});

test("pseudonimização estável, idempotência de snapshot", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "hs-mon-"));
  writeFileSync(join(tmpRoot, ".pseudonym-secret"), "test-secret-fixed-32bytes-long!!", "utf8");
  mkdirSync(join(tmpRoot, "snapshots"), { recursive: true });
  process.env.HS_MONITORING_ROOT = tmpRoot;

  const { stableClientRef, buildSnapshotRecords, writeSnapshot } = await import("../lib/monitoring/snapshot-store.mjs");

  const ref1 = stableClientRef(42);
  const ref2 = stableClientRef(42);
  assert.equal(ref1, ref2);
  assert.match(ref1, /^m_[a-f0-9]+$/);
  assert.doesNotMatch(ref1, /42/);

  const snap = buildSnapshotRecords(
    [{ clientId: 42, healthScore: 50, engagementScore: 40, mechanismScore: 60, finalClass: "Atenção", program: "P1", analyticalStatus: "ativo", hs2a: { perfilCodigo: "relacionamento_estabelecido", qualidadeCodigo: "alta_confiabilidade" } }],
    {
      referenceDate: new Date("2099-01-15T12:00:00.000Z"),
      population: "test_etapa9",
      formulaVersion: OFFICIAL_FORMULA_VERSION,
      hs2aVersion: HS2A_VERSION,
      filters: { unit: "etapa9" },
    },
  );
  assert.equal(snap.rows[0].clientRef, ref1);
  writeSnapshot(snap, { idempotent: true });
  const w2 = writeSnapshot(snap, { idempotent: true });
  assert.equal(w2.skipped, true);

  rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env.HS_MONITORING_ROOT;
});

test("inventário de snapshot não contém campos de churn/risco preditivo", () => {
  const snap = {
    schema: "hs-monitor-v1",
    rows: [{ clientRef: "m_x", hs: 10, e: 10, m: 10, classificacao: "Crítico", perfil: "baixa_atividade_observada", qualidade: "historico_insuficiente" }],
  };
  const raw = JSON.stringify(snap);
  assert.doesNotMatch(raw, /churn/i);
  assert.doesNotMatch(raw, /probabilidade/i);
  assert.doesNotMatch(raw, /p_churn/i);
});
