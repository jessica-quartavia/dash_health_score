#!/usr/bin/env node
/**
 * Build estático para Vercel: public + lib (ES modules do browser).
 * Não executa Python nem treinamento de modelos.
 */
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "dist");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

cpSync(join(ROOT, "public"), OUT, { recursive: true });
mkdirSync(join(OUT, "lib"), { recursive: true });
cpSync(join(ROOT, "lib"), join(OUT, "lib"), { recursive: true });

const marker = join(OUT, ".vercel-build.json");
const payload = {
  builtAt: new Date().toISOString(),
  staticRoot: "dist",
  note: "APIs via /api/* serverless; artefatos JSON em research/modeling/output no bundle da função.",
};
writeFileSync(marker, JSON.stringify(payload, null, 2));

if (!existsSync(join(OUT, "index.html"))) {
  console.error("vercel-build: index.html ausente em dist/");
  process.exit(1);
}
if (!existsSync(join(OUT, "lib", "http", "fetch-json.mjs"))) {
  console.error("vercel-build: lib/http/fetch-json.mjs não copiado");
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, output: "dist", files: ["public→dist", "lib→dist/lib"] }));
