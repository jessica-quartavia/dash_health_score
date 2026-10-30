/**
 * Supabase Storage dedicado ao monitoramento (projeto autorizado separado da BASE QV).
 * Não cria bucket — apenas opera se já configurado e aprovado.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { artifactObjectKey } from "./storage-paths.mjs";

function config() {
  const url = process.env.MONITORING_SUPABASE_URL;
  const key = process.env.MONITORING_SUPABASE_SERVICE_KEY;
  const bucket = process.env.MONITORING_STORAGE_BUCKET;
  if (!url || !key || !bucket) return null;
  return { url: url.replace(/\/$/, ""), key, bucket };
}

function headers(key, extra = {}) {
  return { Authorization: `Bearer ${key}`, ...extra };
}

export function fileSha256(pathOrBuffer) {
  const buf = Buffer.isBuffer(pathOrBuffer) ? pathOrBuffer : readFileSync(pathOrBuffer);
  return createHash("sha256").update(buf).digest("hex");
}

export async function probeSupabaseStorage() {
  const cfg = config();
  if (!cfg) {
    return { configured: false, available: false, reason: "variaveis_ausentes" };
  }
  const host = new URL(cfg.url).hostname;
  const probeKey = artifactObjectKey({
    referenceDate: new Date(),
    type: "meta",
    fileName: `_probe_${Date.now()}.json`,
  });
  const body = JSON.stringify({ probe: true, at: new Date().toISOString() });
  const write = await storageUpload(cfg, probeKey, body, { upsert: true, contentType: "application/json" });
  if (!write.ok) {
    return {
      configured: true,
      available: false,
      host,
      bucket: cfg.bucket,
      write: false,
      read: false,
      error: write.error,
      status: write.status,
    };
  }
  const downloaded = await storageDownload(cfg, probeKey);
  const readOk = downloaded.ok && downloaded.body.includes('"probe":true');
  const hashOk = readOk && fileSha256(Buffer.from(downloaded.body)) === fileSha256(Buffer.from(body));
  return {
    configured: true,
    available: write.ok && readOk && hashOk,
    host,
    bucket: cfg.bucket,
    write: write.ok,
    read: readOk,
    integrityCheck: hashOk,
    privateBucketAssumed: true,
    probeKey,
  };
}

export async function storageUpload(cfg, objectKey, body, { upsert = false, contentType = "application/json" } = {}) {
  const target = `${cfg.url}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
  try {
    const res = await fetch(target, {
      method: "POST",
      headers: headers(cfg.key, {
        "Content-Type": contentType,
        ...(upsert ? { "x-upsert": "true" } : {}),
      }),
      body,
    });
    if (res.status === 409 || (res.status === 400 && !upsert)) {
      return { ok: false, status: res.status, error: "objeto_ja_existe", idempotent: true };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: text.slice(0, 180) };
    }
    return { ok: true, status: res.status, objectKey };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function storageDownload(cfg, objectKey) {
  const target = `${cfg.url}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
  try {
    const res = await fetch(target, { headers: headers(cfg.key) });
    if (!res.ok) return { ok: false, status: res.status };
    const body = await res.text();
    return { ok: true, body, sha256: fileSha256(Buffer.from(body)) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export async function uploadMonitoringFile(localPath, { type, fileName, referenceDate, force = false }) {
  const cfg = config();
  if (!cfg) return { ok: false, skipped: true, reason: "supabase_nao_configurado" };

  const objectKey = artifactObjectKey({ referenceDate, type, fileName });
  const buf = readFileSync(localPath);
  const sha256 = fileSha256(buf);

  if (!force) {
    const existing = await storageDownload(cfg, objectKey);
    if (existing.ok && existing.sha256 === sha256) {
      return { ok: true, skipped: true, reason: "idempotente_hash_igual", objectKey, sha256 };
    }
    if (existing.ok && existing.sha256 !== sha256) {
      return { ok: false, skipped: true, reason: "sobrescrita_bloqueada", objectKey };
    }
  }

  const up = await storageUpload(cfg, objectKey, buf, { upsert: force, contentType: "application/json" });
  if (!up.ok && up.idempotent) return { ok: true, skipped: true, reason: "objeto_ja_existe", objectKey, sha256 };
  if (!up.ok) return { ...up, objectKey, sha256 };

  const verify = await storageDownload(cfg, objectKey);
  if (!verify.ok || verify.sha256 !== sha256) {
    return { ok: false, error: "integridade_pos_upload_falhou", objectKey, sha256 };
  }
  return { ok: true, objectKey, sha256 };
}

export async function recoverMonitoringObject(objectKey) {
  const cfg = config();
  if (!cfg) return { ok: false, reason: "supabase_nao_configurado" };
  const downloaded = await storageDownload(cfg, objectKey);
  if (!downloaded.ok) return downloaded;
  return { ok: true, objectKey, sha256: downloaded.sha256, body: downloaded.body };
}
