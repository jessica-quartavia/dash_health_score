import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyByScore,
  classifyHealth,
  computeHealthScore,
  labelScoreBand,
  normalizeWeights,
  scoreEngagement,
  scoreMechanisms,
} from "../lib/scoring.mjs";
import { aggregateHealthScore, buildClientHealthRow, buildHealthScorePayload, DISTRIBUTION_ORDER } from "../lib/health-score.mjs";
import { filterHealthClients } from "../lib/filters.mjs";
import { CSV_HEADERS, belongsToCluster, rowsToCsv } from "../lib/clusters.mjs";
import { WEIGHTS } from "../lib/scoring.mjs";

test("engajamento: limites da média mensal", () => {
  assert.equal(scoreEngagement(1), 100);
  assert.equal(scoreEngagement(1.2), 100);
  assert.equal(scoreEngagement(0.99), 60);
  assert.equal(scoreEngagement(0.25), 60);
  assert.equal(scoreEngagement(0.249), 20);
  assert.equal(scoreEngagement(0.01), 20);
  assert.equal(scoreEngagement(0), 0);
  assert.equal(scoreEngagement(-1), 0);
  assert.equal(scoreEngagement(null), 0);
});

test("notas E e M leem Saudável, Atenção e Crítico", () => {
  assert.equal(labelScoreBand(100), "Saudável");
  assert.equal(labelScoreBand(60), "Atenção");
  assert.equal(labelScoreBand(20), "Crítico");
  assert.equal(labelScoreBand(0), "Crítico");
});

test("mecanismos: 0, 1–2 e ≥3", () => {
  assert.equal(scoreMechanisms(0), 0);
  assert.equal(scoreMechanisms(1), 60);
  assert.equal(scoreMechanisms(2), 60);
  assert.equal(scoreMechanisms(3), 100);
  assert.equal(scoreMechanisms(8), 100);
});

test("todas as combinações de score E/M sem arredondamento extra", () => {
  const expected = {
    "100-100": 100,
    "100-60": 80,
    "100-0": 50,
    "60-100": 80,
    "60-60": 60,
    "60-0": 30,
    "20-100": 60,
    "20-60": 40,
    "20-0": 10,
    "0-100": 50,
    "0-60": 30,
    "0-0": 0,
  };
  for (const e of [100, 60, 20, 0]) {
    for (const m of [100, 60, 0]) {
      assert.equal(computeHealthScore(e, m), expected[`${e}-${m}`]);
    }
  }
});

test("pesos customizados recalculam o score final", () => {
  assert.equal(computeHealthScore(100, 0), 50);
  assert.equal(computeHealthScore(100, 0, normalizeWeights({ engagementWeight: 70, mechanismWeight: 30 })), 70);
  assert.equal(computeHealthScore(100, 0, normalizeWeights({ engagementWeight: 30, mechanismWeight: 70 })), 30);
  assert.equal(computeHealthScore(100, 0, normalizeWeights({ engagementWeight: 80, mechanismWeight: 30 })), 50);
});

test("classificação por score: ≥70 saudável, ≥20 atenção, demais crítico", () => {
  assert.equal(classifyByScore(100), "Saudável");
  assert.equal(classifyByScore(80), "Saudável");
  assert.equal(classifyByScore(70), "Saudável");
  assert.equal(classifyByScore(60), "Atenção");
  assert.equal(classifyByScore(20), "Atenção");
  assert.equal(classifyByScore(19), "Crítico");
  assert.equal(classifyByScore(10), "Crítico");
  assert.equal(classifyByScore(0), "Crítico");
});

test("ordem: Em implantação antes de Sem registro antes de Saudável", () => {
  assert.equal(
    classifyHealth({
      daysSinceEntry: 30,
      currentCycle: 1,
      totalMeetings: 0,
      implementedCount: 0,
      healthScore: 0,
    }),
    "Em implantação",
  );
  assert.equal(
    classifyHealth({
      daysSinceEntry: 120,
      currentCycle: 1,
      totalMeetings: 0,
      implementedCount: 0,
      healthScore: 0,
    }),
    "Sem registro",
  );
  assert.equal(
    classifyHealth({
      daysSinceEntry: 200,
      currentCycle: 1,
      totalMeetings: 12,
      implementedCount: 3,
      healthScore: 100,
    }),
    "Saudável",
  );
});

