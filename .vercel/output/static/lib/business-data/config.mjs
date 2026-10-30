/** Business Data (projeto rckpuebaiswrxzmywllv) — escrita somente em _dash_health_score. */

export const BUSINESS_SCHEMA = "_dash_health_score";
export const BUSINESS_PROJECT_REF = "rckpuebaiswrxzmywllv";

function resolveBusinessServiceKey() {
  const explicit = process.env.BUSINESS_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (explicit) return explicit;
  const authKey = process.env.AUTH_SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = (process.env.BUSINESS_SUPABASE_URL || process.env.AUTH_SUPABASE_URL || "").trim();
  if (authKey && url.includes(BUSINESS_PROJECT_REF)) return authKey;
  return "";
}

export function businessDataConfig() {
  const url = (process.env.BUSINESS_SUPABASE_URL || process.env.AUTH_SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = resolveBusinessServiceKey();
  return {
    url,
    serviceKey,
    schema: BUSINESS_SCHEMA,
    ready: Boolean(url && serviceKey),
    projectRef: BUSINESS_PROJECT_REF,
  };
}

export function assertNotBaseQvUrl(url) {
  const u = String(url || "");
  if (u.includes("lacinxsvjdwalkchxyeo")) {
    throw new Error("Configuração inválida: URL aponta para BASE QV (somente leitura).");
  }
}
