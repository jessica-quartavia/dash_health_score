/**
 * Carrega .env da raiz do projeto sem substituir variáveis já definidas
 * pelo ambiente (shell, Vercel ou testes).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_KEYS = ["DATA_SUPABASE_URL", "DATA_SUPABASE_SERVICE_ROLE_KEY"];

function parseEnvFile(filePath) {
  const text = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const parsed = {};
  for (const line of text.split(/\r?\n/)) {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("export ")) trimmed = trimmed.slice(7).trim();
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function applyParsed(parsed, protectedKeys) {
  for (const [key, value] of Object.entries(parsed)) {
    if (protectedKeys.has(key)) continue;
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
    protectedKeys.add(key);
  }
}

function loadFile(filePath, protectedKeys) {
  const before = new Map([...protectedKeys].map((key) => [key, process.env[key]]));
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(filePath);
    for (const [key, value] of before) process.env[key] = value;
    for (const key of Object.keys(process.env)) protectedKeys.add(key);
    return;
  }
  applyParsed(parseEnvFile(filePath), protectedKeys);
}

export function envPresence(env = process.env) {
  const presence = {};
  for (const key of REQUIRED_KEYS) {
    presence[key] = String(env[key] || "").trim() ? "presente" : "ausente";
  }
  return presence;
}

export function loadProjectEnv() {
  const envFile = join(PROJECT_ROOT, ".env");
  const localFile = join(PROJECT_ROOT, ".env.local");
  const bareEnvFile = existsSync(join(PROJECT_ROOT, "env"));
  const protectedKeys = new Set(Object.keys(process.env));
  const loaded = [];
  let invalidFile = null;

  for (const filePath of [localFile, envFile]) {
    if (!existsSync(filePath)) continue;
    try {
      loadFile(filePath, protectedKeys);
      loaded.push(filePath.endsWith(".env.local") ? ".env.local" : ".env");
    } catch {
      invalidFile = filePath.endsWith(".env.local") ? ".env.local" : ".env";
    }
  }

  return {
    envFile: existsSync(envFile) ? "presente" : "ausente",
    localFile: existsSync(localFile) ? "presente" : "ausente",
    bareEnvFile,
    invalidFile,
    loaded,
    presence: envPresence(),
  };
}

export function describeEnvStatus(report = loadProjectEnv()) {
  const url = report.presence.DATA_SUPABASE_URL;
  const key = report.presence.DATA_SUPABASE_SERVICE_ROLE_KEY;
  const parts = [
    `DATA_SUPABASE_URL ${url}`,
    `DATA_SUPABASE_SERVICE_ROLE_KEY ${key}`,
    `arquivo .env ${report.envFile}`,
  ];
  if (report.invalidFile) parts.push(`arquivo ${report.invalidFile} ilegível`);
  if (report.bareEnvFile && report.envFile === "ausente") {
    parts.push("há um arquivo chamado env sem ponto; o nome esperado é .env");
  }
  const ready = url === "presente" && key === "presente" && !report.invalidFile;
  return {
    ready,
    line: ready ? `BASE QV: configurada — ${parts.join("; ")}` : `BASE QV: incompleta — ${parts.join("; ")}`,
  };
}