test("ciclo > 1 nunca entra em implantação", () => {
  assert.equal(
    classifyHealth({
      daysSinceEntry: 20,
      currentCycle: 2,
      totalMeetings: 0,
      implementedCount: 0,
      healthScore: 0,
    }),
    "Sem registro",
  );
  assert.equal(
    classifyHealth({
      daysSinceEntry: 20,
      currentCycle: 3,
      totalMeetings: 4,
      implementedCount: 0,
      healthScore: 50,
    }),
    "Atenção",
  );
});

test("90 dias é exclusivo: 89 entra em implantação, 90 não", () => {
  assert.equal(
    classifyHealth({
      daysSinceEntry: 89,
      currentCycle: 1,
      totalMeetings: 2,
      implementedCount: 0,
      healthScore: 50,
    }),
    "Em implantação",
  );
  assert.equal(
    classifyHealth({
      daysSinceEntry: 90,
      currentCycle: 1,
      totalMeetings: 2,
      implementedCount: 0,
      healthScore: 50,
    }),
    "Atenção",
  );
});

test("percentuais dos cinco estados fecham em 100%", () => {
  const clients = [
    { finalClass: "Saudável", healthScore: 80, engagementScore: 100, mechanismScore: 60 },
    { finalClass: "Atenção", healthScore: 40, engagementScore: 20, mechanismScore: 60 },
    { finalClass: "Crítico", healthScore: 10, engagementScore: 20, mechanismScore: 0 },
    { finalClass: "Em implantação", healthScore: 0, engagementScore: 0, mechanismScore: 0 },
    { finalClass: "Sem registro", healthScore: 0, engagementScore: 0, mechanismScore: 0 },
  ];
  const payload = aggregateHealthScore(clients, {
    weights: WEIGHTS,
    filters: {},
    filterOptions: {},
    metadata: {},
  });
  const sumPct =
    payload.summary.healthyPercent
    + payload.summary.attentionPercent
    + payload.summary.criticalPercent
    + payload.summary.implantingPercent
    + payload.summary.noRecordPercent;
  assert.ok(Math.abs(sumPct - 100) < 0.05);
  assert.deepEqual(
    payload.healthDistribution.map((row) => row.label),
    DISTRIBUTION_ORDER.health,
  );
  assert.deepEqual(
    payload.distributions.engagement.map((row) => row.label),
    DISTRIBUTION_ORDER.engagement,
  );
  assert.deepEqual(
    payload.distributions.mechanism.map((row) => row.label),
    DISTRIBUTION_ORDER.mechanism,
  );
});

test("aggregateHealthScore expõe label e fórmula dos pesos ativos", () => {
  const payload = aggregateHealthScore([], {
    weights: normalizeWeights({ engagementWeight: 70, mechanismWeight: 30 }),
    filters: {},
    filterOptions: {},
    metadata: {},
  });
  assert.equal(payload.weights.engagement, 0.7);
  assert.equal(payload.weights.mechanism, 0.3);
  assert.equal(payload.weights.label, "Pesos: Engajamento (E) = 70% · Mecanismos (M) = 30%");
  assert.equal(payload.weights.formula, "Health Score = (E × 0,7) + (M × 0,3)");
});

test("buildHealthScorePayload repassa pesos ativos", () => {
  const payload = buildHealthScorePayload({
    clients: [],
    weights: normalizeWeights({ engagementWeight: 30, mechanismWeight: 70 }),
  });
  assert.equal(payload.weights.engagement, 0.3);
  assert.equal(payload.weights.mechanism, 0.7);
  assert.equal(payload.weights.label, "Pesos: Engajamento (E) = 30% · Mecanismos (M) = 70%");
});

function clusterClientFixture(overrides = {}) {
  return {
    id: "1",
    name: "Ana",
    codigo: "A1",
    status: "Ativo",
    engenheiro_patrimonial: "EP1",
    programa: "Pharus",
    data_inicio_ciclo: "2023-01-01",
    created_at: "2023-01-01",
    ciclo: 1,
    ...overrides,
  };
}

function clusterRow(overrides = {}) {
  const client = clusterClientFixture(overrides.client || {});
  const clientId = String(client.id);
  return buildClientHealthRow({
    client,
    calendlyByClient: overrides.calendlyByClient || new Map(),
    manualByClient: new Map(),
    implementedByClient: overrides.implementedByClient || new Map([[clientId, 1]]),
    cancelMap: overrides.cancelMap || new Map(),
    now: overrides.now || new Date(Date.UTC(2024, 6, 1)),
  });
}

