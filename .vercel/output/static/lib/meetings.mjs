/**
 * Contagem de reuniões: client_meetings + manual exclusivas
 * (mesmo client_id + start_time), excluindo datas anteriores à entrada
 * e reuniões canceladas via meeting_attendance quando houver URI.
 */

import { blankToNull, foldText, parseDate, startOfUtcDay } from "./utils.mjs";

export function meetingStartCorrespondenceKey(clientId, startTime) {
  const id = blankToNull(clientId);
  const start = parseDate(startTime);
  if (!id || !start) return null;
  return `${String(id)}|${start.toISOString()}`;
}

export function isValidMeetingStart(start, entryDate, now = new Date()) {
  if (!start) return false;
  if (start > now) return false;
  if (entryDate && startOfUtcDay(start) < startOfUtcDay(entryDate)) return false;
  return true;
}

export function isCancelledAttendance(status) {
  const s = foldText(status);
  return ["cancelada", "cancelado", "canceled", "cancelled"].includes(s);
}

/** Mapa calendly_event_uri → status mais recente. */
export function buildAttendanceStatusMap(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    const uri = blankToNull(row.calendly_event_uri);
    if (!uri) continue;
    const updated = parseDate(row.updated_at) || parseDate(row.created_at) || new Date(0);
    const current = map.get(uri);
    if (!current || updated > current.updated) {
      map.set(uri, { updated, status: blankToNull(row.status) });
    }
  }
  return map;
}

function isCancelledUri(uri, attendanceMap) {
  if (!uri || !attendanceMap) return false;
  const info = attendanceMap.get(uri);
  return info ? isCancelledAttendance(info.status) : false;
}

function attendanceFlag(uri, attendanceMap) {
  if (!uri || !attendanceMap) return { tracked: false, attended: null };
  const info = attendanceMap.get(uri);
  const status = foldText(info?.status);
  if (!status) return { tracked: false, attended: null };
  if (status.includes("falt") || status.includes("ausent") || status.includes("no_show") || status.includes("noshow") || status.includes("no-show")) {
    return { tracked: true, attended: false };
  }
  if (status.includes("present") || status.includes("comparec") || status.includes("realiz") || status.includes("attend")) {
    return { tracked: true, attended: true };
  }
  return { tracked: true, attended: null };
}

/**
 * Lista datas válidas de reunião do cliente, já deduplicadas.
 */
export function collectValidMeetings({
  clientId,
  calendlyRows = [],
  manualRows = [],
  entryDate = null,
  now = new Date(),
  attendanceMap = null,
} = {}) {
  const id = String(clientId || "");
  const items = [];
  const correspondenceKeys = new Set();

  for (const row of calendlyRows) {
    if (String(blankToNull(row.client_id) || "") !== id) continue;
    const start = parseDate(row.start_time);
    if (!isValidMeetingStart(start, entryDate, now)) continue;
    const uri = blankToNull(row.calendly_event_uri);
    if (isCancelledUri(uri, attendanceMap)) continue;
    const presence = attendanceFlag(uri, attendanceMap);
    items.push({ start, ...presence });
    const key = meetingStartCorrespondenceKey(id, row.start_time);
    if (key) correspondenceKeys.add(key);
  }

  for (const row of manualRows) {
    if (String(blankToNull(row.client_id) || "") !== id) continue;
    const start = parseDate(row.start_time);
    if (!isValidMeetingStart(start, entryDate, now)) continue;
    const key = meetingStartCorrespondenceKey(id, row.start_time);
    if (key && correspondenceKeys.has(key)) continue;
    const manualUri = `manual:${row.id}`;
    if (isCancelledUri(manualUri, attendanceMap)) continue;
    const presence = attendanceFlag(manualUri, attendanceMap);
    items.push({ start, ...presence });
  }

  items.sort((a, b) => a.start - b.start);
  return items;
}

export function listValidMeetingStarts(opts = {}) {
  return collectValidMeetings(opts).map((item) => item.start);
}

export function countMeetingsInFirstDays(starts, entryDate, days = 45) {
  if (!entryDate) return 0;
  const end = new Date(entryDate.getTime());
  end.setUTCDate(end.getUTCDate() + days);
  let count = 0;
  for (const start of starts) {
    if (startOfUtcDay(start) < startOfUtcDay(entryDate)) continue;
    if (startOfUtcDay(start) > startOfUtcDay(end)) continue;
    count += 1;
  }
  return count;
}
