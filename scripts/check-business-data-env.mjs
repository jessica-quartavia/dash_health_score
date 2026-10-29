/**
 * Diagnóstico Etapa 12.1 — não imprime segredos.
 */
import { loadProjectEnv } from "../lib/load-env.mjs";
import { businessDataConfig, assertNotBaseQvUrl } from "../lib/business-data/config.mjs";
import { probeBusinessDataApi } from "../lib/business-data/probe-exposed.mjs";

loadProjectEnv();

function flag(name) {
  const v = process.env[name];
  return v ? "set" : "MISSING";
}

const cfg = businessDataConfig();
let urlOk = "n/a";
try {
  if (cfg.url) {
    assertNotBaseQvUrl(cfg.url);
    urlOk = new URL(cfg.url).hostname;
  }
} catch {
  urlOk = "INVALID (BASE QV?)";
}

const probe = await probeBusinessDataApi();

console.log(
  JSON.stringify(
    {
      vars: {
        BUSINESS_SUPABASE_URL: flag("BUSINESS_SUPABASE_URL"),
        BUSINESS_SUPABASE_SERVICE_ROLE_KEY: flag("BUSINESS_SUPABASE_SERVICE_ROLE_KEY"),
        AUTH_SUPABASE_SERVICE_ROLE_KEY: flag("AUTH_SUPABASE_SERVICE_ROLE_KEY"),
        HS_MONITORING_PSEUDONYM_SECRET: flag("HS_MONITORING_PSEUDONYM_SECRET"),
        MONITORING_PIPELINE_TOKEN: flag("MONITORING_PIPELINE_TOKEN"),
        DATA_SUPABASE_URL: flag("DATA_SUPABASE_URL"),
        AUTH_SUPABASE_URL: flag("AUTH_SUPABASE_URL"),
      },
      resolvedUrlHost: cfg.url ? new URL(cfg.url).hostname : null,
      urlGuard: urlOk,
      businessDataReady: cfg.ready,
      postgrest: probe,
    },
    null,
    2,
  ),
);

process.exitCode = cfg.ready && probe.schemaExposed ? 0 : 2;
