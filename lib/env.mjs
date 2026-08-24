/**
 * Variáveis de ambiente — BASE QV somente leitura.
 */

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
  if (!url || !serviceRoleKey) {
    return "Configure DATA_SUPABASE_URL e DATA_SUPABASE_SERVICE_ROLE_KEY.";
  }
  if (!/^https:\/\//i.test(url)) {
    return "DATA_SUPABASE_URL deve usar HTTPS.";
  }
  return null;
}
