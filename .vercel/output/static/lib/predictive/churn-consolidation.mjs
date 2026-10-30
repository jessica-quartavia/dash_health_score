/**
 * Consolidação auditável de episódios de churn (somente leitura, sem inventar datas).
 */
import { blankToNull, foldText, parseDate } from "../utils.mjs";
import { isDistratoTextSigned } from "../status.mjs";
import { clientRef, episodeRef } from "./pseudonym.mjs";
import { sameUtcDay } from "./dates.mjs";

const EFFECTIVE_EVENT_TYPES = new Set([
  "churn_efetivado",
  "churn_efetivado_at",
  "efetivado",
  "distrato_assinado",
  "cancelamento_efetivado",
]);

function isoDay(date) {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function pushSignal(bucket, signal) {
  if (!bucket) return;
  bucket.push(signal);
}

function isEffectiveCancellationRow(row) {
  if (!row || parseDate(row.archived_at)) return false;
  if (parseDate(row.churn_efetivado_at)) return true;
  if (parseDate(row.distrato_assinado_at)) return true;
  if (isDistratoTextSigned(row.distrato)) return true;
  return false;
}

function isPendingCancellationRow(row) {
  if (!row || parseDate(row.archived_at)) return false;
  if (isEffectiveCancellationRow(row)) return false;
  const desfecho = foldText(row.desfecho || row.estagio_cliente);
  return desfecho.includes("pedido") || desfecho.includes("intenc") || desfecho.includes("solicit");
}

function collectSignalsByClient({ clients = [], cancellations = [], churnLogs = [], cancellationEvents = [] }) {
  const map = new Map();
  const ensure = (id) => {
    const key = String(id);
    if (!map.has(key)) map.set(key, []);
    return map.get(key);
  };

  for (const row of cancellations || []) {
    const clientId = blankToNull(row.client_id);
    if (!clientId) continue;
    if (parseDate(row.archived_at)) {
      pushSignal(ensure(clientId), {
        fonte: "cancellations",
        tipo: "arquivado",
        data: parseDate(row.churn_efetivado_at) || parseDate(row.created_at),
        confiabilidade: "baixa",
        efetivo: false,
        archived: true,
        rowId: row.id,
      });
      continue;
    }
    const efetivado = parseDate(row.churn_efetivado_at);
    const distrato = parseDate(row.distrato_assinado_at);
    if (efetivado) {
      pushSignal(ensure(clientId), {
        fonte: "cancellations",
        tipo: "churn_efetivado_at",
        data: efetivado,
        confiabilidade: "alta",
        efetivo: true,
        rowId: row.id,
      });
    } else if (distrato) {
      pushSignal(ensure(clientId), {
        fonte: "cancellations",
        tipo: "distrato_assinado_at",
        data: distrato,
        confiabilidade: "alta",
        efetivo: true,
        rowId: row.id,
      });
    } else if (isDistratoTextSigned(row.distrato)) {
      pushSignal(ensure(clientId), {
        fonte: "cancellations",
        tipo: "distrato_assinado_sem_data",
        data: null,
        confiabilidade: "baixa",
        efetivo: true,
        rowId: row.id,
      });
    } else if (isPendingCancellationRow(row)) {
      pushSignal(ensure(clientId), {
        fonte: "cancellations",
        tipo: "pedido_nao_efetivado",
        data: parseDate(row.data_pedido) || parseDate(row.created_at),
        confiabilidade: "media",
        efetivo: false,
        rowId: row.id,
      });
    }
  }

  for (const client of clients || []) {
    const clientId = blankToNull(client.id);
    if (!clientId) continue;
    const dataChurn = parseDate(client.data_churn);
    if (dataChurn) {
      pushSignal(ensure(clientId), {
        fonte: "clients",
        tipo: "data_churn",
        data: dataChurn,
        confiabilidade: "alta",
        efetivo: true,
        rowId: client.id,
      });
    }
  }

  const logBest = new Map();
  for (const row of churnLogs || []) {
    const clientId = blankToNull(row.client_id);
    if (!clientId) continue;
    const data = parseDate(row.data_churn) || parseDate(row.created_at);
    const key = String(clientId);
    const prev = logBest.get(key);
    if (!prev || (data && (!prev.data || data > prev.data))) {
      logBest.set(key, { row, data });
    }
  }
  for (const [clientId, { row, data }] of logBest.entries()) {
    pushSignal(ensure(clientId), {
      fonte: "churn_logs",
      tipo: "data_churn_log",
      data,
      confiabilidade: data ? "media" : "sem_data",
      efetivo: true,
      rowId: row.id,
    });
  }

  for (const row of cancellationEvents || []) {
    const clientId = blankToNull(row.client_id);
    if (!clientId) continue;
    const tipo = foldText(row.event_type);
    const data = parseDate(row.event_at) || parseDate(row.data_estimada) || parseDate(row.created_at);
    const efetivo = EFFECTIVE_EVENT_TYPES.has(tipo) || tipo.includes("efetiv") || tipo.includes("distrato");
    pushSignal(ensure(clientId), {
      fonte: "cancellation_events",
      tipo: row.event_type || "evento",
      data,
      confiabilidade: data ? (efetivo ? "media" : "baixa") : "sem_data",
      efetivo,
      rowId: row.id,
    });
  }

  return map;
}

/**
 * Precedência explícita (não usa mínima data cega):
 * 1) churn_efetivado_at (cancellations)
 * 2) distrato_assinado_at
 * 3) clients.data_churn
 * 4) churn_logs.data_churn
 * 5) cancellation_events efetivos
 */
function pickPrimaryDate(effectiveSignals) {
  const order = [
    "churn_efetivado_at",
    "distrato_assinado_at",
    "data_churn",
    "data_churn_log",
  ];
  for (const tipo of order) {
    const match = effectiveSignals.find((s) => s.tipo === tipo && s.data);
    if (match) return { date: match.data, fonte: match.fonte, tipo: match.tipo, confiabilidade: match.confiabilidade };
  }
  const event = effectiveSignals.find((s) => s.fonte === "cancellation_events" && s.efetivo && s.data);
  if (event) return { date: event.data, fonte: event.fonte, tipo: event.tipo, confiabilidade: event.confiabilidade };
  const noDate = effectiveSignals.find((s) => s.efetivo && !s.data);
  if (noDate) return { date: null, fonte: noDate.fonte, tipo: noDate.tipo, confiabilidade: "sem_data" };
  return null;
}

function detectDateConflict(dates) {
  const valid = dates.filter(Boolean);
  if (valid.length < 2) return false;
  const min = valid.reduce((a, b) => (a < b ? a : b));
  const max = valid.reduce((a, b) => (a > b ? a : b));
  const diffDays = Math.floor((max - min) / 86400000);
  return diffDays > 30;
}

function dedupeSignals(signals) {
  const seen = new Set();
  const out = [];
  for (const signal of signals) {
    const key = `${signal.fonte}|${signal.tipo}|${isoDay(signal.data)}|${signal.rowId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(signal);
  }
  return out;
}

export function consolidateChurnEpisodes(input, { secret } = {}) {
  const byClient = collectSignalsByClient(input);
  const episodes = [];
  const stats = {
    clientsWithSignals: byClient.size,
    episodesConfirmed: 0,
    episodesWithoutDate: 0,
    dateConflicts: 0,
    archivedOnly: 0,
    pendingNotEffective: 0,
    duplicateSignalsMerged: 0,
  };

  for (const [clientId, rawSignals] of byClient.entries()) {
    const signals = dedupeSignals(rawSignals);
    stats.duplicateSignalsMerged += Math.max(0, rawSignals.length - signals.length);
    const effective = signals.filter((s) => s.efetivo);
    const archived = signals.filter((s) => s.archived);
    const pending = signals.filter((s) => s.tipo === "pedido_nao_efetivado");
    stats.pendingNotEffective += pending.length;
    if (!effective.length && archived.length) stats.archivedOnly += 1;

    if (!effective.length) {
      if (pending.length) {
        episodes.push({
          clientId,
          cliente_ref: clientRef(clientId, secret),
          episodio_churn_id: "",
          churn_confirmado: false,
          churn_data: "",
          churn_fonte_principal: "",
          fontes_confirmatorias: pending.map((s) => s.fonte).join("|"),
          confiabilidade_data: "sem_data",
          conflito_datas: false,
          elegivel_modelagem: false,
          motivo_exclusao: "cancelamento_nao_efetivado",
        });
      }
      continue;
    }

    const primary = pickPrimaryDate(effective);
    const effectiveDates = effective.map((s) => s.data).filter(Boolean);
    const conflito = detectDateConflict(effectiveDates);
    if (conflito) stats.dateConflicts += 1;

    const confirmadas = [...new Set(effective.map((s) => `${s.fonte}:${s.tipo}`))].join("|");
    const churnData = primary?.date || null;
    if (!churnData) stats.episodesWithoutDate += 1;
    else stats.episodesConfirmed += 1;

    let elegivel = Boolean(churnData) && primary?.confiabilidade !== "sem_data";
    let motivo = elegivel ? "" : "sem_data_confiavel";
    if (conflito && churnData) {
      motivo = motivo ? `${motivo};conflito_datas` : "conflito_datas";
    }

    episodes.push({
      clientId,
      cliente_ref: clientRef(clientId, secret),
      episodio_churn_id: episodeRef(clientId, 1, secret),
      churn_confirmado: true,
      churn_data: churnData ? churnData.toISOString() : "",
      churn_fonte_principal: primary ? `${primary.fonte}:${primary.tipo}` : "",
      fontes_confirmatorias: confirmadas,
      confiabilidade_data: primary?.confiabilidade || "sem_data",
      conflito_datas: conflito,
      elegivel_modelagem: elegivel,
      motivo_exclusao: elegivel ? "" : motivo,
    });
  }

  return { episodes, stats, policy: CHURN_CONSOLIDATION_POLICY };
}

export const CHURN_CONSOLIDATION_POLICY = `
Precedência de data (quando churn efetivo confirmado):
1. cancellations.churn_efetivado_at (não arquivado)
2. cancellations.distrato_assinado_at
3. clients.data_churn
4. churn_logs.data_churn (registro mais recente por cliente)
5. cancellation_events com tipo efetivo/distrato

Arquivados: registrados como evidência, não efetivam churn.
Pedidos/intenções: não efetivados — não entram como desfecho.
Conflito: datas efetivas divergentes > 30 dias — mantém precedência, flag conflito_datas.
Reativação: episódios múltiplos exigem histórico de status; nesta versão, 1 episódio principal por cliente.
`.trim();

export function episodesByClientRef(episodes) {
  const map = new Map();
  for (const ep of episodes) {
    if (!ep.churn_confirmado || !ep.churn_data) continue;
    const date = parseDate(ep.churn_data);
    if (!date) continue;
    map.set(ep.cliente_ref, { ...ep, churnDate: date });
  }
  return map;
}

/** Sinais pseudonimizados para auditoria point-in-time (Etapa 6). */
export function flattenCancellationSignals(input, { secret } = {}) {
  const byClient = collectSignalsByClient(input);
  const rows = [];
  for (const [clientId, rawSignals] of byClient.entries()) {
    const cref = clientRef(clientId, secret);
    const signals = dedupeSignals(rawSignals);
    for (const s of signals) {
      rows.push({
        cliente_ref: cref,
        fonte: s.fonte,
        tipo: s.tipo,
        data_sinal: s.data ? s.data.toISOString() : "",
        efetivo: s.efetivo ? "true" : "false",
        pedido_pendente: s.tipo === "pedido_nao_efetivado" ? "true" : "false",
        confiabilidade: s.confiabilidade || "",
      });
    }
  }
  return rows;
}
