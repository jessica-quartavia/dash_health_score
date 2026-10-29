/**
 * Auditoria de configuração — sem expor valores de credenciais.
 */
import { createHash } from "node:crypto";

const MONITORING_KEYS = [
  "HS_MONITORING_ROOT",
  "MONITORING_MIRROR_PATH",
  "MONITORING_SUPABASE_URL",
  "MONITORING_SUPABASE_SERVICE_KEY",
  "MONITORING_STORAGE_BUCKET",
  "MONITORING_AUTOMATION_APPROVED",
  "MONITORING_SCHEDULE",
  "MONITORING_CRON_ACTIVE",
];

export function redactEnvPresence() {
  const entries = {};
  for (const key of MONITORING_KEYS) {
    const raw = process.env[key];
    entries[key] = {
      defined: raw != null && String(raw).trim() !== "",
      length: raw ? String(raw).length : 0,
      fingerprint: raw ? createHash("sha256").update(String(raw)).digest("hex").slice(0, 12) : null,
    };
  }
  return entries;
}

export function monitoringVarsConfigured() {
  const p = redactEnvPresence();
  return {
    localRoot: p.HS_MONITORING_ROOT.defined,
    mirrorPath: p.MONITORING_MIRROR_PATH.defined,
    supabaseUrl: p.MONITORING_SUPABASE_URL.defined,
    supabaseKey: p.MONITORING_SUPABASE_SERVICE_KEY.defined,
    storageBucket: p.MONITORING_STORAGE_BUCKET.defined,
    automationApproved: process.env.MONITORING_AUTOMATION_APPROVED === "1",
    schedule: process.env.MONITORING_SCHEDULE || "(default weekly)",
    cronActive: process.env.MONITORING_CRON_ACTIVE === "1",
  };
}

/** Impede reutilizar credencial da BASE QV como destino de monitoramento. */
export function detectCredentialReuseRisk() {
  const dataUrl = process.env.DATA_SUPABASE_URL || "";
  const monUrl = process.env.MONITORING_SUPABASE_URL || "";
  const dataKey = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY || "";
  const monKey = process.env.MONITORING_SUPABASE_SERVICE_KEY || "";
  const risks = [];
  if (monUrl && dataUrl && monUrl === dataUrl) {
    risks.push("MONITORING_SUPABASE_URL igual a DATA_SUPABASE_URL — use projeto/bucket dedicado.");
  }
  if (monKey && dataKey && monKey === dataKey) {
    risks.push("MONITORING_SUPABASE_SERVICE_KEY igual à chave DATA — proibido para escrita de monitoramento.");
  }
  return risks;
}

export function supabaseHostLabel(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid_url";
  }
}

export function publicPersistenceSummary(audit) {
  return {
    localConfigured: audit.local?.operational ?? audit.vars.localRoot,
    localRootEnvSet: audit.vars.localRoot,
    mirrorConfigured: audit.vars.mirrorPath,
    supabaseConfigured: audit.vars.supabaseUrl && audit.vars.supabaseKey && audit.vars.storageBucket,
    supabaseHost: audit.supabaseProbe?.host || (audit.vars.supabaseUrl ? supabaseHostLabel(process.env.MONITORING_SUPABASE_URL) : null),
    bucket: audit.vars.storageBucket ? process.env.MONITORING_STORAGE_BUCKET : null,
    automationApproved: audit.vars.automationApproved,
    cronActive: audit.vars.cronActive,
    credentialReuseRisks: audit.credentialReuseRisks?.length || 0,
  };
}
