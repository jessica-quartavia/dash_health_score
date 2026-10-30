/**
 * Snapshots locais de monitoramento (pesquisa) — pseudonimizados, sem PII.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, randomBytes } from "node:crypto";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "research", "monitoring");

export function monitoringDataRoot() {
  return process.env.HS_MONITORING_ROOT || DEFAULT_ROOT;
}

function snapDir() {
  return join(monitoringDataRoot(), "snapshots");
}

function manifestPath() {
  return join(monitoringDataRoot(), "manifest.json");
}

export const SNAPSHOT_SCHEMA = "hs-monitor-v1";

export function versionFingerprint(formulaVersion, hs2aVersion) {
  return createHash("sha256").update(`${formulaVersion}|${hs2aVersion}`).digest("hex").slice(0, 12);
}

export function snapshotIntegrity(snapshot) {
  const copy = { ...snapshot, integrity: undefined };
  return createHash("sha256").update(JSON.stringify(copy)).digest("hex");
}

export function verifySnapshotIntegrity(snapshot) {
  if (!snapshot?.integrity) return { ok: false, reason: "integrity_ausente" };
  const expected = snapshotIntegrity({ ...snapshot, integrity: undefined });
  return snapshot.integrity === expected ? { ok: true } : { ok: false, reason: "hash_nao_confere" };
}

function monitoringSecret() {
  const fromEnv = process.env.HS_MONITORING_PSEUDONYM_SECRET?.trim();
  if (fromEnv) return fromEnv;
  const root = monitoringDataRoot();
  mkdirSync(root, { recursive: true });
  const file = join(root, ".pseudonym-secret");
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("hex"), "utf8");
  return readFileSync(file, "utf8").trim();
}

export function stableClientRef(clientId) {
  const digest = createHmac("sha256", monitoringSecret()).update(`m:${String(clientId)}`).digest("hex").slice(0, 20);
  return `m_${digest}`;
}

function dayKey(isoDate) {
  return String(isoDate).slice(0, 10);
}

export function buildSnapshotRecords(clients, { referenceDate = new Date(), population = "ativos", formulaVersion, hs2aVersion, filters = {} }) {
  const ref = referenceDate.toISOString();
  const refDay = dayKey(ref);
  return {
    schema: SNAPSHOT_SCHEMA,
    referenceDate: ref,
    referenceDay: refDay,
    population,
    formulaVersion,
    hs2aVersion,
    filters,
    filtersFingerprint: createHash("sha256").update(JSON.stringify(filters)).digest("hex").slice(0, 16),
    versionFingerprint: versionFingerprint(formulaVersion, hs2aVersion),
    rows: clients.map((c) => ({
      clientRef: stableClientRef(c.clientId),
      hs: c.healthScore,
      e: c.engagementScore,
      m: c.mechanismScore,
      classificacao: c.finalClass,
      perfil: c.hs2a?.perfilCodigo,
      qualidade: c.hs2a?.qualidadeCodigo,
      fase: c.hs2a?.faseRelacionamento,
      programa: c.program || "",
      ep: c.engineer || "",
      status: c.analyticalStatus || "",
      coberturaReuniao: c.hs2a?.coberturaReunioes,
      coberturaMec: c.hs2a?.coberturaMecanismos,
      issueKeys: [...new Set((c.hs2a?.diagnostico || []).map((d) => String(d.tipo || d.causa || "").trim()).filter(Boolean))],
    })),
  };
}

export function snapshotFileName(snapshot) {
  const vf = snapshot.versionFingerprint || versionFingerprint(snapshot.formulaVersion, snapshot.hs2aVersion);
  return `${snapshot.referenceDay}_${snapshot.population}_${vf}_${snapshot.filtersFingerprint}.json`;
}

export function writeSnapshot(snapshot, { idempotent = true, force = false } = {}) {
  const dir = snapDir();
  mkdirSync(dir, { recursive: true });
  const name = snapshotFileName(snapshot);
  const path = join(dir, name);
  if (idempotent && !force && existsSync(path)) {
    const existing = JSON.parse(readFileSync(path, "utf8"));
    const check = verifySnapshotIntegrity(existing);
    return {
      path,
      skipped: true,
      reason: "snapshot_ja_existe_data_versao",
      integrity: check,
      fileName: name,
    };
  }
  const withIntegrity = { ...snapshot, integrity: snapshotIntegrity(snapshot) };
  writeFileSync(path, `${JSON.stringify(withIntegrity, null, 2)}\n`, "utf8");
  updateManifest(path, withIntegrity);
  return { path, skipped: false, integrity: { ok: true, hash: withIntegrity.integrity }, fileName: name };
}

function updateManifest(path, snapshot) {
  let manifest = { version: 1, snapshots: [] };
  const MANIFEST = manifestPath();
  if (existsSync(MANIFEST)) {
    try {
      manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
    } catch {
      manifest = { version: 1, snapshots: [] };
    }
  }
  const entry = {
    file: path.split(/[/\\]/).pop(),
    referenceDay: snapshot.referenceDay,
    population: snapshot.population,
    formulaVersion: snapshot.formulaVersion,
    hs2aVersion: snapshot.hs2aVersion,
    versionFingerprint: snapshot.versionFingerprint,
    rowCount: snapshot.rows.length,
    integrity: snapshot.integrity,
    writtenAt: new Date().toISOString(),
  };
  manifest.snapshots = [entry, ...manifest.snapshots.filter((s) => s.file !== entry.file)].slice(0, 120);
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function listSnapshots() {
  const MANIFEST = manifestPath();
  if (!existsSync(MANIFEST)) return [];
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8")).snapshots || [];
  } catch {
    return [];
  }
}

export function loadSnapshot(fileName) {
  const path = join(snapDir(), fileName);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadLatestComparable(population = "ativos") {
  const files = listSnapshots().filter((s) => s.population === population);
  if (files.length < 1) return { current: null, previous: null };
  const cur = loadSnapshot(files[0].file);
  let prev = null;
  for (let i = 1; i < files.length; i += 1) {
    const candidate = loadSnapshot(files[i].file);
    if (!candidate) continue;
    if (candidate.referenceDay === cur?.referenceDay) continue;
    prev = candidate;
    break;
  }
  if (prev && (prev.formulaVersion !== cur?.formulaVersion || prev.hs2aVersion !== cur?.hs2aVersion)) {
    return { current: cur, previous: null, warning: "versoes_incompativeis" };
  }
  return { current: cur, previous: prev };
}

export const RETENTION_POLICY = `
Retenção: até 120 snapshots no manifest (rotação local).
Integridade: manifest.json lista arquivos; não editar JSON manualmente.
Atualização: npm run monitoring:snapshot após carga BASE QV (somente leitura).
Ambiente: armazenamento local/gitignore — não usar filesystem efêmero de deploy serverless como fonte única.
PII: proibido — apenas clientRef estável m_*
`;
