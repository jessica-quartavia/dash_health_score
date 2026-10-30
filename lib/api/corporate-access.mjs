/** Acesso corporativo @quartavia.com.br — validação server-side (Bearer Supabase). */

export const CORPORATE_EMAIL_DOMAIN = "quartavia.com.br";

export function isAllowedCorporateEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const parts = normalized.split("@");
  return parts.length === 2 && parts[0].length > 0 && parts[1] === CORPORATE_EMAIL_DOMAIN;
}

export function extractBearerToken(req) {
  const raw = req?.headers?.authorization || req?.headers?.Authorization || "";
  const value = String(raw).trim();
  if (!value.toLowerCase().startsWith("bearer ")) return null;
  const token = value.slice(7).trim();
  return token || null;
}

export function shouldRequireCorporateAuth() {
  if (process.env.DASH_REQUIRE_CORPORATE_AUTH === "0") return false;
  if (process.env.DASH_REQUIRE_CORPORATE_AUTH === "1") return true;
  if (
    process.env.VERCEL_ENV === "production"
    && process.env.AUTH_SUPABASE_URL?.trim()
    && process.env.AUTH_SUPABASE_ANON_KEY?.trim()
  ) {
    return true;
  }
  return false;
}

const SENSITIVE_PREFIXES = [
  "/api/health-score",
  "/api/client-hs-history",
  "/api/client-snapshot-history",
  "/api/portfolio-evolution-summary",
  "/api/monitoring-history",
  "/api/monitoring-summary",
  "/api/monitoring-problems.csv",
  "/api/monitoring-meta",
  "/api/research-bundle",
  "/api/research-panorama",
];

export function isSensitiveDashboardRoute(apiPath) {
  const path = String(apiPath || "");
  if (path.startsWith("/api/health-score")) return true;
  if (SENSITIVE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return true;
  }
  if (path === "/api/monitoring/pipeline/run") return true;
  return false;
}

export async function verifyCorporateAccess(req) {
  const token = extractBearerToken(req);
  if (!token) {
    return { ok: false, code: "AUTH_REQUIRED", message: "Sessão ausente. Faça login com Google corporativo." };
  }
  const baseUrl = String(process.env.AUTH_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = String(process.env.AUTH_SUPABASE_ANON_KEY || "").trim();
  if (!baseUrl || !anonKey) {
    return {
      ok: false,
      code: "AUTH_NOT_CONFIGURED",
      message: "Autenticação corporativa não configurada no servidor (AUTH_SUPABASE_*).",
    };
  }
  let response;
  try {
    response = await fetch(`${baseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
    });
  } catch {
    return { ok: false, code: "AUTH_UPSTREAM", message: "Não foi possível validar a sessão." };
  }
  if (!response.ok) {
    return { ok: false, code: "AUTH_INVALID", message: "Sessão inválida ou expirada." };
  }
  let user;
  try {
    user = await response.json();
  } catch {
    return { ok: false, code: "AUTH_INVALID", message: "Resposta de autenticação inválida." };
  }
  if (!isAllowedCorporateEmail(user?.email)) {
    return {
      ok: false,
      code: "AUTH_DOMAIN",
      message: `Acesso restrito a contas @${CORPORATE_EMAIL_DOMAIN}.`,
    };
  }
  return { ok: true, user: { id: user.id, email: user.email } };
}
