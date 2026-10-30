import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  redactEnvPresence,
  monitoringVarsConfigured,
  detectCredentialReuseRisk,
  publicPersistenceSummary,
  supabaseHostLabel,
} from "./config-audit.mjs";
import { probeSupabaseStorage } from "./supabase-storage.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "research", "monitoring");

export function monitoringRoot() {
  return process.env.HS_MONITORING_ROOT || DEFAULT_ROOT;
}

function tryLocalWrite(root) {
  try {
    mkdirSync(root, { recursive: true });
    const probe = join(root, ".write-probe");
    writeFileSync(probe, "ok", "utf8");
    unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

export function detectMonitoringEnvironment() {
  const root = monitoringRoot();
  const localWritable = tryLocalWrite(root);
  const onVercel = Boolean(process.env.VERCEL);
  const vars = monitoringVarsConfigured();
  const mirrorWritable = vars.mirrorPath ? tryLocalWrite(process.env.MONITORING_MIRROR_PATH) : false;
  const supabaseVarsPresent = vars.supabaseUrl && vars.supabaseKey && vars.storageBucket;
  const scheduleMode = (process.env.MONITORING_SCHEDULE || "weekly").toLowerCase();
  const durableConfigured = mirrorWritable || supabaseVarsPresent || (localWritable && !onVercel);

  const warnings = [];
  const reuse = detectCredentialReuseRisk();
  warnings.push(...reuse);
  if (onVercel) warnings.push("Deploy serverless: filesystem efêmero — use mirror ou Storage dedicado.");
  if (!durableConfigured) warnings.push("Nenhum destino durável detectado.");
  if (vars.automationApproved && !durableConfigured) {
    warnings.push("MONITORING_AUTOMATION_APPROVED=1 sem destino durável — agendamento bloqueado.");
  }

  return {
    version: "monitoring-env-etapa11-v1",
    checkedAt: new Date().toISOString(),
    localWritable,
    deployEphemeral: onVercel,
    schedule: {
      mode: ["daily", "weekly", "manual"].includes(scheduleMode) ? scheduleMode : "weekly",
      automationApproved: vars.automationApproved,
      cronActive: vars.cronActive,
      allowed: vars.automationApproved && durableConfigured && !onVercel,
    },
    durableDestination: {
      configured: durableConfigured,
      localPrimary: localWritable && !onVercel,
      filesystemMirror: mirrorWritable,
      supabaseVarsPresent,
    },
    warnings,
    baseQvPolicy: "strict_read_only",
  };
}

export async function auditMonitoringEnvironment({ probeRemote = false } = {}) {
  const vars = monitoringVarsConfigured();
  const envPresence = redactEnvPresence();
  const credentialReuseRisks = detectCredentialReuseRisk();
  const root = monitoringRoot();
  const localWritable = tryLocalWrite(root);
  const mirrorWritable = vars.mirrorPath ? tryLocalWrite(process.env.MONITORING_MIRROR_PATH) : false;

  let supabaseProbe = null;
  if (probeRemote && vars.supabaseUrl && vars.supabaseKey && vars.storageBucket && !credentialReuseRisks.length) {
    supabaseProbe = await probeSupabaseStorage();
  } else if (vars.supabaseUrl || vars.supabaseKey || vars.storageBucket) {
    supabaseProbe = {
      configured: vars.supabaseUrl && vars.supabaseKey && vars.storageBucket,
      available: false,
      reason: credentialReuseRisks.length ? "credencial_reutilizada_bloqueada" : "probe_nao_executado",
    };
  }

  const centralizedValidated =
    (supabaseProbe?.available === true) ||
    (mirrorWritable && vars.mirrorPath);

  const audit = {
    version: "etapa11-audit-v1",
    checkedAt: new Date().toISOString(),
    vars,
    envPresence,
    credentialReuseRisks,
    local: { writable: localWritable, customRoot: vars.localRoot, operational: localWritable },
    mirror: { configured: vars.mirrorPath, writable: mirrorWritable },
    supabaseProbe,
    persistence: {
      mirrorConfigured: vars.mirrorPath,
      supabaseConfigured: vars.supabaseUrl && vars.supabaseKey && vars.storageBucket,
      centralizedValidated,
      comprovada: centralizedValidated,
    },
  };

  audit.publicSummary = publicPersistenceSummary(audit);
  return audit;
}

export function sanitizeEnvironmentForApi(envOrAudit) {
  return {
    version: envOrAudit.version,
    checkedAt: envOrAudit.checkedAt,
    localWritable: envOrAudit.localWritable ?? envOrAudit.local?.writable,
    deployEphemeral: envOrAudit.deployEphemeral,
    schedule: envOrAudit.schedule || {
      mode: envOrAudit.vars?.schedule || "weekly",
      automationApproved: envOrAudit.vars?.automationApproved,
      cronActive: envOrAudit.vars?.cronActive,
    },
    durableDestination: {
      localPrimary: envOrAudit.durableDestination?.localPrimary,
      filesystemMirror: Boolean(envOrAudit.mirror?.writable ?? envOrAudit.durableDestination?.filesystemMirror),
      supabase: envOrAudit.publicSummary?.supabaseConfigured
        ? { host: envOrAudit.publicSummary?.supabaseHost, bucket: envOrAudit.publicSummary?.bucket }
        : null,
    },
    persistenceValidated: envOrAudit.persistence?.centralizedValidated ?? false,
    warnings: (envOrAudit.warnings || envOrAudit.credentialReuseRisks || []).slice(0, 6),
  };
}

/** @deprecated use persistArtifact */
export async function mirrorSnapshotFile() {
  return [];
}
