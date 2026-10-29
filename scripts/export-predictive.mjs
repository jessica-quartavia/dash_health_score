/**
 * Extração somente leitura para estudo preditivo.
 * Não grava no Supabase e não inclui identificadores diretos.
 */
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchAllRows } from "../lib/data/supabase-rest.mjs";
import { isImplementedStatus } from "../lib/mechanisms.mjs";
import { dataConfigurationError, getDataEnv } from "../lib/env.mjs";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "exports", "predictive-study");

function secret() {
  const file = join(DIR, ".pseudonym-secret");
  mkdirSync(DIR, { recursive: true });
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("hex"), "utf8");
  return readFileSync(file, "utf8").trim();
}

const SECRET = secret();

function ref(kind, value) {
  if (value == null || value === "") return "";
  const digest = createHmac("sha256", SECRET).update(`${kind}:${String(value)}`).digest("hex").slice(0, 20);
  return `${kind}_${digest}`;
}

function iso(value) {
  if (value == null || value === "") return "";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function num(value, digits = 2) {
  if (value == null || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "";
}

function bool(value) {
  if (value == null || value === "") return "";
  return value ? "true" : "false";
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[;"\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsv(name, columns, rows) {
  const header = columns.map((column) => csvEscape(column.header)).join(";");
  const lines = rows.map((row) => columns.map((column) => csvEscape(row[column.key])).join(";"));
  writeFileSync(join(DIR, name), `\uFEFF${[header, ...lines].join("\r\n")}\r\n`, "utf8");
}

function stableOrder(order = "id.asc") {
  const text = order || "id.asc";
  if (text.split(",").some((part) => part.trim().startsWith("id."))) return text;
  return `${text},id.asc`;
}

async function readTable(table, select, order = "id.asc") {
  return fetchAllRows({ table, select, order: stableOrder(order) });
}

async function exactCount(table) {
  const configError = dataConfigurationError();
  if (configError) {
    const error = new Error(configError.message);
    error.code = configError.code;
    throw error;
  }
  const { url, serviceRoleKey } = getDataEnv();
  const endpoint = new URL(`/rest/v1/${table}`, url);
  endpoint.searchParams.set("select", "id");
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
      "Accept-Profile": "public",
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  if (!response.ok) return { count: null, status: response.status };
  const match = (response.headers.get("content-range") || "").match(/\/(\d+)$/);
  return { count: match ? Number(match[1]) : null, status: response.status };
}

function indexBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const id = row[key];
    if (id == null) continue;
    const bucket = map.get(String(id)) || [];
    bucket.push(row);
    map.set(String(id), bucket);
  }
  return map;
}

function first(map, id) {
  return (map.get(String(id)) || [])[0] || null;
}

function coverage(values) {
  const dates = values.map(iso).filter(Boolean).sort();
  return { min: dates[0] || "", max: dates[dates.length - 1] || "" };
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfUtcMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
}

function addUtcDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function monthStartsBetween(start, end, maxMonths = 36) {
  const months = [];
  if (!start || !end || start > end) return months;
  let cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endKey = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);
  while (Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), 1) <= endKey && months.length < maxMonths) {
    months.push(new Date(cur));
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return months;
}