test("buildClientHealthRow aplica E/M e carência pela data de entrada", () => {
  const now = new Date(Date.UTC(2024, 6, 1));
  const meetings = [];
  for (let i = 0; i < 4; i += 1) {
    const day = String(5 + i).padStart(2, "0");
    meetings.push({ client_id: "1", start_time: `2024-04-${day}T10:00:00Z` });
  }
  const row = buildClientHealthRow({
    client: clusterClientFixture({
      data_inicio_ciclo: "2024-04-01",
      created_at: "2023-01-01",
    }),
    calendlyByClient: new Map([["1", meetings]]),
    manualByClient: new Map(),
    implementedByClient: new Map([["1", 4]]),
    cancelMap: new Map(),
    now,
  });
  assert.equal(row.engagementScore, 100);
  assert.equal(row.mechanismScore, 100);
  assert.equal(row.healthScore, 100);
  assert.equal(row.finalClass, "Saudável");
  assert.equal(row.entrySource, "created_at");
  assert.ok(row.daysSinceEntry > 90);
});

test("buildClientHealthRow aplica pesos customizados na classificação final", () => {
  const now = new Date(Date.UTC(2024, 6, 1));
  const meetings = [
    { client_id: "1", start_time: "2024-04-05T10:00:00Z" },
    { client_id: "1", start_time: "2024-04-12T10:00:00Z" },
    { client_id: "1", start_time: "2024-04-19T10:00:00Z" },
    { client_id: "1", start_time: "2024-04-26T10:00:00Z" },
  ];
  const row = buildClientHealthRow({
    client: clusterClientFixture({
      data_inicio_ciclo: "2024-04-01",
      created_at: "2023-01-01",
    }),
    calendlyByClient: new Map([["1", meetings]]),
    manualByClient: new Map(),
    implementedByClient: new Map([["1", 0]]),
    cancelMap: new Map(),
    now,
    weights: normalizeWeights({ engagementWeight: 70, mechanismWeight: 30 }),
  });
  assert.equal(row.engagementScore, 100);
  assert.equal(row.mechanismScore, 0);
  assert.equal(row.healthScore, 70);
  assert.equal(row.finalClass, "Saudável");
});

test("90 dias usam created_at; média de reuniões usa o ciclo", () => {
  const now = new Date(Date.UTC(2024, 3, 1));
  const row = buildClientHealthRow({
    client: clusterClientFixture({
      created_at: "2024-02-01",
      data_inicio_ciclo: "2023-01-01",
      ciclo: 1,
    }),
    calendlyByClient: new Map(),
    manualByClient: new Map(),
    implementedByClient: new Map([["1", 0]]),
    cancelMap: new Map(),
    now,
  });
  assert.equal(row.entrySource, "created_at");
  assert.equal(row.cycleSource, "data_inicio_ciclo");
  assert.ok(row.daysSinceEntry < 90);
  assert.ok(row.cycleDays > 90);
  assert.equal(row.finalClass, "Em implantação");
});

test("filtro por classificação final", () => {
  const rows = [
    { analyticalStatus: "Ativo", engineer: "EP1", program: "Pharus", finalClass: "Saudável", clientName: "A", clientCode: "1", clientId: "1" },
    { analyticalStatus: "Ativo", engineer: "EP1", program: "Pharus", finalClass: "Crítico", clientName: "B", clientCode: "2", clientId: "2" },
  ];
  const filtered = filterHealthClients(rows, {
    cluster: "ativos",
    ep: "all",
    program: "all",
    finalClass: "Crítico",
    search: "",
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].clientName, "B");
});

test("analyticalStatus Ativo entra em ativos; congelado e cancelado efetivado não", () => {
  const ativo = clusterRow({ client: { id: "1", status: "Ativo", ciclo: 1 } });
  const congelado = clusterRow({ client: { id: "2", status: "Congelado", ciclo: 1 } });
  const cancelado = clusterRow({
    client: { id: "3", status: "Ativo", ciclo: 1 },
    cancelMap: new Map([
      ["3", { isCancelled: true, date: new Date(Date.UTC(2024, 1, 1)), hasConfirmedDate: true }],
    ]),
  });

  assert.equal(belongsToCluster(ativo, "ativos"), true);
  assert.equal(belongsToCluster(congelado, "ativos"), false);
  assert.equal(belongsToCluster(cancelado, "ativos"), false);

  const filtered = filterHealthClients([ativo, congelado, cancelado], { cluster: "ativos" });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].clientId, "1");
});

