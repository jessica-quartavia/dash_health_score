import { assertNotBaseQvUrl, businessDataConfig } from "./config.mjs";

const CHUNK = 250;

/** Headers PostgREST — leitura exige Accept-Profile; escrita Content-Profile (schema _dash_health_score). */
export function businessRestHeaders(prefer = "return=representation") {
  const cfg = businessDataConfig();
  assertNotBaseQvUrl(cfg.url);
  if (!cfg.ready) {
    const err = new Error("Business Data não configurado (BUSINESS_SUPABASE_SERVICE_ROLE_KEY).");
    err.code = "BUSINESS_DATA_NOT_CONFIGURED";
    throw err;
  }
  const schema = cfg.schema;
  return {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Profile": schema,
    "Content-Profile": schema,
    Prefer: prefer,
  };
}

function headers(prefer = "return=representation") {
  return businessRestHeaders(prefer);
}

function restUrl(table, query = "") {
  const cfg = businessDataConfig();
  return `${cfg.url}/rest/v1/${table}${query ? `?${query}` : ""}`;
}

export async function bdSelect(table, { query = "", single = false } = {}) {
  const res = await fetch(restUrl(table, query), { method: "GET", headers: headers("return=representation") });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(body?.message || body?.hint || `Business Data read failed (${res.status})`);
    err.code = "BUSINESS_DATA_READ";
    err.status = res.status;
    throw err;
  }
  if (single) return Array.isArray(body) ? body[0] : body;
  return body;
}

export async function bdInsert(table, rows, { onConflict } = {}) {
  const list = Array.isArray(rows) ? rows : [rows];
  if (!list.length) return [];
  let prefer = "return=representation";
  if (onConflict) prefer += `,resolution=ignore-duplicates`;
  const q = onConflict ? `on_conflict=${encodeURIComponent(onConflict)}` : "";
  const res = await fetch(restUrl(table, q), {
    method: "POST",
    headers: headers(prefer),
    body: JSON.stringify(list),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(body?.message || body?.hint || `Business Data insert failed (${res.status})`);
    err.code = "BUSINESS_DATA_WRITE";
    err.status = res.status;
    err.details = body;
    throw err;
  }
  return body;
}

export async function bdInsertChunks(table, rows, opts = {}) {
  const out = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const inserted = await bdInsert(table, chunk, opts);
    if (Array.isArray(inserted)) out.push(...inserted);
  }
  return out;
}

export async function bdPatch(table, matchQuery, patch) {
  const res = await fetch(restUrl(table, matchQuery), {
    method: "PATCH",
    headers: headers("return=representation"),
    body: JSON.stringify(patch),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(body?.message || `Business Data patch failed (${res.status})`);
    err.code = "BUSINESS_DATA_WRITE";
    throw err;
  }
  return body;
}
