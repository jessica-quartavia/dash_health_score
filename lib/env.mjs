/**
 * Variáveis de ambiente — BASE QV somente leitura.
 * O carregamento do .env acontece na importação, antes de qualquer leitura.
 */
import { describeEnvStatus, envPresence, loadProjectEnv } from "./load-env.mjs";

export const envReport = loadProjectEnv();

function trimEnv(value) {
  return String(value || "").trim();
}

function trimUrl(value) {
  return trimEnv(value).replace(/\/$/, "");
}

export function getDataEnv() {
  const url = trimUrl(process.env.DATA_SUPABASE_URL || process.env.SUPABASE_URL);
  const serviceRoleKey = trimEnv(
    process.env.DATA_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  return { url, serviceRoleKey };
}

export function dataConfigurationError() {
  const { url, serviceRoleKey } = getDataEnv();
  const presence = envPresence();
  if (!url || !serviceRoleKey) {
    const missing = [];
    if (!url) missing.push("DATA_SUPABASE_URL");
    if (!serviceRoleKey) missing.push("DATA_SUPABASE_SERVICE_ROLE_KEY");
    return {
      code: "DATA_CONFIG",
      reason: "missing",
      presence,
      message: `Variável ausente: ${missing.join(", ")}.`,
    };
  }
  if (!/^https:\/\//i.test(url)) {
    return {
      code: "DATA_CONFIG_INVALID",
      reason: "invalid",
      presence,
      message: "DATA_SUPABASE_URL está presente, mas é inválida: use uma URL HTTPS.",
    };
  }
  return null;
}

export function publicEnvStatus() {
  const status = describeEnvStatus(envReport);
  const configError = dataConfigurationError();
  return {
    ready: status.ready && !configError,
    envFile: envReport.envFile,
    localFile: envReport.localFile,
    invalidFile: envReport.invalidFile,
    bareEnvFile: envReport.bareEnvFile,
    presence: envReport.presence,
    code: configError?.code || null,
    message: configError?.message || null,
  };
}
