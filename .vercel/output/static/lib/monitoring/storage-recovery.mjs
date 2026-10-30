import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { monitoringRoot } from "./storage-backend.mjs";
import { recoverMonitoringObject } from "./supabase-storage.mjs";
import { verifySnapshotIntegrity } from "./snapshot-store.mjs";
import { fileSha256 } from "./supabase-storage.mjs";

export function locateLocalSnapshot(fileName) {
  const path = join(monitoringRoot(), "snapshots", fileName);
  return existsSync(path) ? path : null;
}

export function verifyLocalFileIntegrity(path, { expectSnapshot = false } = {}) {
  if (!existsSync(path)) return { ok: false, reason: "nao_encontrado" };
  const raw = readFileSync(path, "utf8");
  const sha256 = fileSha256(Buffer.from(raw));
  if (!expectSnapshot) return { ok: true, sha256 };
  try {
    const json = JSON.parse(raw);
    const snapCheck = verifySnapshotIntegrity(json);
    return { ok: snapCheck.ok, sha256, snapshot: snapCheck };
  } catch {
    return { ok: false, sha256, reason: "json_invalido" };
  }
}

export async function recoverFromSupabase(objectKey, { restorePath } = {}) {
  const rec = await recoverMonitoringObject(objectKey);
  if (!rec.ok) return rec;
  if (restorePath) {
    mkdirSync(join(restorePath, ".."), { recursive: true });
    writeFileSync(restorePath, rec.body, "utf8");
    const localSha = fileSha256(restorePath);
    if (localSha !== rec.sha256) return { ok: false, reason: "hash_local_diverge" };
  }
  let snapshotCheck = null;
  try {
    const json = JSON.parse(rec.body);
    snapshotCheck = verifySnapshotIntegrity(json);
  } catch {
    snapshotCheck = null;
  }
  return {
    ok: true,
    objectKey,
    sha256: rec.sha256,
    restored: Boolean(restorePath),
    snapshotIntegrity: snapshotCheck,
  };
}

export function restoreManifestFromMirror(mirrorRoot, fileName = "manifest.json") {
  const src = join(mirrorRoot, "monitoring", new Date().getFullYear(), String(new Date().getMonth() + 1).padStart(2, "0"), "manifest", fileName);
  if (!existsSync(src)) {
    const flat = join(mirrorRoot, "manifest.json");
    if (!existsSync(flat)) return { ok: false, reason: "manifest_nao_encontrado" };
    const dest = join(monitoringRoot(), "manifest.json");
    writeFileSync(dest, readFileSync(flat, "utf8"), "utf8");
    return { ok: true, from: flat, dest };
  }
  const dest = join(monitoringRoot(), "manifest.json");
  writeFileSync(dest, readFileSync(src, "utf8"), "utf8");
  return { ok: true, from: src, dest };
}
