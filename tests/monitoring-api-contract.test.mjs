import assert from "node:assert/strict";
import test from "node:test";
import { buildMonitoringDashboard } from "../lib/monitoring/dashboard-payload.mjs";
import { getMonitoringMeta } from "../lib/monitoring/monitoring-meta.mjs";

const stubClient = {
  clientId: "1",
  clientCode: "C1",
  program: "Prog",
  engineer: "EP",
  healthScore: 50,
  engagementScore: 50,
  mechanismScore: 50,
  finalClass: "Atenção",
  analyticalStatus: "ativo",
  hs2a: {
    qualidadeCodigo: "alta_confiabilidade",
    coberturaMecanismos: "completa",
    entradaConfiavel: true,
    perfilCodigo: "relacionamento_estabelecido",
    diagnostico: [],
  },
};

test("payload de monitoramento inclui meta e mensagem com um snapshot", () => {
  const payload = buildMonitoringDashboard([stubClient], { clusterLabel: "teste" });
  assert.equal(payload.version, "etapa11-dashboard-v1");
  assert.ok(payload.live?.indicadores);
  assert.ok(payload.meta?.notBaseQvNote);
  if (payload.meta.snapshotCount === 1) {
    assert.match(payload.live.temporal?.reason || "", /Aguardando novos snapshots/i);
  }
});

test("monitoring-meta retorna contrato mínimo", async () => {
  const meta = await getMonitoringMeta();
  assert.match(meta.version, /monitoring-meta-v/);
  assert.ok(meta.businessData);
  assert.ok(meta.snapshots);
  assert.ok(meta.regenerate);
  if (meta.snapshots.count < 2) {
    assert.match(meta.snapshots.message || "", /Aguardando novos snapshots|comparison/i);
  }
});
