/**
 * Sessão Google corporativa (Supabase Auth) — chaves publicáveis via /api/auth/config.
 */

const SESSION_KEY = "ha:supabaseSession";

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

async function loadAuthConfig() {
  if (cachedConfig) return cachedConfig;
  const res = await fetch("/api/auth/config", { method: "GET" });
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

export async function fetchAuthPolicy() {
  const res = await fetch("/api/auth/policy", { method: "GET", cache: "no-store" });
  if (!res.ok) return { requireAuth: false, domain: "quartavia.com.br" };
  return res.json();
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
  if (!policy.requireAuth) return { required: false, session: null };

  onStatus?.("Verificando sessão…");
  await completeOAuthIfPresent().catch(() => {});

  let session = readStoredSession();
  if (session) {
    const me = await fetch("/api/auth/me", { headers: authHeaders() });
    if (me.ok) return { required: true, session, email: (await me.json()).email };
    clearStoredSession();
    session = null;
  }

  onStatus?.("Login necessário");
  return { required: true, session: null, policy };
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
