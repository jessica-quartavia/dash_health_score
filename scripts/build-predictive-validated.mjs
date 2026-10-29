/**
 * Etapa 3: base histórica validada (somente leitura BASE QV).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAllRows } from "../lib/data/supabase-rest.mjs";
import { dataConfigurationError } from "../lib/env.mjs";
import { filterExcludedClients } from "../lib/utils.mjs";
import { ANALYTICAL_CANCEL_SELECT } from "../lib/status.mjs";
import { buildValidatedPredictivePipeline } from "../lib/predictive/build-validated-dataset.mjs";
import { clientRef, pseudonymSecret } from "../lib/predictive/pseudonym.mjs";
import { CHURN_CONSOLIDATION_POLICY, flattenCancellationSignals } from "../lib/predictive/churn-consolidation.mjs";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "exports", "predictive-study");

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[;"\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(name, columns, rows) {
  const header = columns.map((c) => csvEscape(c)).join(";");
  const lines = rows.map((row) => columns.map((col) => csvEscape(row[col] ?? "")).join(";"));
  writeFileSync(join(DIR, name), `\uFEFF${[header, ...lines].join("\r\n")}\r\n`, "utf8");
}

async function loadAll() {
  const [clients, calendlyRows, manualRows, mechanismRows, attendanceRows, cancellations, npsRows] = await Promise.all([
    fetchAllRows({ table: "clients", select: "id,status,programa,ciclo,data_inicio_ciclo,data_churn,created_at,data_descongelamento", order: "id.asc" }),
    fetchAllRows({ table: "client_meetings", select: "id,client_id,start_time,calendly_event_uri", order: "start_time.asc" }),
    fetchAllRows({ table: "manual_meetings", select: "id,client_id,start_time", order: "start_time.asc" }),
    fetchAllRows({ table: "client_mecanismos", select: "id,client_id,mecanismo_id,status,implemented_at,created_at", order: "created_at.asc" }),
    fetchAllRows({ table: "meeting_attendance", select: "id,calendly_event_uri,status,created_at,updated_at", order: "created_at.asc" }),
    fetchAllRows({ table: "cancellations", select: `${ANALYTICAL_CANCEL_SELECT},client_id,desfecho,estagio_cliente,data_pedido,distrato`, order: "id.asc" }),
    fetchAllRows({ table: "nps_responses", select: "id,client_id,score,submitted_at,created_at", order: "submitted_at.asc" }),
  ]);
  const [churnLogs, cancellationEvents] = await Promise.all([
    fetchAllRows({ table: "churn_logs", select: "id,client_id,data_churn,created_at", order: "created_at.asc" }),
    fetchAllRows({ table: "cancellation_events", select: "id,client_id,event_type,event_at,data_estimada,created_at", order: "event_at.asc" }),
  ]);
  return {
    clients: filterExcludedClients(clients),
    calendlyRows,
    manualRows,
    mechanismRows,
    attendanceRows,
    cancellations,
    npsRows,
    churnLogs,
    cancellationEvents,
  };
}

async function main() {
  const configError = dataConfigurationError();
  if (configError) {
    console.error(configError.message);
    process.exitCode = 1;
    return;
  }
  mkdirSync(DIR, { recursive: true });
  const extractedAt = new Date();
  const secret = pseudonymSecret(DIR);
  const raw = await loadAll();
  const result = buildValidatedPredictivePipeline(raw, { extractedAt, secret });

  const churnCols = [
    "cliente_ref",
    "episodio_churn_id",
    "churn_confirmado",
    "churn_data",
    "churn_fonte_principal",
    "fontes_confirmatorias",
    "confiabilidade_data",
    "conflito_datas",
    "elegivel_modelagem",
    "motivo_exclusao",
  ];
  const signalCols = [
    "cliente_ref",
    "fonte",
    "tipo",
    "data_sinal",
    "efetivo",
    "pedido_pendente",
    "confiabilidade",
  ];
  writeCsv(
    "cancelamento_sinais.csv",
    signalCols,
    flattenCancellationSignals(
      {
        clients: raw.clients,
        cancellations: raw.cancellations,
        churnLogs: raw.churnLogs,
        cancellationEvents: raw.cancellationEvents,
      },
      { secret },
    ),
  );

  const clientSnapCols = [
    "cliente_ref",
    "programa",
    "created_at",
    "data_inicio_ciclo",
    "cliente_desde",
    "data_churn_snapshot",
    "ciclo",
  ];
  writeCsv(
    "clientes_cadastro_snapshot.csv",
    clientSnapCols,
    raw.clients.map((c) => ({
      cliente_ref: clientRef(String(c.id), secret),
      programa: c.programa || "",
      created_at: c.created_at || "",
      data_inicio_ciclo: c.data_inicio_ciclo || "",
      cliente_desde: c.cliente_desde || c.data_inicio_ciclo || c.created_at || "",
      data_churn_snapshot: c.data_churn || "",
      ciclo: c.ciclo ?? "",
    })),
  );

  writeCsv(
    "churn_consolidado.csv",
    churnCols,
    result.episodes.map((ep) => ({
      ...ep,
      churn_confirmado: ep.churn_confirmado ? "true" : "false",
      conflito_datas: ep.conflito_datas ? "true" : "false",
      elegivel_modelagem: ep.elegivel_modelagem ? "true" : "false",
    })),
  );

  const hsCols = [
    "cliente_ref",
    "mes_referencia",
    "data_referencia",
    "engajamento_historico",
    "mecanismos_historico",
    "hs_historico",
    "classificacao_historica",
    "cobertura_engajamento",
    "cobertura_mecanismos",
    "confiabilidade_reconstrucao",
    "versao_formula",
    "reunioes_acumuladas",
    "reunioes_30d",
    "reunioes_90d",
    "reunioes_180d",
    "recencia_dias",
    "freq_media_mes",
    "mecanismos_implantados",
  ];
  writeCsv(
    "hs_historico_mensal.csv",
    hsCols,
    result.hsHistorico.map((row) => ({
      ...row,
      engajamento_historico: row.engajamento_historico ?? "",
      mecanismos_historico: row.mecanismos_historico ?? "",
      hs_historico: row.hs_historico ?? "",
    })),
  );

  const valCols = [
    ...hsCols,
    "programa",
    "elegivel_modelagem_90d",
    "elegivel_modelagem_180d",
    "desfecho_churn_90d",
    "desfecho_churn_180d",
    "censura_90d",
    "censura_180d",
    "janela_90d_completa",
    "janela_180d_completa",
    "data_observacao_asof",
    "motivo_exclusao",
  ];
  writeCsv(
    "dataset_preditivo_validado.csv",
    valCols,
    result.validated.map((row) => ({
      ...row,
      engajamento_historico: row.engajamento_historico ?? "",
      mecanismos_historico: row.mecanismos_historico ?? "",
      hs_historico: row.hs_historico ?? "",
      elegivel_modelagem_90d: row.elegivel_modelagem_90d ? "true" : "false",
      elegivel_modelagem_180d: row.elegivel_modelagem_180d ? "true" : "false",
      desfecho_churn_90d: row.desfecho_churn_90d ? "true" : "false",
      desfecho_churn_180d: row.desfecho_churn_180d ? "true" : "false",
      censura_90d: row.censura_90d ? "true" : "false",
      censura_180d: row.censura_180d ? "true" : "false",
      janela_90d_completa: row.janela_90d_completa ? "true" : "false",
      janela_180d_completa: row.janela_180d_completa ? "true" : "false",
    })),
  );

  const eligibility = [
    {
      horizonte_dias: 90,
      linhas_elegiveis: result.audit.rowsEligible90,
      positivos: result.audit.positives90,
      negativos: result.audit.negatives90,
      censurados: result.audit.censored90,
    },
    {
      horizonte_dias: 180,
      linhas_elegiveis: result.audit.rowsEligible180,
      positivos: result.audit.positives180,
      negativos: result.audit.negatives180,
      censurados: result.audit.censored180,
    },
  ];
  writeCsv(
    "elegibilidade_horizontes.csv",
    ["horizonte_dias", "linhas_elegiveis", "positivos", "negativos", "censurados"],
    eligibility,
  );

  const temporalRows = Object.entries(result.audit.eventsByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, eventos]) => ({ mes, eventos_churn: eventos }));
  writeCsv("distribuicao_churn_mes.csv", ["mes", "eventos_churn"], temporalRows);

  const readiness = {
    generatedAt: extractedAt.toISOString(),
    asOf: result.asOf.toISOString(),
    churnPolicy: CHURN_CONSOLIDATION_POLICY,
    churnStats: result.churnStats,
    audit: result.audit,
    rowCounts: {
      churn_consolidado: result.episodes.length,
      hs_historico_mensal: result.hsHistorico.length,
      dataset_preditivo_validado: result.validated.length,
    },
    eligibility,
    leakageChecks: [
      "Features usam reuniões/mecanismos até data_referencia",
      "HS histórico omitido quando cobertura insuficiente",
      "Observações pós-churn excluídas até reativação detectada",
      "pred_scores e status atual não entram como preditor",
    ],
    trainingReady: result.audit.rowsEligible90 > 0
      && result.audit.hsIntegral > 0
      && result.churnStats.episodesConfirmed > 0,
    trainingReadyNote:
      "Pronto para treino apenas se trainingReady=true e testes automatizados passarem.",
  };
  writeFileSync(join(DIR, "predictive_readiness.json"), `${JSON.stringify(readiness, null, 2)}\n`, "utf8");

  writeFileSync(
    join(DIR, "relatorio_temporal_auditoria.md"),
    `# Auditoria temporal (Etapa 3)

Gerado: ${readiness.generatedAt}
As-of observação: ${readiness.asOf}

## Churn consolidado
- Episódios confirmados: ${result.churnStats.episodesConfirmed}
- Sem data confiável: ${result.churnStats.episodesWithoutDate}
- Conflitos de data: ${result.churnStats.dateConflicts}

## HS histórico
- Integral: ${result.audit.hsIntegral}
- Parcial: ${result.audit.hsParcial}
- Não reconstruível: ${result.audit.hsNaoReconstruivel}

## Dataset validado
- Linhas: ${result.validated.length}
- Excluídas pós-churn: ${result.audit.rowsExcludedPostChurn}
- Elegíveis 90d: ${result.audit.rowsEligible90} (positivos ${result.audit.positives90}, censura ${result.audit.censored90})
- Elegíveis 180d: ${result.audit.rowsEligible180}

## Política churn
${CHURN_CONSOLIDATION_POLICY}
`,
    "utf8",
  );

  console.log(`churn_consolidado.csv: ${result.episodes.length} episódios`);
  console.log(`hs_historico_mensal.csv: ${result.hsHistorico.length} linhas`);
  console.log(`dataset_preditivo_validado.csv: ${result.validated.length} linhas`);
  console.log(`trainingReady=${readiness.trainingReady}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
