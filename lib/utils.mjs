/**
 * Utilitários de data, texto e exclusões locais.
 */

const EXCLUDED_EMAILS = new Set(["casoisolado32@gmail.com"]);
const EXCLUDED_NAMES = new Set(["liliane reus", "liliane dos santos reus"]);

export function blankToNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

export function parseDate(value) {
  const raw = blankToNull(value);
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  const text = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(text)) {
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s|$)/);
  if (br) {
    let y = Number(br[3]);
    if (y < 100) y += 2000;
    const date = new Date(Date.UTC(y, Number(br[2]) - 1, Number(br[1])));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function daysBetween(a, b) {
  const ms =
    Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) -
    Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  return Math.floor(ms / 86400000);
}

/** Meses inclusive entre duas datas (mínimo 1), alinhado ao dash de reuniões. */
export function monthsBetween(a, b) {
  if (!a || !b) return 1;
  const months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
  return Math.max(1, months);
}

export function foldText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function isExcludedClient(row) {
  const name = foldText(row?.name ?? row?.client_name ?? row?.clientName);
  const email = foldText(row?.email ?? row?.client_email ?? row?.clientEmail);
  return EXCLUDED_NAMES.has(name) || EXCLUDED_EMAILS.has(email);
}

export function filterExcludedClients(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => !isExcludedClient(row));
}

export function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

export function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function pct(part, total) {
  if (!total) return 0;
  return round2((part / total) * 100);
}