function buildPredictiveCandidateRows({ clients, meetingRows, mechanismRows, npsRows, extractedAt }) {
  const meetingsByClient = indexBy(
    meetingRows.map((row) => ({ ...row, client_id: row.cliente_ref })),
    "client_id",
  );
  const mechsByClient = indexBy(
    (mechanismRows || []).map((row) => ({
      client_id: ref("c", row.client_id),
      implemented_at: row.implemented_at,
      status: row.status || "",
    })),
    "client_id",
  );
  const npsByClient = indexBy(
    (npsRows || []).map((row) => ({
      client_id: ref("c", row.client_id),
      submitted_at: row.submitted_at || row.created_at,
      score: row.score,
    })),
    "client_id",
  );

  const rows = [];
  const now = extractedAt;
  for (const client of clients || []) {
    const clienteRef = ref("c", client.id);
    const entry =
      parseDate(client.cliente_desde) ||
      parseDate(client.data_inicio_ciclo) ||
      parseDate(client.created_at);
    if (!entry) continue;
    const churnDate = parseDate(client.data_churn);
    const horizonEnd = churnDate && churnDate < now ? churnDate : now;
    const months = monthStartsBetween(entry, horizonEnd, 36);
    const meetings = (meetingsByClient.get(clienteRef) || []).map((row) => parseDate(row.inicio)).filter(Boolean);
    const mechs = (mechsByClient.get(clienteRef) || []).map((row) => ({
      at: parseDate(row.implemented_at),
      status: row.status,
    }));
    const npsList = (npsByClient.get(clienteRef) || [])
      .map((row) => ({ at: parseDate(row.submitted_at), score: row.score }))
      .filter((row) => row.at);

    for (const monthStart of months) {
      const refEnd = endOfUtcMonth(monthStart.getUTCFullYear(), monthStart.getUTCMonth());
      const mesRef = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, "0")}`;
      const reunioesAte = meetings.filter((date) => date <= refEnd).length;
      const lastMeeting = meetings.filter((date) => date <= refEnd).sort((a, b) => b - a)[0] || null;
      const recenciaDias = lastMeeting ? Math.floor((refEnd - lastMeeting) / 86400000) : "";
      const mecanismosImpl = mechs.filter(
        (row) => row.at && row.at <= refEnd && isImplementedStatus(row.status),
      ).length;
      const npsAte = npsList.filter((row) => row.at <= refEnd).sort((a, b) => b.at - a.at)[0];
      const churn90 =
        churnDate && churnDate > refEnd && churnDate <= addUtcDays(refEnd, 90) ? "true" : "false";
      const churn180 =
        churnDate && churnDate > refEnd && churnDate <= addUtcDays(refEnd, 180) ? "true" : "false";
      const janela90Completa = addUtcDays(refEnd, 90) <= now ? "true" : "false";
      const janela180Completa = addUtcDays(refEnd, 180) <= now ? "true" : "false";
      rows.push({
        cliente_ref: clienteRef,
        mes_referencia: mesRef,
        data_referencia_fim: iso(refEnd),
        reunioes_acumuladas: String(reunioesAte),
        recencia_dias: recenciaDias === "" ? "" : String(recenciaDias),
        mecanismos_implantados_ate: String(mecanismosImpl),
        nps_ultimo_ate: npsAte?.score == null ? "" : num(npsAte.score, 0),
        nps_data_ultimo_ate: npsAte?.at ? iso(npsAte.at) : "",
        desfecho_churn_90d: churn90,
        desfecho_churn_180d: churn180,
        janela_90d_completa: janela90Completa,
        janela_180d_completa: janela180Completa,
        censura: !churnDate || churnDate > refEnd ? "true" : "false",
        nota_metodologica:
          "E, M e HS não recalculados nesta extração; use reunioes/mecanismos/NPS até data_referencia_fim.",
      });
    }
  }
  return rows;
}

function qualityRows(file, columns, rows) {
  return columns.map((column) => {
    const values = rows.map((row) => row[column.key]).filter((value) => value !== "" && value != null);
    const numeric = column.kind === "number" ? values.map(Number).filter(Number.isFinite) : [];
    const dates = column.kind === "date" ? values.map(String).filter(Boolean).sort() : [];
    return {
      arquivo: file,
      coluna: column.header,
      registros: rows.length,
      preenchidos: values.length,
      nulos: rows.length - values.length,
      pct_nulos: rows.length ? ((rows.length - values.length) / rows.length * 100).toFixed(1) : "0.0",
      distintos: new Set(values.map(String)).size,
      minimo: numeric.length ? Math.min(...numeric).toFixed(2) : (dates[0] || ""),
      maximo: numeric.length ? Math.max(...numeric).toFixed(2) : (dates.at(-1) || ""),
    };
  });
}

const dictionary = [];
function define(file, columns) {
  for (const column of columns) {
    dictionary.push({
      arquivo: file,
      coluna: column.header,
      tipo: column.kind || "text",
      descricao: column.description,
      nulos: "campo vazio",
    });
  }
  return columns;
}

async function safeRead(inventory, table, select, order) {
  try {
    const [rows, count] = await Promise.all([readTable(table, select, order), exactCount(table)]);
    const duplicateIds = rows.filter((row) => row.id != null).length - new Set(rows.map((row) => row.id).filter((id) => id != null)).size;
    inventory.push({
      tabela: table,
      status: "lida",
      registros_lidos: rows.length,
      registros_contados: count.count ?? "",
      contagem_confere: count.count == null ? "" : String(count.count === rows.length),
      ids_duplicados: Math.max(0, duplicateIds),
      observacao: "",
    });
    console.log(`${table}: ${rows.length} registros`);
    return rows;
  } catch (error) {
    inventory.push({
      tabela: table,
      status: error?.code || "ERRO",
      registros_lidos: 0,
      registros_contados: "",
      contagem_confere: "",
      ids_duplicados: "",
      observacao: error?.message || "Falha de leitura",
    });
    console.error(`${table}: ${error?.code || "ERRO"} — ${error?.message || "falha"}`);
    return null;
  }
}

function absent(inventory, table, reason) {
  inventory.push({
    tabela: table,
    status: "nao_exportada",
    registros_lidos: "",
    registros_contados: "",
    contagem_confere: "",
    ids_duplicados: "",
    observacao: reason,
  });
}

async function main() {
  const configError = dataConfigurationError();
  if (configError) {
    console.error(`${configError.code}: ${configError.message}`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(DIR, { recursive: true });
  const inventory = [];
  const files = [];
  const quality = [];

  const clients = await safeRead(inventory, "clients", "id,status,programa,engenheiro_patrimonial,ciclo,data_inicio_ciclo,data_fim_ciclo,data_churn,cliente_desde,created_at,contrato_assinado,davos_contrato_assinado,segmentacao,temperatura,engajamento,engajamento_desde,valor_total_pago,is_retido,churn_tipo,origin,archived_at,data_congelamento,data_descongelamento,pre_cadastro_comercial,app_pharus_access,data_ascensao");
  const financial = await safeRead(inventory, "client_financial_data", "id,client_id,ultima_renda_mensal,ultimo_aporte,reserva_liquidez,valor_imoveis_quitados,possui_carro,cheque_especial,parcelamento_cartao,credito_pessoal,credito_consignado,possui_imovel,possui_consorcio,updated_at");
  const onboarding = await safeRead(inventory, "recepcao_onboarding", "id,client_id,grupo_criado,cliente_entrou_grupo,ep_adicionado_grupo,time_qv_adicionado,updated_at");
  const activity = await safeRead(inventory, "client_activity_control", "id,client_id,pendencia,situacao,hype,mapeamento,imersao,planejamento,implementacao,renovacao,contato_semanal,ultimo_contato,updated_at");
  const meetings = await safeRead(inventory, "client_meetings", "id,client_id,start_time,end_time,calendly_event_uri,created_at", "start_time.asc");
  const manual = await safeRead(inventory, "manual_meetings", "id,client_id,start_time,end_time,created_at", "start_time.asc");
  const attendance = await safeRead(inventory, "meeting_attendance", "id,calendly_event_uri,status,created_at,updated_at", "created_at.asc");
  const mechanisms = await safeRead(inventory, "client_mecanismos", "id,client_id,mecanismo_id,status,implemented_at,created_at,no_plano,valor_aplicado,sequence", "created_at.asc");
  const catalog = await safeRead(inventory, "mecanismos", "id,name,categoria,programa,status");
  const cancellations = await safeRead(inventory, "cancellations", "id,client_id,programa,motivo_categoria,desfecho,created_at,data_pedido,distrato_assinado_at,churn_efetivado_at,valor_pago,valor_a_reembolsar,estagio_cliente,passou_retencao,is_critical,formalizacao_tipo,mes_churn,tipo_reembolso,ciclo_inicio_at,archived_at");
  const churnLogs = await safeRead(inventory, "churn_logs", "id,client_id,programa,data_churn,valor_total_pago,ciclo,data_inicio_ciclo,data_fim_ciclo,created_at", "created_at.asc");
  const renewalCycles = await safeRead(inventory, "renewal_cycles", "id,client_id,ciclo_numero,programa,data_fim_original,data_fim_vigente,safra,status,desfecho_em,motivo_categoria,periodo_anos,valor_renovacao,cancelamento,legado,created_at,archived_at", "created_at.asc");
  const clientCycles = await safeRead(inventory, "client_cycles", "id,client_id,cycle_number,started_at,ended_at,estimado,origem,created_at", "created_at.asc");
  const cancellationEvents = await safeRead(inventory, "cancellation_events", "id,client_id,programa,event_type,event_at,motivo_categoria,source,data_estimada,created_at", "event_at.asc");
  const nps = await safeRead(inventory, "nps_responses", "id,client_id,score,submitted_at,created_at,tipo_de_forms", "submitted_at.asc");
  const csat = await safeRead(inventory, "csat_responses", "id,client_id,score,submitted_at,created_at,tipo_de_forms", "submitted_at.asc");
  const npsSends = await safeRead(inventory, "nps_sends", "id,client_id,sent_at,created_at", "sent_at.asc");
  const csatSends = await safeRead(inventory, "csat_sends", "id,client_id,sent_at,created_at", "sent_at.asc");
  const demands = await safeRead(inventory, "demands", "id,client_id,type,priority,status,due_date,requested_by_client,created_at,resolved_at", "created_at.asc");
  const tasks = await safeRead(inventory, "tasks", "id,client_id,priority,status,due_date,tipo,completed,created_at,completed_at", "created_at.asc");
  const pendencias = await safeRead(inventory, "client_pendencias", "id,client_id,category,due_date,completed,completed_at,created_at", "created_at.asc");

  absent(inventory, "pred_scores", "Existe, mas é saída de modelo. Não entra como variável para evitar vazamento.");
  absent(inventory, "crm_leads", "Funil comercial anterior ao cliente, com dados cadastrais. Fora do recorte de clientes.");
  absent(inventory, "contratos_pharus", "Contratos com documentos e dados cadastrais. Fora da extração.");
  absent(inventory, "meeting_attendance.transcript_text", "Texto livre e possível identificador. Apenas o status de presença foi usado.");
  absent(inventory, "csat_responses.comment", "Comentário livre excluído.");
  absent(inventory, "nps_responses.comment", "Comentário livre excluído.");

  const financeByClient = indexBy(financial || [], "client_id");
  const onboardByClient = indexBy(onboarding || [], "client_id");
  const activityByClient = indexBy(activity || [], "client_id");
  const catalogById = new Map((catalog || []).map((row) => [String(row.id), row]));
  const attendanceByUri = new Map();
  for (const row of attendance || []) {
    if (!row.calendly_event_uri) continue;
    const current = attendanceByUri.get(row.calendly_event_uri);
    if (!current || String(row.updated_at || row.created_at) > String(current.updated_at || current.created_at)) {
      attendanceByUri.set(row.calendly_event_uri, row);
    }
  }

  if (clients?.length) {
    const columns = define("clientes_analitico.csv", [
      ["cliente_ref", "text", "Identificador pseudônimo estável do cliente"],
      ["status", "text", "Status cadastral atual. Pode vazar o desfecho se usado como variável histórica."],
      ["programa", "text", "Programa informado no cadastro"],
      ["engenheiro_ref", "text", "Pseudônimo do engenheiro patrimonial atual"],
      ["ciclo", "number", "Ciclo atual. Valor corrente, não histórico."],
      ["data_inicio_ciclo", "date", "Início do ciclo atual"],
      ["data_fim_ciclo", "date", "Fim do ciclo atual"],
      ["cliente_desde", "date", "Data de cliente, quando preenchida"],
      ["created_at", "date", "Criação do cadastro"],
      ["data_churn", "date", "Data de churn cadastrada. É desfecho, não variável anterior ao evento."],
      ["churn_tipo", "text", "Tipo de churn atual"],
      ["data_ascensao", "date", "Data de ascensão"],
      ["contrato_assinado", "text", "Contrato assinado"],
      ["davos_contrato_assinado", "text", "Contrato Davos assinado"],
      ["segmentacao", "text", "Segmentação"],
      ["temperatura", "text", "Temperatura operacional atual"],
      ["engajamento_label", "text", "Rótulo operacional atual de engajamento, distinto da nota E do dashboard"],
      ["engajamento_desde", "date", "Desde quando vale o rótulo atual"],
      ["valor_total_pago", "number", "Valor acumulado atual. Vaza informação futura se usado antes do fim da jornada."],
      ["is_retido", "text", "Marca atual de retenção"],
      ["origin", "text", "Origem do cadastro"],
      ["pre_cadastro_comercial", "text", "Veio de pré-cadastro"],
      ["app_pharus_access", "text", "Acesso ao app"],
      ["archived_at", "date", "Arquivamento"],
      ["data_congelamento", "date", "Início de congelamento"],
      ["data_descongelamento", "date", "Fim de congelamento"],
      ["renda_mensal", "number", "Última renda mensal informada"],
      ["aporte", "number", "Último aporte informado"],
      ["reserva_liquidez", "number", "Reserva de liquidez"],
      ["valor_imoveis_quitados", "number", "Valor de imóveis quitados"],
      ["possui_carro", "text", "Possui carro"],
      ["possui_imovel", "text", "Possui imóvel"],
      ["possui_consorcio", "text", "Possui consórcio"],
      ["cheque_especial", "text", "Usa cheque especial"],
      ["parcelamento_cartao", "text", "Parcelamento no cartão"],
      ["credito_pessoal", "text", "Crédito pessoal"],
      ["credito_consignado", "text", "Crédito consignado"],
      ["financeiro_atualizado_em", "date", "Atualização do registro financeiro"],
      ["onboarding_grupo_criado", "text", "Grupo de onboarding criado"],
      ["onboarding_cliente_entrou", "text", "Cliente entrou no grupo"],
      ["onboarding_ep_adicionado", "text", "EP adicionado ao grupo"],
      ["onboarding_time_adicionado", "text", "Time adicionado ao grupo"],
      ["atividade_pendencia", "text", "Pendência no controle de atividade"],
      ["atividade_situacao", "text", "Situação operacional"],
      ["atividade_hype", "text", "Hype operacional"],
      ["atividade_mapeamento", "text", "Mapeamento marcado"],
      ["atividade_imersao", "text", "Imersão marcada"],
      ["atividade_planejamento", "text", "Planejamento marcado"],
      ["atividade_implementacao", "text", "Implementação marcada"],
      ["atividade_renovacao", "text", "Renovação operacional"],
      ["atividade_contato_semanal", "text", "Contato semanal marcado"],
      ["atividade_ultimo_contato", "date", "Último contato informado"],
    ].map(([key, kind, description]) => ({ key, header: key, kind, description })));

    const rows = clients.map((client) => {
      const finance = first(financeByClient, client.id) || {};
      const onboard = first(onboardByClient, client.id) || {};
      const control = first(activityByClient, client.id) || {};
      return {
        cliente_ref: ref("c", client.id),
        status: client.status || "",
        programa: client.programa || "",
        engenheiro_ref: ref("e", client.engenheiro_patrimonial || ""),
        ciclo: num(client.ciclo, 0),
        data_inicio_ciclo: iso(client.data_inicio_ciclo),
        data_fim_ciclo: iso(client.data_fim_ciclo),
        cliente_desde: iso(client.cliente_desde),
        created_at: iso(client.created_at),
        data_churn: iso(client.data_churn),
        churn_tipo: client.churn_tipo || "",
        data_ascensao: iso(client.data_ascensao),
        contrato_assinado: bool(client.contrato_assinado),
        davos_contrato_assinado: bool(client.davos_contrato_assinado),
        segmentacao: client.segmentacao || "",
        temperatura: client.temperatura || "",
        engajamento_label: client.engajamento || "",
        engajamento_desde: iso(client.engajamento_desde),
        valor_total_pago: num(client.valor_total_pago),
        is_retido: bool(client.is_retido),
        origin: client.origin || "",
        pre_cadastro_comercial: bool(client.pre_cadastro_comercial),
        app_pharus_access: bool(client.app_pharus_access),
        archived_at: iso(client.archived_at),
        data_congelamento: iso(client.data_congelamento),
        data_descongelamento: iso(client.data_descongelamento),
        renda_mensal: num(finance.ultima_renda_mensal),
        aporte: num(finance.ultimo_aporte),
        reserva_liquidez: num(finance.reserva_liquidez),
        valor_imoveis_quitados: num(finance.valor_imoveis_quitados),
        possui_carro: bool(finance.possui_carro),
        possui_imovel: bool(finance.possui_imovel),
        possui_consorcio: bool(finance.possui_consorcio),
        cheque_especial: bool(finance.cheque_especial),
        parcelamento_cartao: bool(finance.parcelamento_cartao),
        credito_pessoal: bool(finance.credito_pessoal),
        credito_consignado: bool(finance.credito_consignado),
        financeiro_atualizado_em: iso(finance.updated_at),
        onboarding_grupo_criado: bool(onboard.grupo_criado),
        onboarding_cliente_entrou: bool(onboard.cliente_entrou_grupo),
        onboarding_ep_adicionado: bool(onboard.ep_adicionado_grupo),
        onboarding_time_adicionado: bool(onboard.time_qv_adicionado),
        atividade_pendencia: bool(control.pendencia),
        atividade_situacao: control.situacao || "",
        atividade_hype: control.hype || "",
        atividade_mapeamento: bool(control.mapeamento),
        atividade_imersao: bool(control.imersao),
        atividade_planejamento: bool(control.planejamento),
        atividade_implementacao: bool(control.implementacao),
        atividade_renovacao: control.renovacao || "",
        atividade_contato_semanal: bool(control.contato_semanal),
        atividade_ultimo_contato: iso(control.ultimo_contato),
      };
    });
    writeCsv("clientes_analitico.csv", columns, rows);
    writeCsv("clientes_historico.csv", columns, rows);
    files.push({ name: "clientes_analitico.csv", rows: rows.length });
    files.push({ name: "clientes_historico.csv", rows: rows.length, alias: "clientes_analitico.csv" });
    quality.push(...qualityRows("clientes_analitico.csv", columns, rows));
    quality.push(...qualityRows("clientes_historico.csv", columns, rows));
  }

  const extractedAt = new Date();
  const meetingRows = [];
  const meetingKeys = new Set();
  let meetingDupes = 0;
  let futureMeetings = 0;
  const isFuture = (value) => {
    const date = new Date(value || "");
    return !Number.isNaN(date.getTime()) && date > extractedAt;
  };
  for (const row of meetings || []) {
    if (isFuture(row.start_time)) {
      futureMeetings += 1;
      continue;
    }
    const key = `${row.client_id}|${row.start_time || ""}`;
    if (meetingKeys.has(key)) meetingDupes += 1;
    meetingKeys.add(key);
    const presence = row.calendly_event_uri ? attendanceByUri.get(row.calendly_event_uri) : null;
    meetingRows.push({
      reuniao_ref: ref("m", row.id),
      cliente_ref: ref("c", row.client_id),
      origem: "client_meetings",
      inicio: iso(row.start_time),
      fim: iso(row.end_time),
      presenca: presence?.status || "",
      created_at: iso(row.created_at),
    });
  }
  for (const row of manual || []) {
    if (isFuture(row.start_time)) {
      futureMeetings += 1;
      continue;
    }
    const key = `${row.client_id}|${row.start_time || ""}`;
    if (meetingKeys.has(key)) meetingDupes += 1;
    meetingKeys.add(key);
    meetingRows.push({
      reuniao_ref: ref("m", `manual:${row.id}`),
      cliente_ref: ref("c", row.client_id),
      origem: "manual_meetings",
      inicio: iso(row.start_time),
      fim: iso(row.end_time),
      presenca: "",
      created_at: iso(row.created_at),
    });
  }
  if (meetingRows.length) {
    const columns = define("reunioes_historico.csv", [
      ["reuniao_ref", "text", "Pseudônimo da reunião"],
      ["cliente_ref", "text", "Pseudônimo do cliente"],
      ["origem", "text", "client_meetings ou manual_meetings"],
      ["inicio", "date", "Início"],
      ["fim", "date", "Fim"],
      ["presenca", "text", "Status de presença quando há attendance. Vazio se desconhecido."],
      ["created_at", "date", "Registro da reunião"],
    ].map(([key, kind, description]) => ({ key, header: key, kind, description })));
    writeCsv("reunioes_historico.csv", columns, meetingRows);
    files.push({ name: "reunioes_historico.csv", rows: meetingRows.length, duplicidades_inicio: meetingDupes, reunioes_futuras_excluidas: futureMeetings });
    quality.push(...qualityRows("reunioes_historico.csv", columns, meetingRows));
  }

  if (mechanisms?.length) {
    const columns = define("mecanismos_historico.csv", [
      ["registro_ref", "text", "Pseudônimo do vínculo cliente-mecanismo"],
      ["cliente_ref", "text", "Pseudônimo do cliente"],
      ["mecanismo_ref", "text", "Pseudônimo do mecanismo"],
      ["mecanismo", "text", "Nome do produto, não do cliente"],
      ["categoria", "text", "Categoria do catálogo"],
      ["programa", "text", "Programa do catálogo"],
      ["status", "text", "Status do vínculo"],
      ["implemented_at", "date", "Data de implementação"],
      ["created_at", "date", "Criação do vínculo"],
      ["no_plano", "text", "Marcado no plano"],
      ["valor_aplicado", "number", "Valor aplicado"],
      ["sequence", "number", "Sequência"],
    ].map(([key, kind, description]) => ({ key, header: key, kind, description })));
    const rows = mechanisms.map((row) => {
      const item = catalogById.get(String(row.mecanismo_id)) || {};
      return {
        registro_ref: ref("cm", row.id),
        cliente_ref: ref("c", row.client_id),
        mecanismo_ref: ref("mec", row.mecanismo_id),
        mecanismo: item.name || "",
        categoria: item.categoria || "",
        programa: item.programa || "",
        status: row.status || "",
        implemented_at: iso(row.implemented_at),
        created_at: iso(row.created_at),
        no_plano: bool(row.no_plano),
        valor_aplicado: num(row.valor_aplicado),
        sequence: num(row.sequence, 0),
      };
    });
    writeCsv("mecanismos_historico.csv", columns, rows);
    files.push({ name: "mecanismos_historico.csv", rows: rows.length });
    quality.push(...qualityRows("mecanismos_historico.csv", columns, rows));
  }

  const outcomeRows = [];
  for (const row of cancellations || []) {
    if (row.archived_at) continue;
    outcomeRows.push({
      evento_ref: ref("ev", `cancel:${row.id}`),
      cliente_ref: ref("c", row.client_id),
      fonte: "cancellations",
      tipo: row.desfecho || row.estagio_cliente || "",
      ocorreu_em: iso(row.churn_efetivado_at || row.distrato_assinado_at || row.mes_churn || row.created_at),
      programa: row.programa || "",
      ciclo: "",
      valor: num(row.valor_pago),
      motivo_categoria: row.motivo_categoria || "",
      status: row.formalizacao_tipo || "",
      cancelamento: bool(Boolean(row.churn_efetivado_at)),
      retencao: bool(row.passou_retencao),
      created_at: iso(row.created_at),
    });
  }
  for (const row of churnLogs || []) {
    outcomeRows.push({
      evento_ref: ref("ev", `churn:${row.id}`),
      cliente_ref: ref("c", row.client_id),
      fonte: "churn_logs",
      tipo: "churn",
      ocorreu_em: iso(row.data_churn || row.created_at),
      programa: row.programa || "",
      ciclo: num(row.ciclo, 0),
      valor: num(row.valor_total_pago),
      motivo_categoria: "",
      status: "",
      cancelamento: "true",
      retencao: "",
      created_at: iso(row.created_at),
    });
  }
  for (const row of renewalCycles || []) {
    outcomeRows.push({
      evento_ref: ref("ev", `renew:${row.id}`),
      cliente_ref: ref("c", row.client_id),
      fonte: "renewal_cycles",
      tipo: "renovacao",
      ocorreu_em: iso(row.desfecho_em || row.data_fim_vigente || row.created_at),
      programa: row.programa || "",
      ciclo: num(row.ciclo_numero, 0),
      valor: num(row.valor_renovacao),
      motivo_categoria: row.motivo_categoria || "",
      status: row.status || "",
      cancelamento: bool(row.cancelamento),
      retencao: "",
      created_at: iso(row.created_at),
    });
  }
  for (const row of clientCycles || []) {
    outcomeRows.push({
      evento_ref: ref("ev", `cycle:${row.id}`),
      cliente_ref: ref("c", row.client_id),
      fonte: "client_cycles",
      tipo: "ciclo",
      ocorreu_em: iso(row.started_at || row.created_at),
      programa: "",
      ciclo: num(row.cycle_number, 0),
      valor: "",
      motivo_categoria: "",
      status: row.origem || "",
      cancelamento: "",
      retencao: "",
      created_at: iso(row.created_at),
    });
  }
  for (const row of cancellationEvents || []) {
    outcomeRows.push({
      evento_ref: ref("ev", `ce:${row.id}`),
      cliente_ref: ref("c", row.client_id),
      fonte: "cancellation_events",
      tipo: row.event_type || "",
      ocorreu_em: iso(row.event_at || row.created_at),
      programa: row.programa || "",
      ciclo: "",
      valor: "",
      motivo_categoria: row.motivo_categoria || "",
      status: row.source || "",
      cancelamento: "",
      retencao: "",
      created_at: iso(row.created_at),
    });
  }
  const outcomeColumns = define("cancelamentos_renovacoes.csv", [
      ["evento_ref", "text", "Pseudônimo do evento"],
      ["cliente_ref", "text", "Pseudônimo do cliente"],
      ["fonte", "text", "Tabela de origem"],
      ["tipo", "text", "Tipo ou desfecho"],
      ["ocorreu_em", "date", "Data do evento. Pode ser estimada na origem."],
      ["programa", "text", "Programa"],
      ["ciclo", "number", "Ciclo associado, quando existe"],
      ["valor", "number", "Valor associado, quando existe"],
      ["motivo_categoria", "text", "Categoria, sem texto livre"],
      ["status", "text", "Status ou origem do registro"],
      ["cancelamento", "text", "Indício de cancelamento"],
      ["retencao", "text", "Passou por retenção, quando a fonte traz o campo"],
      ["created_at", "date", "Criação do registro"],
    ].map(([key, kind, description]) => ({ key, header: key, kind, description })));

  if (outcomeRows.length) {
    const columns = outcomeColumns;
    writeCsv("cancelamentos_renovacoes.csv", columns, outcomeRows);
    files.push({ name: "cancelamentos_renovacoes.csv", rows: outcomeRows.length });
    quality.push(...qualityRows("cancelamentos_renovacoes.csv", columns, outcomeRows));

    const churnEvents = outcomeRows.filter(
      (row) =>
        row.fonte === "churn_logs" ||
        row.cancelamento === "true" ||
        (row.fonte === "cancellation_events" && String(row.tipo).toLowerCase().includes("churn")),
    );
    writeCsv("churn_eventos.csv", columns, churnEvents);
    files.push({ name: "churn_eventos.csv", rows: churnEvents.length });
    quality.push(...qualityRows("churn_eventos.csv", columns, churnEvents));

    const renewalEvents = outcomeRows.filter(
      (row) => row.fonte === "renewal_cycles" || row.fonte === "client_cycles" || row.tipo === "renovacao",
    );
    writeCsv("renovacoes_eventos.csv", columns, renewalEvents);
    files.push({ name: "renovacoes_eventos.csv", rows: renewalEvents.length });
    quality.push(...qualityRows("renovacoes_eventos.csv", columns, renewalEvents));
  }

  const surveyRows = [];
  for (const row of nps || []) {
    surveyRows.push({ resposta_ref: ref("nps", row.id), cliente_ref: ref("c", row.client_id), fonte: "nps", tipo: row.tipo_de_forms || "", score: num(row.score, 0), submitted_at: iso(row.submitted_at || row.created_at), created_at: iso(row.created_at) });
  }
  for (const row of csat || []) {
    surveyRows.push({ resposta_ref: ref("csat", row.id), cliente_ref: ref("c", row.client_id), fonte: "csat", tipo: row.tipo_de_forms || "", score: num(row.score, 0), submitted_at: iso(row.submitted_at || row.created_at), created_at: iso(row.created_at) });
  }
  for (const row of npsSends || []) {
    surveyRows.push({ resposta_ref: ref("npsend", row.id), cliente_ref: ref("c", row.client_id), fonte: "nps_envio", tipo: "envio", score: "", submitted_at: iso(row.sent_at || row.created_at), created_at: iso(row.created_at) });
  }
  for (const row of csatSends || []) {
    surveyRows.push({ resposta_ref: ref("csatsend", row.id), cliente_ref: ref("c", row.client_id), fonte: "csat_envio", tipo: "envio", score: "", submitted_at: iso(row.sent_at || row.created_at), created_at: iso(row.created_at) });
  }
  const npsOnly = [];
  for (const row of nps || []) {
    npsOnly.push({
      resposta_ref: ref("nps", row.id),
      cliente_ref: ref("c", row.client_id),
      score: num(row.score, 0),
      submitted_at: iso(row.submitted_at || row.created_at),
      created_at: iso(row.created_at),
      tipo: row.tipo_de_forms || "",
    });
  }
  if (npsOnly.length) {
    const npsColumns = define("nps_historico.csv", [
      ["resposta_ref", "text", "Pseudônimo da resposta NPS"],
      ["cliente_ref", "text", "Pseudônimo do cliente"],
      ["score", "number", "Nota 0–10"],
      ["submitted_at", "date", "Submissão"],
      ["created_at", "date", "Criação do registro"],
      ["tipo", "text", "Tipo de formulário"],
    ].map(([key, kind, description]) => ({ key, header: key, kind, description })));
    writeCsv("nps_historico.csv", npsColumns, npsOnly);
    files.push({ name: "nps_historico.csv", rows: npsOnly.length });
    quality.push(...qualityRows("nps_historico.csv", npsColumns, npsOnly));
  }

  if (surveyRows.length) {
    const columns = define("nps_csat_historico.csv", [
      ["resposta_ref", "text", "Pseudônimo da resposta ou do envio"],
      ["cliente_ref", "text", "Pseudônimo do cliente. Vazio se a origem não tem cliente."],
      ["fonte", "text", "nps, csat, nps_envio ou csat_envio"],
      ["tipo", "text", "Tipo de formulário ou envio"],
      ["score", "number", "Nota. Vazio em envios."],
      ["submitted_at", "date", "Envio ou submissão"],
      ["created_at", "date", "Criação do registro"],
    ].map(([key, kind, description]) => ({ key, header: key, kind, description })));
    writeCsv("nps_csat_historico.csv", columns, surveyRows);
    files.push({ name: "nps_csat_historico.csv", rows: surveyRows.length });
    quality.push(...qualityRows("nps_csat_historico.csv", columns, surveyRows));
  }

  const supportRows = [];
  for (const row of demands || []) {
    supportRows.push({ registro_ref: ref("sup", `d:${row.id}`), cliente_ref: ref("c", row.client_id), fonte: "demands", tipo: row.type || "", status: row.status || "", prioridade: row.priority || "", created_at: iso(row.created_at), due_date: iso(row.due_date), resolved_at: iso(row.resolved_at), completed: bool(Boolean(row.resolved_at)) });
  }
  for (const row of tasks || []) {
    supportRows.push({ registro_ref: ref("sup", `t:${row.id}`), cliente_ref: ref("c", row.client_id), fonte: "tasks", tipo: row.tipo || "", status: row.status || "", prioridade: row.priority || "", created_at: iso(row.created_at), due_date: iso(row.due_date), resolved_at: iso(row.completed_at), completed: bool(row.completed) });
  }
  for (const row of pendencias || []) {
    supportRows.push({ registro_ref: ref("sup", `p:${row.id}`), cliente_ref: ref("c", row.client_id), fonte: "client_pendencias", tipo: row.category || "", status: row.completed ? "concluida" : "aberta", prioridade: "", created_at: iso(row.created_at), due_date: iso(row.due_date), resolved_at: iso(row.completed_at), completed: bool(row.completed) });
  }
  if (supportRows.length) {
    const columns = define("suporte_historico.csv", [
      ["registro_ref", "text", "Pseudônimo do acionamento"],
      ["cliente_ref", "text", "Pseudônimo do cliente"],
      ["fonte", "text", "demands, tasks ou client_pendencias"],
      ["tipo", "text", "Tipo ou categoria, sem título livre"],
      ["status", "text", "Status"],
      ["prioridade", "text", "Prioridade, quando existe"],
      ["created_at", "date", "Abertura"],
      ["due_date", "date", "Prazo"],
      ["resolved_at", "date", "Conclusão"],
      ["completed", "text", "Concluído"],
    ].map(([key, kind, description]) => ({ key, header: key, kind, description })));
    writeCsv("suporte_historico.csv", columns, supportRows);
    files.push({ name: "suporte_historico.csv", rows: supportRows.length });
    quality.push(...qualityRows("suporte_historico.csv", columns, supportRows));
  }

  const clientRows = clients || [];
  const candidateRows = buildPredictiveCandidateRows({
    clients: clientRows,
    meetingRows,
    mechanismRows: mechanisms,
    npsRows: nps,
    extractedAt,
  });
  if (candidateRows.length) {
    const candidateColumns = define("dataset_preditivo_candidato.csv", [
      ["cliente_ref", "text", "Pseudônimo do cliente"],
      ["mes_referencia", "text", "Mês de referência (YYYY-MM)"],
      ["data_referencia_fim", "date", "Último instante do mês de referência"],
      ["reunioes_acumuladas", "number", "Reuniões com início até a data de referência"],
      ["recencia_dias", "number", "Dias desde a última reunião até a referência"],
      ["mecanismos_implantados_ate", "number", "Mecanismos implantados até a referência"],
      ["nps_ultimo_ate", "number", "Último NPS conhecido até a referência"],
      ["nps_data_ultimo_ate", "date", "Data do último NPS até a referência"],
      ["desfecho_churn_90d", "text", "Churn nos 90 dias após a referência (clients.data_churn)"],
      ["desfecho_churn_180d", "text", "Churn nos 180 dias após a referência"],
      ["janela_90d_completa", "text", "Se a janela de 90d já fechou na extração"],
      ["janela_180d_completa", "text", "Se a janela de 180d já fechou na extração"],
      ["censura", "text", "Sem churn observado até a referência"],
      ["nota_metodologica", "text", "Limitações do recorte"],
    ].map(([key, kind, description]) => ({ key, header: key, kind, description })));
    writeCsv("dataset_preditivo_candidato.csv", candidateColumns, candidateRows);
    files.push({ name: "dataset_preditivo_candidato.csv", rows: candidateRows.length, max_meses_por_cliente: 36 });
    quality.push(...qualityRows("dataset_preditivo_candidato.csv", candidateColumns, candidateRows));
  }

  const dictColumns = [
    { key: "arquivo", header: "arquivo" },
    { key: "coluna", header: "coluna" },
    { key: "tipo", header: "tipo" },
    { key: "descricao", header: "descricao" },
    { key: "nulos", header: "nulos" },
  ];
  writeCsv("dicionario_dados.csv", dictColumns, dictionary);
  writeCsv("dicionario_variaveis.csv", dictColumns, dictionary);
  files.push({ name: "dicionario_dados.csv", rows: dictionary.length });
  files.push({ name: "dicionario_variaveis.csv", rows: dictionary.length, alias: "dicionario_dados.csv" });

  const qualityColumns = ["arquivo", "coluna", "registros", "preenchidos", "nulos", "pct_nulos", "distintos", "minimo", "maximo"].map((key) => ({ key, header: key }));
  writeCsv("qualidade_dados.csv", qualityColumns, quality);
  writeCsv("relatorio_qualidade.csv", qualityColumns, quality);
  files.push({ name: "qualidade_dados.csv", rows: quality.length });
  files.push({ name: "relatorio_qualidade.csv", rows: quality.length, alias: "qualidade_dados.csv" });

  const inventoryColumns = ["tabela", "status", "registros_lidos", "registros_contados", "contagem_confere", "ids_duplicados", "observacao"].map((key) => ({ key, header: key }));
  writeCsv("inventario_fontes.csv", inventoryColumns, inventory);
  files.push({ name: "inventario_fontes.csv", rows: inventory.length });

  const candidateRowCount = candidateRows?.length || 0;
  const churned = clientRows.filter((row) => row.data_churn).length;
  const renewed = clientRows.filter((row) => Number(row.ciclo) > 1).length;
  const clientSpan = coverage(clientRows.map((row) => row.created_at));
  const sinceSpan = coverage(clientRows.map((row) => row.cliente_desde));
  const cycleSpan = coverage(clientRows.map((row) => row.data_inicio_ciclo));
  const churnSpan = coverage(clientRows.map((row) => row.data_churn));
  const meetingSpan = coverage(meetingRows.map((row) => row.inicio));
  const noOutcome = clientRows.filter((row) => !row.data_churn && !(Number(row.ciclo) > 1)).length;
  const manifest = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    pseudonym: "HMAC-SHA256 truncado. O segredo fica só em .pseudonym-secret e não entra neste arquivo.",
    separator: ";",
    encoding: "utf-8-bom",
    decimals: "ponto",
    dates: "ISO-8601",
    files,
    clients: clientRows.length,
    clientsWithChurnDate: churned,
    clientsWithCycleAboveOne: renewed,
    renewalCycleRows: (renewalCycles || []).length,
    cancellationRows: (cancellations || []).filter((row) => !row.archived_at).length,
    predictiveCandidateRows: candidateRowCount,
    clientsWithoutObservedOutcome: noOutcome,
    meetingDuplicateStartKeys: meetingDupes,
    futureMeetingsExcluded: futureMeetings,
    coverage: { clientsCreated: clientSpan, clienteDesde: sinceSpan, cycleStart: cycleSpan, churnDates: churnSpan, meetings: meetingSpan },
    leakage: [
      "status, data_churn, churn_tipo, valor_total_pago, is_retido, ciclo e engajamento_label são fotos atuais.",
      "Não usar esses campos como variáveis de uma data de referência passada.",
      "pred_scores não foi exportado.",
      "Comentários, nomes, e-mails, CPF, telefones, endereços e transcrições não foram exportados.",
    ],
  };
  writeFileSync(join(DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const readme = `# Base para estudo preditivo

Extração somente leitura gerada em ${manifest.generatedAt}. Nenhum dado foi escrito no Supabase.

## Como repetir

Na pasta \`dash-health-score\`:

\`\`\`bash
npm run export:predictive
\`\`\`

O comando exige \`DATA_SUPABASE_URL\` e \`DATA_SUPABASE_SERVICE_ROLE_KEY\` no \`.env\` ou no ambiente. O segredo dos pseudônimos fica em \`exports/predictive-study/.pseudonym-secret\`. Esse arquivo não deve ser compartilhado nem versionado. Sem ele, uma nova extração gera outros identificadores.

## O que entrou

${files.map((file) => `- \`${file.name}\`: ${file.rows} linhas`).join("\n")}

