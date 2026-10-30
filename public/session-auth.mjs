/**
 * Sessão Google corporativa (Supabase Auth) — config publicável via /api/session/config.
 */

const SESSION_KEY = "ha:supabaseSession";
const FETCH_TIMEOUT_MS = 20_000;

let cachedClient = null;
let cachedConfig = null;

export function readStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.access_token) return null;
    if (parsed.expires_at && Date.now() / 1000 > Number(parsed.expires_at) - 30) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeSession(session) {
  if (!session?.access_token) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function getAccessToken() {
  return readStoredSession()?.access_token || null;
}

export function authHeaders(extra = {}) {
  const token = getAccessToken();
  if (!token) return { ...extra };
  return { ...extra, Authorization: `Bearer ${token}` };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadAuthConfig() {
  if (cachedConfig) return cachedConfig;
  const res = await fetchWithTimeout("/api/session-config", { method: "GET" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.url || !body.anonKey) {
    throw new Error(body.error || "Configuração de login indisponível.");
  }
  cachedConfig = body;
  return body;
}

async function getSupabaseClient() {
  if (cachedClient) return cachedClient;
  const cfg = await loadAuthConfig();
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.1");
  cachedClient = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: true,
    },
  });
  return cachedClient;
}

async function inferRequireAuthFromDataApi() {
  try {
    const res = await fetchWithTimeout("/api/health-score?cluster=ativos", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (res.status === 401) return true;
    if (res.ok) return false;
  } catch {
    /* ignore */
  }
  return null;
}

export async function fetchAuthPolicy() {
  try {
    const res = await fetchWithTimeout("/api/session-policy", { method: "GET", cache: "no-store" });
    if (res.ok) return res.json();
  } catch {
    /* timeout / rede — continua para inferência */
  }
  const inferred = await inferRequireAuthFromDataApi();
  if (inferred === true) {
    return { requireAuth: true, domain: "quartavia.com.br", source: "health-score-probe" };
  }
  if (inferred === false) {
    return { requireAuth: false, domain: "quartavia.com.br", source: "health-score-open" };
  }
  /* Produção: nunca assumir “sem login” quando política e probe são inconclusivos */
  return { requireAuth: true, domain: "quartavia.com.br", source: "safe-default" };
}

export async function completeOAuthIfPresent() {
  const client = await getSupabaseClient();
  const hash = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!hash.includes("access_token=") && !window.location.search.includes("code=")) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (data?.session) {
    storeSession(data.session);
    const clean = window.location.pathname + window.location.search;
    window.history.replaceState({}, document.title, clean);
    return data.session;
  }
  return null;
}

export async function ensureCorporateSession({ onStatus } = {}) {
  const policy = await fetchAuthPolicy();
  if (!policy.requireAuth) return { required: false, session: null, policy };

  onStatus?.("Verificando sessão…");
  await completeOAuthIfPresent().catch(() => {});

  let session = readStoredSession();
  let authError = null;
  if (session) {
    const me = await fetchWithTimeout("/api/session-me", { headers: authHeaders() });
    if (me.ok) return { required: true, session, email: (await me.json()).email, policy };
    authError = await me.json().catch(() => ({}));
    clearStoredSession();
    session = null;
  }

  onStatus?.("Login necessário");
  return { required: true, session: null, policy, authError };
}

export async function signInWithGoogleCorporate() {
  const client = await getSupabaseClient();
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        hd: "quartavia.com.br",
        prompt: "select_account",
      },
    },
  });
  if (error) throw error;
  if (data?.url) window.location.assign(data.url);
}

export async function signOutCorporate() {
  clearStoredSession();
  cachedClient = null;
}

export function isAuthErrorCode(code) {
  return (
    code === "AUTH_REQUIRED"
    || code === "AUTH_INVALID"
    || code === "AUTH_DOMAIN"
    || code === "AUTH_NOT_CONFIGURED"
    || code === "AUTH_UPSTREAM"
  );
}

/** Erro de auth que não deve limpar sessão local (rede/upstream). */
export function isTransientAuthErrorCode(code) {
  return code === "AUTH_UPSTREAM";
}
