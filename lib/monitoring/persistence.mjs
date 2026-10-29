import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { monitoringRoot } from "./storage-backend.mjs";
import { artifactObjectKey, mirrorRelativePath } from "./storage-paths.mjs";
import { uploadMonitoringFile, fileSha256 } from "./supabase-storage.mjs";

export async function persistArtifact(localPath, { type, referenceDate = new Date(), force = false } = {}) {
  if (!existsSync(localPath)) return { ok: false, error: "arquivo_local_ausente" };
  const fileName = basename(localPath);
  const sha256 = fileSha256(localPath);
  const results = { local: { ok: true, path: localPath, sha256 }, mirrors: [] };

  const mirrorPath = process.env.MONITORING_MIRROR_PATH;
  if (mirrorPath) {
    try {
      const key = artifactObjectKey({ referenceDate, type, fileName });
      const rel = mirrorRelativePath(key);
      const dest = join(mirrorPath, rel);
      mkdirSync(dirname(dest), { recursive: true });
      if (!force && existsSync(dest)) {
        const existingHash = fileSha256(dest);
        if (existingHash === sha256) {
          results.mirrors.push({ target: "filesystem_mirror", ok: true, skipped: true, sha256 });
        } else {
          results.mirrors.push({ target: "filesystem_mirror", ok: false, skipped: true, reason: "sobrescrita_bloqueada" });
        }
      } else {
        copyFileSync(localPath, dest);
        results.mirrors.push({ target: "filesystem_mirror", ok: true, path: rel, sha256 });
      }
    } catch (error) {
      results.mirrors.push({ target: "filesystem_mirror", ok: false, error: error.message });
    }
  }

  const supa = await uploadMonitoringFile(localPath, { type, fileName, referenceDate, force });
  if (!supa.skipped || supa.ok) results.mirrors.push({ target: "supabase_storage", ...supa });

  const anyOk = results.mirrors.some((m) => m.ok);
  return { ok: results.local.ok && (results.mirrors.length === 0 || anyOk), ...results };
}

export async function persistPipelineBundle({
  referenceDate,
  snapshotPath,
  snapshotFileName,
  freezePath,
  freezeFileName,
  manifestPath,
  reportPaths = [],
  runLogPath,
  force = false,
}) {
  const persisted = [];
  const errors = [];

  if (snapshotPath) {
    const r = await persistArtifact(snapshotPath, { type: "snapshots", referenceDate, force });
    persisted.push({ kind: "snapshot", ...r });
    if (!r.ok && r.mirrors?.length) errors.push("snapshot_mirror_parcial");
  }
  if (freezePath && existsSync(freezePath)) {
    const r = await persistArtifact(freezePath, { type: "prospective", referenceDate, force });
    persisted.push({ kind: "freeze", ...r });
  }
  if (manifestPath && existsSync(manifestPath)) {
    const r = await persistArtifact(manifestPath, { type: "manifest", referenceDate, force });
    persisted.push({ kind: "manifest", ...r });
  }
  for (const p of reportPaths) {
    if (existsSync(p)) {
      const r = await persistArtifact(p, { type: "reports", referenceDate, force });
      persisted.push({ kind: "report", file: basename(p), ...r });
    }
  }
  if (runLogPath && existsSync(runLogPath)) {
    const r = await persistArtifact(runLogPath, { type: "runs", referenceDate, force });
    persisted.push({ kind: "run_log", ...r });
  }

  const metaPath = join(monitoringRoot(), "meta", `persist_${referenceDate.toISOString().slice(0, 10)}.json`);
  mkdirSync(join(metaPath, ".."), { recursive: true });
  const meta = {
    at: new Date().toISOString(),
    referenceDay: referenceDate.toISOString().slice(0, 10),
    snapshotFileName,
    freezeFileName,
    persisted: persisted.map((p) => ({ kind: p.kind, ok: p.ok, mirrors: p.mirrors })),
  };
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  await persistArtifact(metaPath, { type: "meta", referenceDate, force });

  return {
    ok: errors.length === 0,
    persisted,
    errors,
    metaPath,
  };
}
