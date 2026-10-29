import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRunIdempotencyKey, rowChecksum } from "../lib/monitoring/business-data-persist.mjs";
import { shouldSkipIdempotentRun } from "../lib/business-data/reporting-filters.mjs";
import { assertNotBaseQvUrl, businessDataConfig } from "../lib/business-data/config.mjs";
import { stableClientRef } from "../lib/monitoring/snapshot-store.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SQL = join(ROOT, "supabase/business-data/migrations/20261029180000_dash_health_score_etapa12_schema.sql");

test("migration SQL define tabelas Etapa 12", () => {
  assert.ok(existsSync(SQL));
  const sql = readFileSync(SQL, "utf8");
  for (const table of [
    "pipeline_runs",
    "client_snapshots",
    "snapshot_components",
    "quality_issues",
    "prospective_freezes",
    "prospective_features",
    "churn_outcomes",
  ]) {
    assert.match(sql, new RegExp(table));
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /client_snapshots_identity_unique/);
});

test("idempotency key estável por referência e versão", () => {
  const k1 = buildRunIdempotencyKey({
    referenceDay: "2026-10-29",
    population: "ativos",
    versionFingerprint: "abc123",
    filtersFingerprint: "ff1",
  });
  const k2 = buildRunIdempotencyKey({
    referenceDay: "2026-10-29",
    population: "ativos",
    versionFingerprint: "abc123",
    filtersFingerprint: "ff1",
  });
  assert.equal(k1, k2);
  assert.notEqual(
    k1,
    buildRunIdempotencyKey({
      referenceDay: "2026-10-30",
      population: "ativos",
      versionFingerprint: "abc123",
      filtersFingerprint: "ff1",
    }),
  );
});

test("config Business Data rejeita URL da BASE QV", () => {
  assert.throws(() => assertNotBaseQvUrl("https://lacinxsvjdwalkchxyeo.supabase.co"));
  assert.doesNotThrow(() => assertNotBaseQvUrl("https://rckpuebaiswrxzmywllv.supabase.co"));
});

test("pseudonimização estável com segredo fixo", () => {
  const prev = process.env.HS_MONITORING_PSEUDONYM_SECRET;
  process.env.HS_MONITORING_PSEUDONYM_SECRET = "test-secret-etapa12-fixed";
  assert.equal(stableClientRef(99), stableClientRef(99));
  assert.match(stableClientRef(99), /^m_[0-9a-f]{20}$/);
  if (prev == null) delete process.env.HS_MONITORING_PSEUDONYM_SECRET;
  else process.env.HS_MONITORING_PSEUDONYM_SECRET = prev;
});

test("row checksum determinístico", () => {
  const a = rowChecksum({ hs: 50, e: 60 });
  const b = rowChecksum({ hs: 50, e: 60 });
  assert.equal(a, b);
});

test("idempotência só com run success e contagens coerentes", () => {
  assert.equal(shouldSkipIdempotentRun({ status: "success", snapshot_rows: 10, client_count: 10 }), true);
  assert.equal(shouldSkipIdempotentRun({ status: "success", snapshot_rows: 5, client_count: 10 }), false);
  assert.equal(shouldSkipIdempotentRun({ status: "failed", snapshot_rows: 0, client_count: 10 }), false);
  assert.equal(shouldSkipIdempotentRun({ status: "running", snapshot_rows: 0, client_count: 10 }), false);
});

test("business data ready exige service role", () => {
  const cfg = businessDataConfig();
  assert.equal(cfg.projectRef, "rckpuebaiswrxzmywllv");
  assert.equal(typeof cfg.ready, "boolean");
});
