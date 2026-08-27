import test from "node:test";
import assert from "node:assert/strict";
import {
  classifySituation1,
  classifySituation2,
  classifySituation3,
  classifySituation4,
  classifyFinal,
  computeWeightedScore,
  MODEL_COMPLETO,
  MODEL_SIMPLIFICADO,
} from "../lib/scoring.mjs";
import { countMeetingsInFirstDays } from "../lib/meetings.mjs";
import { aggregateHealthScore, buildClientHealthRow, DISTRIBUTION_ORDER } from "../lib/health-score.mjs";
import { filterHealthClients, partitionScoreSample } from "../lib/filters.mjs";
import { CSV_HEADERS, belongsToCluster, rowsToCsv } from "../lib/clusters.mjs";

test("situação 1: menos de 45 dias = fase natural", () => {
  const r = classifySituation1({ meetingsFirst45: 0, cycleDays: 20 });
  assert.equal(r.key, "Fase natural de acompanhamento");
  assert.equal(r.score, 100);
});

test("situação 1: limites 0, 1, 2, >=3", () => {
  assert.equal(classifySituation1({ meetingsFirst45: 0, cycleDays: 50 }).score, 0);
  assert.equal(classifySituation1({ meetingsFirst45: 1, cycleDays: 50 }).score, 50);
  assert.equal(classifySituation1({ meetingsFirst45: 2, cycleDays: 50 }).score, 75);
  assert.equal(classifySituation1({ meetingsFirst45: 3, cycleDays: 50 }).score, 100);
  assert.equal(classifySituation1({ meetingsFirst45: 5, cycleDays: 50 }).score, 100);
});

test("situação 2: limites de média mensal", () => {
  assert.equal(classifySituation2(1).score, 100);
  assert.equal(classifySituation2(0.99).score, 75);
  assert.equal(classifySituation2(0.75).score, 75);
  assert.equal(classifySituation2(0.74).score, 50);
  assert.equal(classifySituation2(0.5).score, 50);
  assert.equal(classifySituation2(0.49).score, 25);
  assert.equal(classifySituation2(0.25).score, 25);
  assert.equal(classifySituation2(0.24).score, 0);
});

test("situação 3: <90 dias sem mecanismo = fase natural", () => {
  const r = classifySituation3({ implementedCount: 0, cycleDays: 60 });
  assert.equal(r.key, "Fase natural de implantação");
  assert.equal(r.score, 100);
});

test("situação 3: faixas de atraso sem mecanismo", () => {
  assert.equal(classifySituation3({ implementedCount: 1, cycleDays: 200 }).score, 100);
  assert.equal(classifySituation3({ implementedCount: 0, cycleDays: 100 }).score, 75);
  assert.equal(classifySituation3({ implementedCount: 0, cycleDays: 150 }).score, 50);
  assert.equal(classifySituation3({ implementedCount: 0, cycleDays: 200 }).score, 25);
  assert.equal(classifySituation3({ implementedCount: 0, cycleDays: 400 }).score, 0);
});

test("situação 4: limites 0,1,2,3,>=4 e fase natural", () => {
  assert.equal(classifySituation4({ implementedCount: 0, cycleDays: 30 }).score, 100);
  assert.equal(classifySituation4({ implementedCount: 0, cycleDays: 100 }).score, 0);
  assert.equal(classifySituation4({ implementedCount: 1, cycleDays: 100 }).score, 100);
  assert.equal(classifySituation4({ implementedCount: 2, cycleDays: 100 }).score, 125);
  assert.equal(classifySituation4({ implementedCount: 3, cycleDays: 100 }).score, 175);
  assert.equal(classifySituation4({ implementedCount: 4, cycleDays: 100 }).score, 200);
});