test("ciclo 2 entra em renovados; ciclo 1 não", () => {
  const renovado = clusterRow({ client: { id: "10", ciclo: 2 } });
  const ciclo1 = clusterRow({ client: { id: "11", ciclo: 1 } });
  assert.equal(renovado.hasRenewed, true);
  assert.equal(renovado.currentCycle, 2);
  assert.equal(ciclo1.hasRenewed, false);
  assert.equal(belongsToCluster(renovado, "renovados"), true);
  assert.equal(belongsToCluster(ciclo1, "renovados"), false);
  assert.equal(filterHealthClients([renovado, ciclo1], { cluster: "renovados" }).length, 1);
});

test("só evidência de cancelamento entra em cancelados", () => {
  const comEvidencia = clusterRow({
    client: { id: "20", status: "Ativo" },
    cancelMap: new Map([
      ["20", { isCancelled: true, date: new Date(Date.UTC(2024, 2, 1)), hasConfirmedDate: true }],
    ]),
  });
  const marcadoSemEvidencia = clusterRow({
    client: { id: "21", status: "Cancelado" },
  });

  assert.equal(comEvidencia.hasCancellationEvidence, true);
  assert.equal(belongsToCluster(comEvidencia, "cancelados"), true);
  assert.equal(marcadoSemEvidencia.analyticalStatus, "Marcado como cancelado sem confirmação");
  assert.equal(marcadoSemEvidencia.hasCancellationEvidence, false);
  assert.equal(belongsToCluster(marcadoSemEvidencia, "cancelados"), false);
});

test("Total contém ativos, renovados e cancelados", () => {
  const ativo = clusterRow({ client: { id: "30", status: "Ativo", ciclo: 1 } });
  const renovado = clusterRow({ client: { id: "31", status: "Ativo", ciclo: 3 } });
  const cancelado = clusterRow({
    client: { id: "32", status: "Ativo", ciclo: 2 },
    cancelMap: new Map([
      ["32", { isCancelled: true, date: new Date(Date.UTC(2024, 4, 1)), hasConfirmedDate: true }],
    ]),
  });
  const total = filterHealthClients([ativo, renovado, cancelado], { cluster: "total" });
  assert.equal(total.length, 3);
  assert.equal(filterHealthClients([ativo, renovado, cancelado], { cluster: "renovados" }).length, 2);
});

test("CSV inclui E, M e classificação, sem colunas S1–S4", () => {
  const row = clusterRow({ client: { id: "40", name: "Carla", codigo: "C40", ciclo: 2 } });
  const csv = rowsToCsv([row]);
  assert.equal(csv.startsWith("\uFEFF"), true);
  for (const header of CSV_HEADERS) {
    assert.ok(csv.includes(header), `CSV deve incluir coluna ${header}`);
  }
  assert.equal(csv.includes("Score S1"), false);
  assert.equal(csv.includes("Score S2"), false);
  assert.equal(csv.includes("Score S3"), false);
  assert.equal(csv.includes("Score S4"), false);
  assert.ok(Number.isFinite(row.totalMeetings));
  assert.ok(Number.isFinite(row.avgMeetingsPerMonth));
  assert.ok(Number.isFinite(row.engagementScore));
  assert.ok(Number.isFinite(row.mechanismScore));
  assert.ok(Number.isFinite(row.healthScore));
});

test("zerados permanecem na amostra como Sem registro", () => {
  const now = new Date(Date.UTC(2024, 6, 1));
  const comDado = buildClientHealthRow({
    client: clusterClientFixture({ id: "1", name: "Com dado", created_at: "2023-01-01" }),
    calendlyByClient: new Map([
      ["1", [{ client_id: "1", start_time: "2023-06-01T10:00:00Z" }]],
    ]),
    manualByClient: new Map(),
    implementedByClient: new Map([["1", 2]]),
    cancelMap: new Map(),
    now,
  });
  const zerado = buildClientHealthRow({
    client: clusterClientFixture({ id: "2", name: "Zerado", created_at: "2023-01-01" }),
    calendlyByClient: new Map(),
    manualByClient: new Map(),
    implementedByClient: new Map([["2", 0]]),
    cancelMap: new Map(),
    now,
  });
  assert.equal(zerado.finalClass, "Sem registro");
  const filtered = filterHealthClients([comDado, zerado], { cluster: "ativos" });
  assert.equal(filtered.length, 2);

  const payload = aggregateHealthScore(filtered, {
    weights: WEIGHTS,
    filters: {},
    filterOptions: {},
    metadata: {},
  });
  assert.equal(payload.summary.totalClients, 2);
  assert.equal(payload.summary.noRecord, 1);
  assert.equal(payload.summary.discardedForMissingData, undefined);
});
