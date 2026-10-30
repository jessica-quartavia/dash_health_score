/**
 * Cliente REST somente leitura da BASE QV (PostgREST GET).
 */
import { dataConfigurationError, getDataEnv } from "../env.mjs";

const MAX_OFFSET = 200_000;
const DEFAULT_PAGE_SIZE = 1000;
const POSTGREST_RANGE_MAX = 1000;

const TABLE_PAGE_SIZES = {
  clients: 5000,
  client_meetings: 5000,
  meeting_attendance: 5000,
  manual_meetings: 2000,
  client_mecanismos: 2000,
  mecanismos: 1000,
  cancellations: 1000,
};

function assertReadOnlyTable(table) {
  const name = String(table || "").trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error("Nome de tabela inválido para leitura.");
  }
  return name;
}

function resolveRangeSize(table) {
  return Math.min(TABLE_PAGE_SIZES[table] || DEFAULT_PAGE_SIZE, POSTGREST_RANGE_MAX);
}

export function classifyHttpStatus(status) {
  const code = Number(status);
  if (code === 401) {
    return {
      code: "DATA_AUTH",
      message: "Autenticação recusada pela BASE QV. A chave está presente, mas foi rejeitada.",
    };
  }
  if (code === 403) {
    return {
      code: "DATA_PERMISSION",
      message: "Permissão insuficiente para ler a BASE QV.",
    };
  }
  if (code >= 500) {
    return {
      code: "DATA_UPSTREAM",
      message: "A BASE QV falhou ao responder a consulta.",
    };
  }
  return {
    code: "DATA_QUERY",
    message: "A consulta à BASE QV não pôde ser concluída.",
  };
}

function throwConfigError() {
  const configError = dataConfigurationError();
  const err = new Error(configError?.message || "Configure DATA_SUPABASE_URL e DATA_SUPABASE_SERVICE_ROLE_KEY.");
  err.code = configError?.code || "DATA_CONFIG";
  throw err;
}

function restHeaders(restKey, extra = {}) {
  return {
    apikey: restKey,
    Authorization: `Bearer ${restKey}`,
    Accept: "application/json",
    ...extra,
  };
}

async function requestRest(endpoint, headers) {
  try {
    return await fetch(endpoint, { method: "GET", headers });
  } catch {
    const err = new Error("Falha de conexão com a BASE QV.");
    err.code = "DATA_CONNECTION";
    throw err;
  }
}

function assertOk(response, table) {
  if (response.ok) return;
  const classified = classifyHttpStatus(response.status);
  const err = new Error(table ? `${classified.message} Tabela: ${table}.` : classified.message);
  err.code = classified.code;
  err.status = response.status;
  throw err;
}

export async function fetchAllRows(opts) {
  const table = assertReadOnlyTable(opts?.table);
  const select = String(opts?.select || "*");
  const rangeSize = resolveRangeSize(table);
  const dataEnv = getDataEnv();
  const url = String(opts?.url || dataEnv.url || "").replace(/\/$/, "");
  const restKey = String(opts?.restKey || dataEnv.serviceRoleKey || "").trim();
  const schema = String(opts?.schema || "public").trim() || "public";
  if (!url || !restKey || dataConfigurationError()) throwConfigError();

  const rows = [];
  let offset = 0;
  const order = opts?.order === null ? null : opts?.order || "id.asc";

  while (true) {
    const endpoint = new URL(`/rest/v1/${table}`, url);
    endpoint.searchParams.set("select", select);
    if (order) endpoint.searchParams.set("order", order);
    if (opts?.filters) {
      for (const [key, value] of Object.entries(opts.filters)) {
        endpoint.searchParams.set(key, value);
      }
    }

    const response = await requestRest(endpoint, restHeaders(restKey, {
      "Accept-Profile": schema,
      Range: `${offset}-${offset + rangeSize - 1}`,
    }));
    assertOk(response, table);

    const batch = await response.json();
    if (!Array.isArray(batch)) {
      throw new Error(`${table}: resposta REST inválida.`);
    }
    rows.push(...batch);
    if (!batch.length || batch.length < rangeSize) break;
    offset += batch.length;
    if (offset > MAX_OFFSET) break;
  }

  return rows;
}

/** Leitura mínima para distinguir configuração, autenticação, permissão e conexão. */
export async function probeDataRead() {
  if (dataConfigurationError()) throwConfigError();
  const { url, serviceRoleKey } = getDataEnv();
  const endpoint = new URL("/rest/v1/clients", url);
  endpoint.searchParams.set("select", "id");
  endpoint.searchParams.set("limit", "1");
  const response = await requestRest(endpoint, restHeaders(serviceRoleKey, {
    "Accept-Profile": "public",
    Range: "0-0",
    Prefer: "count=exact",
  }));
  assertOk(response, "clients");
  const rows = await response.json();
  const contentRange = response.headers.get("content-range") || "";
  const match = contentRange.match(/\/(\d+)$/);
  return {
    ok: true,
    table: "clients",
    sampleRows: Array.isArray(rows) ? rows.length : 0,
    total: match ? Number(match[1]) : null,
  };
}
