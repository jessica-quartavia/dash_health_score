/**
 * Parse fetch response as JSON; reject HTML SPA fallbacks with a clear error.
 * @returns {Promise<{ ok: boolean, status: number, data?: object, error?: string }>}
 */
export async function fetchJsonArtifact(url) {
  const res = await fetch(url);
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();
  if (!contentType.includes("json")) {
    const preview = text.trimStart().slice(0, 40);
    const looksHtml = preview.startsWith("<!") || preview.startsWith("<html");
    return {
      ok: false,
      status: res.status,
      error: looksHtml
        ? "Resposta HTML em vez de JSON — reinicie o servidor com npm run dev (porta 3010)."
        : `Content-Type inesperado: ${contentType || "desconhecido"}`,
    };
  }
  try {
    const data = JSON.parse(text);
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: res.status, error: e.message || "JSON inválido" };
  }
}
