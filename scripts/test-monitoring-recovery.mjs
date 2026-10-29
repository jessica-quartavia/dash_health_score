/**
 * Testa recuperação local (e Supabase se --remote-key informado via env audit).
 */
import { loadProjectEnv } from "../lib/load-env.mjs";
import { listSnapshots } from "../lib/monitoring/snapshot-store.mjs";
import { locateLocalSnapshot, verifyLocalFileIntegrity, recoverFromSupabase } from "../lib/monitoring/storage-recovery.mjs";
import { artifactObjectKey } from "../lib/monitoring/storage-paths.mjs";

loadProjectEnv();

const snaps = listSnapshots();
let latest = snaps[0];
let path = latest?.file ? locateLocalSnapshot(latest.file) : null;
let check = path ? verifyLocalFileIntegrity(path, { expectSnapshot: true }) : { ok: false };

for (const entry of snaps) {
  const p = locateLocalSnapshot(entry.file);
  if (!p) continue;
  const v = verifyLocalFileIntegrity(p, { expectSnapshot: true });
  if (v.ok) {
    latest = entry;
    path = p;
    check = v;
    break;
  }
}

if (!latest?.file || !path) {
  console.error("Nenhum snapshot local recuperável (com integridade).");
  process.exitCode = 1;
  process.exit();
}

console.log("Local:", { file: latest.file, referenceDay: latest.referenceDay, integrity: check });

if (process.argv.includes("--remote") && process.env.MONITORING_SUPABASE_URL) {
  const key = artifactObjectKey({
    referenceDate: `${latest.referenceDay}T12:00:00.000Z`,
    type: "snapshots",
    fileName: latest.file,
  });
  const remote = await recoverFromSupabase(key);
  console.log("Remote:", { objectKey: key, ok: remote.ok, sha256: remote.sha256, snapshotIntegrity: remote.snapshotIntegrity });
  if (remote.ok && check.sha256 && remote.sha256 !== check.sha256) {
    console.error("Hash remoto diverge do local.");
    process.exitCode = 1;
  }
}

process.exitCode = check.ok ? 0 : 1;
