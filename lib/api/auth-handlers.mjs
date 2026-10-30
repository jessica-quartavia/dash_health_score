import { CORPORATE_EMAIL_DOMAIN, shouldRequireCorporateAuth, verifyCorporateAccess } from "./corporate-access.mjs";

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export function handleAuthPolicyApi(_req, res) {
  sendJson(res, 200, {
    requireAuth: shouldRequireCorporateAuth(),
    domain: CORPORATE_EMAIL_DOMAIN,
    provider: "google",
  });
}

export function handleAuthConfigApi(_req, res) {
  const url = String(process.env.AUTH_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = String(process.env.AUTH_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anonKey) {
    sendJson(res, 503, {
      ok: false,
      code: "AUTH_NOT_CONFIGURED",
      error: "AUTH_SUPABASE_URL e AUTH_SUPABASE_ANON_KEY são necessários para login.",
    });
    return;
  }
  sendJson(res, 200, {
    ok: true,
    url,
    anonKey,
    domain: CORPORATE_EMAIL_DOMAIN,
  });
}

export async function handleAuthMeApi(req, res) {
  const auth = await verifyCorporateAccess(req);
  if (!auth.ok) {
    sendJson(res, 401, { ok: false, code: auth.code, error: auth.message });
    return;
  }
  sendJson(res, 200, { ok: true, email: auth.user.email, userId: auth.user.id });
}