Clientes históricos exportados: ${clientRows.length}. Isso inclui ativos, cancelados e demais status. O dashboard aplica exclusões locais de casos isolados; esta extração não aplica esse recorte.

Cobertura de \`created_at\`: ${clientSpan.min || "sem data"} até ${clientSpan.max || "sem data"}.
Campo \`cliente_desde\`: ${sinceSpan.min || "sem data"} até ${sinceSpan.max || "sem data"}.
Início de ciclo: ${cycleSpan.min || "sem data"} até ${cycleSpan.max || "sem data"}.
Reuniões já ocorridas: ${meetingSpan.min || "sem data"} até ${meetingSpan.max || "sem data"}. Reuniões com início posterior à extração foram excluídas: ${futureMeetings}.
Datas de churn no cadastro: ${churnSpan.min || "sem data"} até ${churnSpan.max || "sem data"}.

## Privacidade

Os CSV não trazem nome, e-mail, CPF/CNPJ, telefone, endereço, token ou texto livre. A ligação entre arquivos é \`cliente_ref\`. Engenheiros também estão pseudonimizados. Nomes de mecanismos são nomes de produto.

## Viabilidade de um dataset cliente × data de referência

Ainda não há uma linha por cliente e data de previsão. O arquivo de clientes é uma fotografia atual.

- Clientes com \`data_churn\`: ${churned}.
- Clientes com ciclo maior que 1: ${renewed}.
- Ciclos de renovação em \`renewal_cycles\`: ${(renewalCycles || []).length}.
- Registros em \`cancellations\`: ${(cancellations || []).length}.
- Clientes sem churn cadastrado e sem ciclo maior que 1: ${noOutcome}. Eles estão censurados: o desfecho pode ainda não ter ocorrido.
- Duplicidades de início de reunião no mesmo cliente: ${meetingDupes}. Parte vem da soma de \`client_meetings\` e \`manual_meetings\` no mesmo horário.
- Reuniões futuras excluídas: ${futureMeetings}.

Um futuro dataset deve, para cada data de referência, usar apenas reuniões, mecanismos, NPS, CSAT e suporte com data anterior a essa referência. Status atual, valor pago acumulado, rótulo atual de engajamento e a própria data de churn não podem entrar como variáveis dessa data. Clientes que ainda não completaram a janela de observação precisam ser tratados como censura, não como não cancelados.

Correlação no dashboard não é efeito causal. Esta pasta não treina modelo.
`;
  writeFileSync(join(DIR, "README.md"), readme, "utf8");

  const readmePesquisa = `# Pesquisa preditiva — extração histórica

Gerado em ${manifest.generatedAt}. Somente leitura na BASE QV.

## Unidades de análise

| Arquivo | Granularidade |
|---------|----------------|
| clientes_historico.csv | 1 linha por cliente (snapshot cadastral) |
| reunioes_historico.csv | 1 linha por reunião |
| mecanismos_historico.csv | 1 linha por vínculo cliente × mecanismo |
| churn_eventos.csv | 1 linha por evento de saída/cancelamento |
| renovacoes_eventos.csv | 1 linha por ciclo/renovação |
| nps_historico.csv | 1 linha por resposta NPS |
| suporte_historico.csv | 1 linha por acionamento |
| dataset_preditivo_candidato.csv | cliente × mês (máx. 36 meses por cliente) |

## Desfechos

- **Churn (candidato):** \`clients.data_churn\` nas janelas 90/180 dias após \`data_referencia_fim\`. Evidência operacional adicional em \`churn_eventos.csv\` (cancellations não arquivados, churn_logs, cancellation_events).
- **Renovação:** não validada apenas por \`ciclo > 1\`. Use \`renewal_cycles\` e \`renovacoes_eventos.csv\`.

## Vazamento temporal

Não usar como preditor na data de referência: status atual, \`data_churn\`, valor pago acumulado, ciclo atual, rótulo de engajamento. E/M/HS do dashboard não foram recalculados no dataset candidato.

## Repetir

\`\`\`bash
npm run export:predictive
\`\`\`

Linhas no dataset candidato: ${candidateRowCount}. Clientes exportados: ${clientRows.length}.
`;
  writeFileSync(join(DIR, "README_pesquisa.md"), readmePesquisa, "utf8");
  console.log(`Arquivos em exports/predictive-study: ${files.map((file) => file.name).join(", ")}`);
}

main().catch((error) => {
  console.error(error?.code || "ERRO", error?.message || "Falha na extração");
  process.exitCode = 1;
});
