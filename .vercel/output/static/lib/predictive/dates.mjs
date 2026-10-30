import { parseDate } from "../utils.mjs";

export function endOfUtcMonthFromParts(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
}

export function endOfUtcMonth(date) {
  if (!date) return null;
  return endOfUtcMonthFromParts(date.getUTCFullYear(), date.getUTCMonth());
}

export function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthStartsBetween(start, end, maxMonths = 120) {
  const months = [];
  if (!start || !end || start > end) return months;
  let cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endMs = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1);
  while (Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), 1) <= endMs && months.length < maxMonths) {
    months.push(new Date(cur));
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return months;
}

export function addUtcDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function sameUtcDay(a, b) {
  if (!a || !b) return false;
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

export function resolveObservationAsOf({ meetingStarts = [], mechanismRows = [], npsRows = [], extractedAt = new Date() }) {
  const candidates = [extractedAt];
  for (const start of meetingStarts) {
    const d = parseDate(start);
    if (d) candidates.push(d);
  }
  for (const row of mechanismRows) {
    const d = parseDate(row.implemented_at) || parseDate(row.created_at);
    if (d) candidates.push(d);
  }
  for (const row of npsRows) {
    const d = parseDate(row.submitted_at) || parseDate(row.created_at);
    if (d) candidates.push(d);
  }
  return candidates.reduce((max, d) => (d > max ? d : max), new Date(0));
}
