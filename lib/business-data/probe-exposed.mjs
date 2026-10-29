import { businessDataConfig } from "./config.mjs";

/** Verifica se PostgREST expõe o schema (sem imprimir credenciais). */
export async function probeBusinessDataApi({ apiKey } = {}) {
  const cfg = businessDataConfig();
  if (!cfg.url) {
    return { ok: false, reason: "missing_url", schemaExposed: false };
  }
  const key = apiKey || process.env.AUTH_SUPABASE_ANON_KEY || "";
  if (!key) {
    return { ok: false, reason: "missing_probe_key", schemaExposed: null, urlHost: new URL(cfg.url).hostname };
  }
  const url = `${cfg.url}/rest/v1/pipeline_runs?select=run_id&limit=0`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Accept-Profile": cfg.schema,
      "Content-Profile": cfg.schema,
    },
  });
  const text = await res.text();
  const schemaExposed = !text.includes("PGRST106");
  return {
    ok: schemaExposed && res.status !== 406,
    schemaExposed,
    httpStatus: res.status,
    urlHost: new URL(cfg.url).hostname,
    hint: schemaExposed ? null : "Incluir _dash_health_score em API → Exposed schemas (Business Data).",
  };
}
