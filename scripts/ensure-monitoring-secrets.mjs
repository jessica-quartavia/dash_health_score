/**
 * Gera HS_MONITORING_PSEUDONYM_SECRET e MONITORING_PIPELINE_TOKEN no .env local
 * se ainda não existirem. Não imprime valores nem envia ao n8n.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

const ENV_PATH = join(process.cwd(), ".env");
const KEYS = ["HS_MONITORING_PSEUDONYM_SECRET", "MONITORING_PIPELINE_TOKEN"];
const FLAGS = ["HS_MONITORING_PERSIST_BUSINESS_DATA"];

function parseEnv(text) {
  const map = new Map();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map.set(key, value);
  }
  return { lines, map };
}

function generateHexSecret() {
  return randomBytes(32).toString("hex");
}

function main() {
  if (!existsSync(ENV_PATH)) {
    console.error("Arquivo .env não encontrado. Copie .env.example para .env primeiro.");
    process.exitCode = 1;
    return;
  }

  const original = readFileSync(ENV_PATH, "utf8");
  const { lines, map } = parseEnv(original);
  const added = [];
  const preserved = [];

  for (const key of KEYS) {
    const current = (map.get(key) || "").trim();
    if (current) {
      preserved.push(key);
      continue;
    }
    map.set(key, generateHexSecret());
    added.push(key);
  }

  for (const key of FLAGS) {
    const current = (map.get(key) || "").trim();
    if (current) {
      preserved.push(key);
      continue;
    }
    map.set(key, "1");
    added.push(key);
  }

  if (!added.length) {
    console.log(`Nada a fazer — ${preserved.join(", ")} já definidos (valores não exibidos).`);
    return;
  }

  const existingKeys = new Set(map.keys());
  const out = [];
  const written = new Set();

  for (const line of lines) {
    const t = line.trim();
    const eq = t.indexOf("=");
    if (eq > 0 && [...KEYS, ...FLAGS].includes(t.slice(0, eq).trim())) {
      const key = t.slice(0, eq).trim();
      if (!written.has(key)) {
        out.push(`${key}=${map.get(key)}`);
        written.add(key);
      }
      continue;
    }
    out.push(line);
  }

  for (const key of [...KEYS, ...FLAGS]) {
    if (!written.has(key) && added.includes(key)) {
      out.push("");
      out.push(`# Gerado por ensure-monitoring-secrets.mjs — não alterar após snapshots reais (${key})`);
      out.push(`${key}=${map.get(key)}`);
      written.add(key);
    }
  }

  if (!map.get("BUSINESS_SUPABASE_URL") && map.get("AUTH_SUPABASE_URL")) {
    if (!out.some((l) => l.startsWith("BUSINESS_SUPABASE_URL="))) {
      out.push("");
      out.push("# Business Data (mesmo projeto que AUTH_SUPABASE_URL)");
      out.push(`BUSINESS_SUPABASE_URL=${map.get("AUTH_SUPABASE_URL")}`);
      added.push("BUSINESS_SUPABASE_URL (alias AUTH)");
    }
  }

  writeFileSync(ENV_PATH, out.join("\n").replace(/\n*$/, "\n"), "utf8");
  try {
    chmodSync(ENV_PATH, 0o600);
  } catch {
    /* Windows pode ignorar */
  }

  console.log(`Atualizado .env — chaves adicionadas: ${added.join(", ")}. Valores não exibidos.`);
  if (preserved.length) console.log(`Preservados: ${preserved.join(", ")}.`);
  console.log("Configure BUSINESS_SUPABASE_SERVICE_ROLE_KEY manualmente (Dashboard → API → service_role).");
}

main();
