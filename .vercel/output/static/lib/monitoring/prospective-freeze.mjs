/**
 * Congelamento mensal de features para validação prospectiva de churn (90d).
 * Sem rótulo nesta etapa — vínculo posterior via clientRef + referenceMonth.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stableClientRef } from "./snapshot-store.mjs";
import { OFFICIAL_FORMULA_VERSION, HS2A_VERSION } from "../hs2a-interpretation.mjs";

export const PROSPECTIVE_TRANSFORM_VERSION = "prospective-freeze-etapa10-v1";

export const APPROVED_HISTORICAL_FEATURES = [
  "hs",
  "e",
  "m",
  "totalMeetings",
  "implementedCount",
  "avgMeetingsPerMonth",
  "daysSinceEntry",
  "daysSinceLastMeeting",
  "reunioes30d",
  "attendanceRate",
  "qualidade",
  "fase",
  "perfil",
];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "research", "monitoring", "prospective");

export function monthKey(referenceDate = new Date()) {
  return String(referenceDate.toISOString()).slice(0, 7);
}

export function buildProspectiveFreeze(clients, { referenceDate = new Date(), population = "ativos", sources = {} } = {}) {
  const refDay = referenceDate.toISOString().slice(0, 10);
  const refMonth = monthKey(referenceDate);
  return {
    schema: "prospective-freeze-v1",
    referenceMonth: refMonth,
    referenceDay: refDay,
    population,
    formulaVersion: OFFICIAL_FORMULA_VERSION,
    hs2aVersion: HS2A_VERSION,
    transformVersion: PROSPECTIVE_TRANSFORM_VERSION,
    features: APPROVED_HISTORICAL_FEATURES,
    labelPolicy: {
      horizonDays: 90,
      maturation: "rótulo só após ref + 90d com desfecho consolidado (read-only)",
      linkKey: "clientRef + referenceMonth",
      noRetroactiveRecalc: true,
    },
    sourcesAvailable: sources,
    rows: clients.map((c) => ({
      clientRef: stableClientRef(c.clientId),
      hs: c.healthScore,
      e: c.engagementScore,
      m: c.mechanismScore,
      totalMeetings: c.totalMeetings,
      implementedCount: c.implementedCount,
      avgMeetingsPerMonth: c.avgMeetingsPerMonth,
      daysSinceEntry: c.daysSinceEntry,
      daysSinceLastMeeting: c.daysSinceLastMeeting,
      reunioes30d: c.reunioes30d,
      attendanceRate: c.attendanceRate,
      qualidade: c.hs2a?.qualidadeCodigo,
      fase: c.hs2a?.faseRelacionamento,
      perfil: c.hs2a?.perfilCodigo,
    })),
    rowCount: clients.length,
    integrity: null,
  };
}

export function freezeIntegrity(freeze) {
  const copy = { ...freeze, integrity: undefined };
  return createHash("sha256").update(JSON.stringify(copy)).digest("hex");
}

export function writeProspectiveFreeze(freeze, { idempotent = true, force = false } = {}) {
  mkdirSync(ROOT, { recursive: true });
  const name = `${freeze.referenceMonth}_${freeze.population}_${freeze.transformVersion}.json`;
  const path = join(ROOT, name);
  if (idempotent && !force && existsSync(path)) {
    return { path, skipped: true, reason: "freeze_mensal_ja_existe" };
  }
  const withHash = { ...freeze, integrity: freezeIntegrity(freeze) };
  writeFileSync(path, `${JSON.stringify(withHash, null, 2)}\n`, "utf8");
  return { path, skipped: false, integrity: withHash.integrity };
}