test("modelos de peso e teto 100", () => {
  const scores = { s1: 100, s2: 100, s3: 100, s4: 200 };
  const completo = computeWeightedScore(scores, MODEL_COMPLETO);
  // 10+30+10+100 = 150 → cap 100
  assert.equal(completo, 100);

  const simplificado = computeWeightedScore({ s1: 0, s2: 100, s3: 0, s4: 200 }, MODEL_SIMPLIFICADO);
  // 40 + 120 = 160 → cap 100
  assert.equal(simplificado, 100);

  const mid = computeWeightedScore({ s1: 50, s2: 75, s3: 50, s4: 100 }, MODEL_COMPLETO);
  // 5 + 22.5 + 5 + 50 = 82.5
  assert.equal(mid, 82.5);
});

test("classificação final por faixa", () => {
  assert.equal(classifyFinal(100), "Saudável");
  assert.equal(classifyFinal(75), "Saudável");
  assert.equal(classifyFinal(74), "Atenção");
  assert.equal(classifyFinal(50), "Atenção");
  assert.equal(classifyFinal(49), "Crítico");
  assert.equal(classifyFinal(25), "Crítico");
  assert.equal(classifyFinal(24), "Crítico");
});

test("contagem de reuniões nos primeiros 45 dias", () => {
  const entry = new Date(Date.UTC(2024, 0, 1));
  const starts = [
    new Date(Date.UTC(2024, 0, 10)),
    new Date(Date.UTC(2024, 0, 40)),
    new Date(Date.UTC(2024, 1, 20)), // fora
  ];
  assert.equal(countMeetingsInFirstDays(starts, entry, 45), 2);
});

test("percentuais do recorte fecham em 100%", () => {
  const clients = [
    { finalClass: "Saudável", healthScore: 90, s1Label: "A", s2Label: "A", s3Label: "A", s4Label: "A" },
    { finalClass: "Atenção", healthScore: 60, s1Label: "B", s2Label: "B", s3Label: "B", s4Label: "B" },
    { finalClass: "Crítico", healthScore: 10, s1Label: "D", s2Label: "D", s3Label: "D", s4Label: "D" },
  ];
  const payload = aggregateHealthScore(clients, {
    model: MODEL_COMPLETO,
    weights: { s1: 0.1, s2: 0.3, s3: 0.1, s4: 0.5, label: "x", formula: "y" },
    filters: {},
    filterOptions: {},
    metadata: {},
  });
  const sumPct =
    payload.summary.healthyPercent +
    payload.summary.attentionPercent +
    payload.summary.criticalPercent;
  assert.ok(Math.abs(sumPct - 100) < 0.05);
  assert.deepEqual(
    payload.healthDistribution.map((row) => row.label),
    DISTRIBUTION_ORDER.health,
  );
});

test("ordem das classificações segue o padrão do dashboard", () => {
  const clients = [
    { finalClass: "Crítico", healthScore: 10, s1Label: "Crítico", s2Label: "Crítico", s3Label: "Atenção", s4Label: "Saudável (1)" },
    { finalClass: "Saudável", healthScore: 90, s1Label: "Fase natural de acompanhamento", s2Label: "Saudável", s3Label: "Crítico", s4Label: "Saudável (≥4)" },
    { finalClass: "Crítico", healthScore: 40, s1Label: "Saudável", s2Label: "Crítico", s3Label: "Fase natural de implantação", s4Label: "Fase natural de implantação" },
  ];
  const payload = aggregateHealthScore(clients, {
    model: MODEL_COMPLETO,
    weights: { s1: 0.1, s2: 0.3, s3: 0.1, s4: 0.5, label: "x", formula: "y" },
    filters: {},
    filterOptions: {},
    metadata: {},
  });
  assert.deepEqual(payload.situationDistributions.s1.map((row) => row.label), DISTRIBUTION_ORDER.s1);
  assert.deepEqual(payload.situationDistributions.s4.map((row) => row.label), DISTRIBUTION_ORDER.s4);
});

