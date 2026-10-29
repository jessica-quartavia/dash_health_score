import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { artifactObjectKey } from "../lib/monitoring/storage-paths.mjs";
import { redactEnvPresence, detectCredentialReuseRisk } from "../lib/monitoring/config-audit.mjs";
import { persistArtifact } from "../lib/monitoring/persistence.mjs";
import { verifyLocalFileIntegrity, locateLocalSnapshot } from "../lib/monitoring/storage-recovery.mjs";
import { buildSnapshotRecords, writeSnapshot, snapshotIntegrity } from "../lib/monitoring/snapshot-store.mjs";
import { HS2A_VERSION, OFFICIAL_FORMULA_VERSION } from "../lib/hs2a-interpretation.mjs";

test("auditoria não expõe valores de credenciais", () => {
  process.env.MONITORING_SUPABASE_SERVICE_KEY = "super-secret-key-value";
  const p = redactEnvPresence();
  assert.equal(p.MONITORING_SUPABASE_SERVICE_KEY.defined, true);
  assert.ok(p.MONITORING_SUPABASE_SERVICE_KEY.fingerprint);
  assert.notEqual(p.MONITORING_SUPABASE_SERVICE_KEY.fingerprint, "super-secret-key-value");
  delete process.env.MONITORING_SUPABASE_SERVICE_KEY;
});

test("bloqueia reutilização da credencial DATA no monitoramento", () => {
  const prevUrl = process.env.DATA_SUPABASE_URL;
  const prevKey = process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
  process.env.DATA_SUPABASE_URL = "https://example.supabase.co";
  process.env.DATA_SUPABASE_SERVICE_ROLE_KEY = "same-key";
  process.env.MONITORING_SUPABASE_URL = "https://example.supabase.co";
  process.env.MONITORING_SUPABASE_SERVICE_KEY = "same-key";
  const risks = detectCredentialReuseRisk();
  assert.ok(risks.length >= 2);
  delete process.env.MONITORING_SUPABASE_URL;
  delete process.env.MONITORING_SUPABASE_SERVICE_KEY;
  if (prevUrl === undefined) delete process.env.DATA_SUPABASE_URL;
  else process.env.DATA_SUPABASE_URL = prevUrl;
  if (prevKey === undefined) delete process.env.DATA_SUPABASE_SERVICE_ROLE_KEY;
  else process.env.DATA_SUPABASE_SERVICE_ROLE_KEY = prevKey;
});

test("caminhos organizados ano/mes/tipo", () => {
  const key = artifactObjectKey({
    referenceDate: new Date("2026-03-15T12:00:00.000Z"),
    type: "snapshots",
    fileName: "snap.json",
  });
  assert.match(key, /^monitoring\/2026\/03\/snapshots\/snap\.json$/);
});

test("persistência mirror idempotente e bloqueio de sobrescrita", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "hs-mirror-"));
  const mirror = mkdtempSync(join(tmpdir(), "hs-mirror-dest-"));
  writeFileSync(join(tmpRoot, ".pseudonym-secret"), "x".repeat(32), "utf8");
  mkdirSync(join(tmpRoot, "snapshots"), { recursive: true });
  process.env.HS_MONITORING_ROOT = tmpRoot;
  process.env.MONITORING_MIRROR_PATH = mirror;

  const snap = buildSnapshotRecords([], {
    referenceDate: new Date("2099-04-01T12:00:00.000Z"),
    population: "ativos",
    formulaVersion: OFFICIAL_FORMULA_VERSION,
    hs2aVersion: HS2A_VERSION,
    filters: {},
  });
  const w = writeSnapshot(snap, { idempotent: true });
  assert.equal(w.skipped, false);

  const r1 = await persistArtifact(w.path, { type: "snapshots", referenceDate: new Date("2099-04-01T12:00:00.000Z") });
  assert.ok(r1.mirrors.some((m) => m.target === "filesystem_mirror" && m.ok));

  writeFileSync(w.path, '{"tampered":true}\n', "utf8");
  const r2 = await persistArtifact(w.path, { type: "snapshots", referenceDate: new Date("2099-04-01T12:00:00.000Z") });
  const block = r2.mirrors.find((m) => m.reason === "sobrescrita_bloqueada");
  assert.ok(block);

  rmSync(tmpRoot, { recursive: true, force: true });
  rmSync(mirror, { recursive: true, force: true });
  delete process.env.HS_MONITORING_ROOT;
  delete process.env.MONITORING_MIRROR_PATH;
});

test("recuperação local confere hash e integridade snapshot", async () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), "hs-rec-"));
  writeFileSync(join(tmpRoot, ".pseudonym-secret"), "y".repeat(32), "utf8");
  mkdirSync(join(tmpRoot, "snapshots"), { recursive: true });
  process.env.HS_MONITORING_ROOT = tmpRoot;

  const { writeSnapshot: ws, buildSnapshotRecords: bs } = await import("../lib/monitoring/snapshot-store.mjs");
  const snap = bs([], {
    referenceDate: new Date("2099-05-01T12:00:00.000Z"),
    population: "ativos",
    formulaVersion: OFFICIAL_FORMULA_VERSION,
    hs2aVersion: HS2A_VERSION,
    filters: {},
  });
  const stored = { ...snap, integrity: snapshotIntegrity(snap) };
  const name = "2099-05-01_ativos_test.json";
  writeFileSync(join(tmpRoot, "snapshots", name), `${JSON.stringify(stored)}\n`, "utf8");

  const path = locateLocalSnapshot(name);
  const v = verifyLocalFileIntegrity(path, { expectSnapshot: true });
  assert.equal(v.ok, true);

  rmSync(tmpRoot, { recursive: true, force: true });
  delete process.env.HS_MONITORING_ROOT;
});

test("falha de autenticação Storage não vaza credencial", async () => {
  const originalFetch = globalThis.fetch;
  process.env.MONITORING_SUPABASE_URL = "https://example.supabase.co";
  process.env.MONITORING_SUPABASE_SERVICE_KEY = "secret-key-12345";
  process.env.MONITORING_STORAGE_BUCKET = "test-bucket";
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => "Unauthorized" });
  const { probeSupabaseStorage } = await import("../lib/monitoring/supabase-storage.mjs");
  const probe = await probeSupabaseStorage();
  assert.equal(probe.available, false);
  assert.equal(probe.write, false);
  const serialized = JSON.stringify(probe);
  assert.doesNotMatch(serialized, /secret-key-12345/);
  globalThis.fetch = originalFetch;
  delete process.env.MONITORING_SUPABASE_URL;
  delete process.env.MONITORING_SUPABASE_SERVICE_KEY;
  delete process.env.MONITORING_STORAGE_BUCKET;
});

test("JSON de auditoria não contém service key em claro", () => {
  process.env.MONITORING_SUPABASE_SERVICE_KEY = "plaintext-key-should-not-leak";
  const audit = JSON.stringify(redactEnvPresence());
  assert.doesNotMatch(audit, /plaintext-key-should-not-leak/);
  delete process.env.MONITORING_SUPABASE_SERVICE_KEY;
});
