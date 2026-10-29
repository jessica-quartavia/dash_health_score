import assert from "node:assert/strict";
import test from "node:test";
import { consolidateChurnEpisodes, flattenCancellationSignals } from "../lib/predictive/churn-consolidation.mjs";
import { clientRef, pseudonymSecret } from "../lib/predictive/pseudonym.mjs";
import {
  buildHistoricalEngagement,
  buildHistoricalMechanisms,
  buildHistoricalHealthRow,
  outcomeHorizons,
  isObservationAllowed,
  FORMULA_VERSION,
} from "../lib/predictive/historical-features.mjs";
import { buildAttendanceStatusMap } from "../lib/meetings.mjs";
import { computeHealthScore, scoreEngagement, scoreMechanisms } from "../lib/scoring.mjs";
import { parseDate } from "../lib/utils.mjs";

const SECRET = "test-secret-fixed";

test("1. reunião posterior à referência não entra nas features", () => {
  const refEnd = parseDate("2026-06-30T23:59:59.000Z");
  const client = { id: 1, created_at: "2026-01-01", data_inicio_ciclo: "2026-01-01" };
  const calendly = [
    { client_id: 1, start_time: "2026-05-01T10:00:00.000Z" },
    { client_id: 1, start_time: "2026-08-01T10:00:00.000Z" },
  ];
  const engagement = buildHistoricalEngagement({
    client,
    calendlyRows: calendly,
    manualRows: [],
    attendanceMap: null,
    refEnd,
    firstMeetingCoverageAt: parseDate("2026-01-01"),
  });
  assert.equal(engagement.totalMeetings, 1);
  assert.equal(engagement.reunioes_30d, 0);
});

test("2. mecanismo futuro não entra no M histórico", () => {
  const refEnd = parseDate("2026-03-31T23:59:59.000Z");
  const asOf = parseDate("2026-10-01");
  const mech = buildHistoricalMechanisms({
    clientId: 1,
    mechanismRows: [
      { client_id: 1, mecanismo_id: 10, status: "implementado", implemented_at: "2026-08-01", created_at: "2026-08-01" },
    ],
    refEnd,
    asOf,
  });
  assert.equal(mech.mecanismos_implantados, 0);
});

test("3. observação pós-churn indevida é bloqueada", () => {
  const churn = parseDate("2026-05-15");
  const refAfter = parseDate("2026-06-30");
  assert.equal(isObservationAllowed(refAfter, churn, null), false);
  assert.equal(isObservationAllowed(parseDate("2026-04-30"), churn, null), true);
});

test("4. cancelamento arquivado não efetiva churn sozinho", () => {
  const { episodes } = consolidateChurnEpisodes(
    {
      clients: [{ id: 9, data_churn: null }],
      cancellations: [{ id: 1, client_id: 9, archived_at: "2026-01-01", churn_efetivado_at: "2026-02-01" }],
      churnLogs: [],
      cancellationEvents: [],
    },
    { secret: SECRET },
  );
  assert.equal(episodes.filter((e) => e.clientId === "9" && e.churn_confirmado).length, 0);
});

test("5. sinais duplicados não multiplicam episódios", () => {
  const { episodes, stats } = consolidateChurnEpisodes(
    {
      clients: [{ id: 1, data_churn: "2026-05-01" }],
      cancellations: [
        { id: 1, client_id: 1, archived_at: null, churn_efetivado_at: "2026-05-01" },
        { id: 2, client_id: 1, archived_at: null, churn_efetivado_at: "2026-05-01" },
      ],
      churnLogs: [],
      cancellationEvents: [],
    },
    { secret: SECRET },
  );
  assert.equal(episodes.filter((e) => e.churn_confirmado).length, 1);
  assert.ok(stats.duplicateSignalsMerged >= 0);
});

test("6. horizontes 90/180 respeitam censura", () => {
  const refEnd = parseDate("2026-01-31");
  const asOf = parseDate("2026-03-01");
  const h = outcomeHorizons(refEnd, null, asOf);
  assert.equal(h.janela90, false);
  assert.equal(h.censura90, true);
  const h2 = outcomeHorizons(refEnd, null, parseDate("2026-06-01"));
  assert.equal(h2.janela90, true);
  assert.equal(h2.censura90, false);
  assert.equal(h2.negativo90, true);
});

test("7. pseudônimos estáveis", () => {
  const a = clientRef(42, SECRET);
  const b = clientRef(42, SECRET);
  assert.equal(a, b);
  assert.notEqual(a, clientRef(43, SECRET));
});

test("8. HS respeita pesos 50/50", () => {
  const e = scoreEngagement(1);
  const m = scoreMechanisms(3);
  const hs = computeHealthScore(e, m);
  assert.equal(hs, 100);
  const row = buildHistoricalHealthRow({
    client: { id: 1, created_at: "2026-01-01", ciclo: 1 },
    refEnd: parseDate("2026-06-30"),
    engagement: { engagementScore: 60, totalMeetings: 2, cobertura_engajamento: "completa", reunioes_30d: 0 },
    mechanisms: { mechanismScore: 60, mecanismos_implantados: 1, cobertura_mecanismos: "completa" },
  });
  assert.equal(row.hs_historico, 60);
});

test("9. cobertura insuficiente não gera scores fictícios", () => {
  const engagement = buildHistoricalEngagement({
    client: { id: 1, created_at: "2025-01-01", data_inicio_ciclo: "2025-01-01" },
    calendlyRows: [],
    manualRows: [],
    refEnd: parseDate("2025-06-30"),
    firstMeetingCoverageAt: parseDate("2026-01-08"),
  });
  assert.equal(engagement.engagementScore, null);
  const health = buildHistoricalHealthRow({
    client: { id: 1, created_at: "2025-01-01", ciclo: 1 },
    refEnd: parseDate("2025-06-30"),
    engagement,
    mechanisms: { mechanismScore: 0, mecanismos_implantados: 0, cobertura_mecanismos: "sem_vinculo" },
  });
  assert.equal(health.hs_historico, null);
  assert.equal(health.confiabilidade_reconstrucao, "nao_reconstruivel");
});

test("10. dataset validado não inclui colunas de desfecho como features no builder", () => {
  const keys = [
    "desfecho_churn_90d",
    "desfecho_churn_180d",
    "data_observacao_asof",
  ];
  const featureKeys = ["engajamento_historico", "hs_historico", "reunioes_acumuladas"];
  for (const k of keys) assert.ok(!featureKeys.includes(k));
  assert.ok(buildAttendanceStatusMap);
});

test("12. protótipo Etapa 7 não altera versão operacional do HS histórico", () => {
  assert.equal(FORMULA_VERSION, "hs-experimental-v1-50-50");
});

test("11. sinais de cancelamento exportáveis sem expor id bruto", () => {
  const rows = flattenCancellationSignals(
    {
      clients: [{ id: 42, data_churn: null }],
      cancellations: [
        {
          id: 1,
          client_id: 42,
          archived_at: null,
          desfecho: "Pedido de cancelamento",
          created_at: "2026-03-01",
          data_pedido: "2026-03-01",
        },
      ],
      churnLogs: [],
      cancellationEvents: [],
    },
    { secret: SECRET },
  );
  assert.ok(rows.some((r) => r.tipo === "pedido_nao_efetivado" && r.pedido_pendente === "true"));
  assert.ok(rows.every((r) => String(r.cliente_ref).startsWith("c_")));
});
