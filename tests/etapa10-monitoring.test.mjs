import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { compareSnapshots } from "../lib/monitoring/snapshot-diff.mjs";
import {
  buildSnapshotRecords,
  writeSnapshot,
  snapshotIntegrity,
  verifySnapshotIntegrity,
} from "../lib/monitoring/snapshot-store.mjs";
import { HS2A_VERSION, OFFICIAL_FORMULA_VERSION } from "../lib/hs2a-interpretation.mjs";
import { buildIssueRecords } from "../lib/monitoring/issue-registry.mjs";
import { detectMonitoringEnvironment } from "../lib/monitoring/storage-backend.mjs";
import { freezeIntegrity, buildProspectiveFreeze } from "../lib/monitoring/prospective-freeze.mjs";

test("mesma data de referência não gera comparação artificial", () => {
  const base = {
    schema: "hs-monitor-v1",
    referenceDay: "2026-10-23",
    formulaVersion: OFFICIAL_FORMULA_VERSION,
    hs2aVersion: HS2A_VERSION,
    rows: [],
  };
  const r = compareSnapshots({ ...base }, { ...base, rows: [{ clientRef: "m_a" }] });
  assert.equal(r.comparable, false);
  assert.equal(r.reason, "mesma_data_referencia");
});

test("integridade detecta alteração pós-gravação", () => {
  const snap = buildSnapshotRecords([], {
    referenceDate: new Date("2099-02-01T12:00:00.000Z"),
    population: "t",
    formulaVersion: OFFICIAL_FORMULA_VERSION,
    hs2aVersion: HS2A_VERSION,
    filters: {},
  });
  const hash = snapshotIntegrity(snap);
  const stored = { ...snap, integrity: hash };
  stored.rows = [{ clientRef: "m_tampered" }];
  const v = verifySnapshotIntegrity(stored);
  assert.equal(v.ok, false);
});

test("entradas e saídas da carteira", () => {
  const prev = {
    schema: "hs-monitor-v1",
    referenceDay: "2026-10-01",
    formulaVersion: OFFICIAL_FORMULA_VERSION,
    hs2aVersion: HS2A_VERSION,
    rows: [{ clientRef: "m_a", hs: 50, e: 50, m: 50, issueKeys: [] }],
  };
  const curEntry = {
    ...prev,
    referenceDay: "2026-10-23",
    rows: [
      { clientRef: "m_b", hs: 40, e: 40, m: 40, issueKeys: [] },
      { clientRef: "m_a", hs: 50, e: 50, m: 50, issueKeys: [] },
    ],
  };
  const dEntry = compareSnapshots(curEntry, prev);
  assert.equal(dEntry.fluxo_carteira.entradas, 1);

  const curIssue = {
    ...prev,
    referenceDay: "2026-10-23",
    rows: [{ clientRef: "m_a", hs: 50, e: 50, m: 50, issueKeys: ["datas_ausentes"] }],
  };
  const dIssue = compareSnapshots(curIssue, prev);
  assert.equal(dIssue.mudancas.inconsistencias_novas, 1);
});

test("registro gerencial separa prioridade de dados de churn", () => {
  const rows = buildIssueRecords([
    {
      clientId: 1,
      clientCode: "C1",
      program: "P",
      engineer: "EP",
      hs2a: { perfilLabel: "X", diagnostico: [{ tipo: "datas_ausentes", severidade: "alta" }] },
    },
  ]);
  assert.match(rows[0].prioridadeNota, /não confundir com risco de churn/i);
  assert.equal(rows[0].categoria, "entrada_contratual");
});

test("freeze prospectivo inclui versão de transformação e hash", () => {
  const freeze = buildProspectiveFreeze(
    [{ clientId: 9, healthScore: 1, engagementScore: 1, mechanismScore: 1, hs2a: { qualidadeCodigo: "alta_confiabilidade", faseRelacionamento: "pos_implantacao", perfilCodigo: "relacionamento_estabelecido" } }],
    { referenceDate: new Date("2026-10-15T12:00:00.000Z"), sources: { clients: true } },
  );
  assert.ok(freeze.transformVersion.includes("etapa10"));
  assert.ok(freezeIntegrity(freeze).length >= 32);
  assert.doesNotMatch(JSON.stringify(freeze), /churn/i);
});

test("detecção de ambiente marca Vercel como efêmero", () => {
  const prev = process.env.VERCEL;
  process.env.VERCEL = "1";
  const env = detectMonitoringEnvironment();
  assert.equal(env.deployEphemeral, true);
  if (prev === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = prev;
});

test("idempotência por data e versão de fórmula", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "hs-et10-"));
  writeFileSync(join(tmpRoot, ".pseudonym-secret"), "test-secret-fixed-32bytes-long!!", "utf8");
  mkdirSync(join(tmpRoot, "snapshots"), { recursive: true });
  process.env.HS_MONITORING_ROOT = tmpRoot;
  const { writeSnapshot: ws, buildSnapshotRecords: bs } = await import("../lib/monitoring/snapshot-store.mjs");
  const snap = bs([], {
    referenceDate: new Date("2099-03-10T12:00:00.000Z"),
    population: "ativos",
    formulaVersion: OFFICIAL_FORMULA_VERSION,
    hs2aVersion: HS2A_VERSION,
    filters: {},
  });
  const a = ws(snap, { idempotent: true });
  const b = ws(snap, { idempotent: true });
  assert.equal(b.skipped, true);
  rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env.HS_MONITORING_ROOT;
});
