#!/usr/bin/env node
/**
 * Build estático para Vercel: public + lib (ES modules do browser).
 * APIs permanecem em api/[...path].js (serverless) — não emitir Build Output API v3,
 * pois substitui o deploy e remove as funções /api/*.
 */
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, lstatSync, readdirSync } from "node:fs";
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
  if (!existsSync(join(root, "api", "[...path].js"))) {
    console.error("vercel-build: api/[...path].js ausente — rotas serverless não serão publicadas");
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

function inspectOutputDir(outDir) {
  const st = lstatSync(outDir);
  let fileCount = 0;
  let totalBytes = 0;
  let symlinkCount = 0;
  const sampleFiles = [];

  function walk(abs, relBase) {
    for (const name of readdirSync(abs)) {
      const absPath = join(abs, name);
      const relPath = relBase ? `${relBase}/${name}` : name;
      const lst = lstatSync(absPath);
      if (lst.isSymbolicLink()) {
        symlinkCount += 1;
        continue;
      }
      if (lst.isDirectory()) {
        walk(absPath, relPath);
        continue;
      }
      fileCount += 1;
      totalBytes += lst.size;
      if (sampleFiles.length < 20) sampleFiles.push(relPath);
    }
  }

  walk(outDir, "");

  return {
    path: resolve(outDir),
    isDirectory: st.isDirectory(),
    isSymlink: st.isSymbolicLink(),
    fileCount,
    symlinkCount,
    totalBytes,
    sampleFiles,
    indexHtml: existsSync(join(outDir, "index.html")),
  };
}

assertProjectRoot(PROJECT_ROOT);
rmSync(join(PROJECT_ROOT, ".vercel", "output"), { recursive: true, force: true });
buildStatic(OUT);

writeFileSync(
  join(OUT, ".vercel-build.json"),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      projectRoot: PROJECT_ROOT,
      cwd: process.cwd(),
      staticRoot: OUTPUT_NAME,
      serverlessEntry: "api/[...path].js",
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
requireIndexHtml(vercelOut, "cwd/dist (outputDirectory)");

const distReport = inspectOutputDir(vercelOut);

console.log(
  JSON.stringify({
    ok: true,
    output: OUTPUT_NAME,
    projectRoot: PROJECT_ROOT,
    cwd: process.cwd(),
    outProject: resolve(OUT),
    outVercel: resolve(vercelOut),
    mirrored: resolve(OUT) !== resolve(vercelOut),
    dist: distReport,
    note: "Sem .vercel/output/config.json — funções api/ devem ser implantadas pelo zero-config da Vercel.",
  }),
);
