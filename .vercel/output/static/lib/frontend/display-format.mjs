/** Formatação defensiva — evita NaN/Infinity na UI sem mascarar ausência real. */

export function finiteNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function formatCount(fmt, value) {
  const n = finiteNumber(value);
  if (n == null) return "—";
  return fmt.format(n);
}

export function formatPercentFromRate(pctFmt, rate, { decimals = 1 } = {}) {
  const n = finiteNumber(rate);
  if (n == null) return "—";
  const formatter =
    pctFmt ||
    new Intl.NumberFormat("pt-BR", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
  return `${formatter.format(n * 100)}%`;
}

export function sanitizeRate(value) {
  const n = finiteNumber(value);
  if (n == null || n < 0 || n > 1) return null;
  return n;
}

export function assertNoInvalidNumbers(obj, path = "") {
  const issues = [];
  if (obj == null || typeof obj !== "object") return issues;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => issues.push(...assertNoInvalidNumbers(item, `${path}[${i}]`)));
    return issues;
  }
  for (const [key, val] of Object.entries(obj)) {
    const p = path ? `${path}.${key}` : key;
    if (typeof val === "number" && !Number.isFinite(val)) issues.push(p);
    else if (val && typeof val === "object") issues.push(...assertNoInvalidNumbers(val, p));
  }
  return issues;
}