test("buildClientHealthRow aplica modelo e teto", () => {
  const now = new Date(Date.UTC(2024, 6, 1));
  const client = {
    id: "1",
    name: "Ana",
    codigo: "A1",
    status: "Ativo",
    engenheiro_patrimonial: "EP1",
    programa: "Pharus",
    data_inicio_ciclo: "2023-01-01",
    created_at: "2023-01-01",
  };
  const calendlyByClient = new Map([
    [
      "1",
      [
        { client_id: "1", start_time: "2023-01-10T10:00:00Z" },
        { client_id: "1", start_time: "2023-02-10T10:00:00Z" },
        { client_id: "1", start_time: "2023-03-10T10:00:00Z" },
      ],
    ],
  ]);
  const row = buildClientHealthRow({
    client,
    calendlyByClient,
    manualByClient: new Map(),
    implementedByClient: new Map([["1", 4]]),
    cancelMap: new Map(),
    now,
    model: MODEL_COMPLETO,
  });
  assert.ok(row.healthScore <= 100);
  assert.equal(row.s4Score, 200);
  assert.ok(row.cycleDays >= 45);
});

test("filtro por classificação final", () => {
  const rows = [
    { analyticalStatus: "Ativo", engineer: "EP1", program: "Pharus", finalClass: "Saudável", s1Key: "Saudável", clientName: "A", clientCode: "1", clientId: "1", totalMeetings: 2, implementedCount: 1 },
    { analyticalStatus: "Ativo", engineer: "EP1", program: "Pharus", finalClass: "Crítico", s1Key: "Crítico", clientName: "B", clientCode: "2", clientId: "2", totalMeetings: 1, implementedCount: 0 },
  ];
  const filtered = filterHealthClients(rows, {
    cluster: "ativos",
    ep: "all",
    program: "all",
    finalClass: "Crítico",
    situation: "all",
    search: "",
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].clientName, "B");
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
    model: MODEL_COMPLETO,
  });
}

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

test("CSV inclui reuniões, média/mês, scores S1–S4 e score final", () => {
  const row = clusterRow({ client: { id: "40", name: "Carla", codigo: "C40", ciclo: 2 } });
  const csv = rowsToCsv([row]);
  assert.equal(csv.startsWith("\uFEFF"), true);
  for (const header of CSV_HEADERS) {
    assert.ok(csv.includes(header), `CSV deve incluir coluna ${header}`);
  }
  assert.ok(Number.isFinite(row.totalMeetings));
  assert.ok(Number.isFinite(row.avgMeetingsPerMonth));
  assert.ok(Number.isFinite(row.s1Score));
  assert.ok(Number.isFinite(row.s2Score));
  assert.ok(Number.isFinite(row.s3Score));
  assert.ok(Number.isFinite(row.s4Score));
  assert.ok(Number.isFinite(row.healthScore));
});

test("zerados saem da amostra e incrementam descartados", () => {
  const comDado = {
    analyticalStatus: "Ativo",
    engineer: "EP1",
    program: "Pharus",
    finalClass: "Saudável",
    clientName: "Com dado",
    clientCode: "1",
    clientId: "1",
    totalMeetings: 2,
    implementedCount: 0,
    healthScore: 80,
    s1Label: "A",
    s2Label: "A",
    s3Label: "A",
    s4Label: "A",
  };
  const zerado = {
    analyticalStatus: "Ativo",
    engineer: "EP1",
    program: "Pharus",
    finalClass: "Crítico",
    clientName: "Zerado",
    clientCode: "2",
    clientId: "2",
    totalMeetings: 0,
    implementedCount: 0,
    healthScore: 0,
    s1Label: "A",
    s2Label: "A",
    s3Label: "A",
    s4Label: "A",
  };
  const { discarded, eligible } = partitionScoreSample([comDado, zerado], { cluster: "ativos" });
  assert.equal(discarded.length, 1);
  assert.equal(discarded[0].clientName, "Zerado");
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].clientName, "Com dado");

  const payload = aggregateHealthScore(eligible, {
    model: MODEL_COMPLETO,
    weights: { s1: 0.1, s2: 0.3, s3: 0.1, s4: 0.5, label: "x", formula: "y" },
    filters: {},
    filterOptions: {},
    metadata: {},
    discardedForMissingData: discarded.length,
  });
  assert.equal(payload.summary.totalClients, 1);
  assert.equal(payload.summary.discardedForMissingData, 1);
});
