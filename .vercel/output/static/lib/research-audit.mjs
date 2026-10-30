/**
 * Metadados de auditoria para Pesquisa Preditiva (somente leitura, sem inventar dados).
 */
import { normalizeClientStatus } from "./status.mjs";

const SOURCE_INVENTORY = [
  { table: "clients", role: "Cadastro principal", grain: "cliente" },
  { table: "cancellations", role: "Processo de cancelamento (intenção, pedido, efetivado)", grain: "evento/linha" },
  { table: "churn_logs", role: "Histórico de churn registrado", grain: "evento" },
  { table: "cancellation_events", role: "Eventos de cancelamento", grain: "evento" },
  { table: "renewal_cycles", role: "Ciclos de renovação contratual", grain: "ciclo" },
  { table: "renewal_events", role: "Eventos de renovação", grain: "evento" },
  { table: "client_cycles", role: "Histórico de ciclos por cliente", grain: "ciclo" },
  { table: "client_meetings", role: "Reuniões Calendly", grain: "reunião" },
  { table: "manual_meetings", role: "Reuniões manuais", grain: "reunião" },
  { table: "meeting_attendance", role: "Presença em reuniões", grain: "presença" },
  { table: "client_mecanismos", role: "Vínculo cliente × mecanismo", grain: "implementação" },
  { table: "mecanismos", role: "Catálogo de mecanismos", grain: "produto" },
  { table: "nps_responses", role: "Respostas NPS", grain: "resposta" },
  { table: "csat_responses", role: "Respostas CSAT", grain: "resposta" },
  { table: "client_financial_data", role: "Perfil financeiro (snapshot)", grain: "cliente" },
  { table: "recepcao_onboarding", role: "Onboarding", grain: "cliente" },
  { table: "client_activity_control", role: "Controle de atividade", grain: "cliente" },
  { table: "demands", role: "Demandas de suporte", grain: "acionamento" },
  { table: "tasks", role: "Tarefas de suporte", grain: "acionamento" },
  { table: "client_pendencias", role: "Pendências", grain: "acionamento" },
  { table: "pred_scores", role: "Scores de modelo (excluído do estudo — vazamento)", grain: "score" },
];

function parseTime(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildResearchAudit(raw = {}, allRows = []) {
  const clients = raw.clients || [];
  const cancelMap = raw.cancelMap || new Map();
  const cancellations = raw.cancellations || [];

  const statusCounts = {};
  for (const client of clients) {
    const st = normalizeClientStatus(client.status);
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  }

  let cancelEvidence = 0;
  let cancelWithDate = 0;
  let renewedCycle = 0;
  let activeAnalytical = 0;
  for (const row of allRows) {
    if (row.hasCancellationEvidence) cancelEvidence += 1;
    if (row.cancellationDate) cancelWithDate += 1;
    if (row.hasRenewed) renewedCycle += 1;
    if (row.analyticalStatus === "Ativo") activeAnalytical += 1;
  }

  const archivedCancellationRows = cancellations.filter((row) => parseTime(row.archived_at)).length;
  const nonArchivedCancellationRows = cancellations.length - archivedCancellationRows;

  const npsFilled = allRows.filter((row) => row.npsScore != null).length;
  const npsMissingPct = allRows.length ? ((allRows.length - npsFilled) / allRows.length) * 100 : 0;

  const entryDates = clients.map((c) => parseTime(c.data_inicio_ciclo || c.created_at)).filter(Boolean);
  const meetingMin = parseTime(raw.meetingSpanMin);
  const meetingMax = parseTime(raw.meetingSpanMax);

  return {
    auditedAt: new Date().toISOString(),
    definitions: {
      churnDashboard:
        "Cancelamento efetivado: churn_efetivado_at OU distrato_assinado_at OU distrato Assinado OU clients.data_churn (mapa analítico). Intenção/pedido não retiram da carteira ativa.",
      renewalDashboard:
        "Proxy atual: clients.ciclo > 1 (hasRenewed). Não equivale automaticamente a evento contratual — validar com renewal_cycles e renewal_events.",
      activeDefault:
        "Recorte operacional padrão: analyticalStatus = Ativo. Oculta cancelados na UI operacional; use população Total na Pesquisa Preditiva.",
    },
    population: {
      clientsLoaded: clients.length,
      rowsInCurrentCluster: allRows.length,
      activeAnalytical,
      cancelEvidence,
      cancelWithDate,
      renewedByCycleGt1: renewedCycle,
      statusRaw: statusCounts,
    },
    sources: SOURCE_INVENTORY.map((item) => ({
      ...item,
      rowsInDashboardLoad: raw.counts?.[item.table] ?? raw.counts?.[mapCountKey(item.table)] ?? null,
    })),
    cancellationsTable: {
      totalRows: cancellations.length,
      nonArchivedRows: nonArchivedCancellationRows,
      archivedRows: archivedCancellationRows,
    },
    coverage: {
      clientEntry: entryDates.length
        ? { min: entryDates.sort((a, b) => a - b)[0].toISOString(), max: entryDates.at(-1).toISOString() }
        : null,
      meetings: meetingMin && meetingMax ? { min: meetingMin.toISOString(), max: meetingMax.toISOString() } : null,
      nps: {
        filled: npsFilled,
        missingPercent: Math.round(npsMissingPct * 10) / 10,
      },
    },
    temporalDataset: {
      unit: "cliente × mês de referência",
      status: "parcial",
      note:
        "Reuniões, mecanismos e NPS permitem recorte até a data de referência. E, M e HS do dashboard usam histórico de reuniões/mecanismos, mas o export de clientes ainda é snapshot — ver dataset_preditivo_candidato.csv.",
      horizonsDays: [90, 180],
      leakageRisks: [
        "status e ciclo atuais no cadastro",
        "data_churn como desfecho, não como preditor",
        "pred_scores excluído de propósito",
      ],
    },
    modelCandidates: [
      { id: "A", label: "Engajamento (E e componentes)" },
      { id: "B", label: "Mecanismos (M e componentes)" },
      { id: "C", label: "HS experimental ponderado" },
      { id: "D", label: "Dados estruturados históricos" },
      { id: "E", label: "Estruturados + E + M" },
    ],
    studyPhase: "auditoria e extração — sem treino de modelo",
  };
}

function mapCountKey(table) {
  const map = {
    clients: "clients",
    client_meetings: "clientMeetings",
    manual_meetings: "manualMeetings",
    meeting_attendance: "meetingAttendance",
    client_mecanismos: "clientMecanismos",
    cancellations: "cancellations",
    nps_responses: "npsResponses",
    mecanismos: "mecanismos",
  };
  return map[table] || table;
}

export function researchRowsForPopulation(allRows, population) {
  const rows = allRows || [];
  switch (population) {
    case "ativos":
      return rows.filter((row) => row.analyticalStatus === "Ativo");
    case "cancelados":
      return rows.filter((row) => row.hasCancellationEvidence);
    case "renovados":
      return rows.filter((row) => row.hasRenewed);
    case "com_desfecho":
      return rows.filter((row) => row.hasCancellationEvidence || row.hasRenewed);
    case "total":
    default:
      return rows;
  }
}

export { monthKey };
