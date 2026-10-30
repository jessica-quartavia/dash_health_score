#!/usr/bin/env node
/**
 * Build estático para Vercel: public + lib (ES modules do browser).
 * Não executa Python nem treinamento de modelos.
 *
 * Caminhos sempre a partir da raiz do app (package.json ao lado de public/),
 * não do process.cwd() — e espelha dist/ no cwd quando a Vercel valida o output
 * a partir do Root Directory do painel (monorepo / build invocado na pasta pai).
 */
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SCRIPT_DIR, "..");
const OUTPUT_NAME = "dist";
const OUT = join(PROJECT_ROOT, OUTPUT_NAME);

function assertProjectRoot(root) {
  if (!existsSync(join(root, "package.json"))) {
    console.error("vercel-build: package.json não encontrado em", root);
    process.exit(1);
  }
  if (!existsSync(join(root, "public", "index.html"))) {
    console.error("vercel-build: public/index.html ausente — raiz do projeto incorreta?", root);
    process.exit(1);
  }
}

function buildStatic(outDir) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(join(PROJECT_ROOT, "public"), outDir, { recursive: true });
  mkdirSync(join(outDir, "lib"), { recursive: true });
  cpSync(join(PROJECT_ROOT, "lib"), join(outDir, "lib"), { recursive: true });
}

function mirrorDistToCwd(projectOutDir) {
  const cwdOut = join(process.cwd(), OUTPUT_NAME);
  if (resolve(projectOutDir) === resolve(cwdOut)) return cwdOut;
  rmSync(cwdOut, { recursive: true, force: true });
  mkdirSync(cwdOut, { recursive: true });
  cpSync(projectOutDir, cwdOut, { recursive: true });
  return cwdOut;
}

function requireIndexHtml(outDir, label) {
  const indexPath = join(outDir, "index.html");
  if (!existsSync(indexPath)) {
    console.error(`vercel-build: index.html ausente em ${label}: ${indexPath}`);
    process.exit(1);
  }
}

assertProjectRoot(PROJECT_ROOT);
buildStatic(OUT);

writeFileSync(
  join(OUT, ".vercel-build.json"),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      projectRoot: PROJECT_ROOT,
      cwd: process.cwd(),
      staticRoot: OUTPUT_NAME,
      note: "APIs via /api/* serverless; artefatos JSON em research/modeling/output no bundle da função.",
    },
    null,
    2,
  ),
);

requireIndexHtml(OUT, "projectRoot/dist");
if (!existsSync(join(OUT, "lib", "http", "fetch-json.mjs"))) {
  console.error("vercel-build: lib/http/fetch-json.mjs não copiado");
  process.exit(1);
}

const vercelOut = mirrorDistToCwd(OUT);
requireIndexHtml(vercelOut, "cwd/dist (validação Vercel outputDirectory)");

console.log(
  JSON.stringify({
    ok: true,
    output: OUTPUT_NAME,
    projectRoot: PROJECT_ROOT,
    cwd: process.cwd(),
    outProject: OUT,
    outVercel: vercelOut,
    mirrored: resolve(OUT) !== resolve(vercelOut),
    files: ["public→dist", "lib→dist/lib"],
  }),
);
