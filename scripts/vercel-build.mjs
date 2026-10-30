#!/usr/bin/env node
/**
 * Build estático para Vercel: public + lib (ES modules do browser).
 * Emite dist/ (outputDirectory) e Build Output API v3 (.vercel/output).
 */
import {
  cpSync,
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  lstatSync,
  readdirSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(SCRIPT_DIR, "..");
const OUTPUT_NAME = "dist";
const OUT = join(PROJECT_ROOT, OUTPUT_NAME);
const BOA_ROOT = join(PROJECT_ROOT, ".vercel", "output");
const BOA_STATIC = join(BOA_ROOT, "static");
const BOA_CONFIG = join(BOA_ROOT, "config.json");

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

function inspectOutputDir(outDir) {
  const st = lstatSync(outDir);
  const entries = [];
  let fileCount = 0;
  let totalBytes = 0;
  let symlinkCount = 0;

  function walk(abs, relBase) {
    for (const name of readdirSync(abs)) {
      const absPath = join(abs, name);
      const relPath = relBase ? `${relBase}/${name}` : name;
      const lst = lstatSync(absPath);
      if (lst.isSymbolicLink()) {
        symlinkCount += 1;
        entries.push({ path: relPath, kind: "symlink" });
        continue;
      }
      if (lst.isDirectory()) {
        walk(absPath, relPath);
        continue;
      }
      fileCount += 1;
      totalBytes += lst.size;
      if (entries.length < 40) {
        entries.push({ path: relPath, kind: "file", bytes: lst.size });
      }
    }
  }

  walk(outDir, "");

  return {
    path: resolve(outDir),
    exists: true,
    isDirectory: st.isDirectory(),
    isSymlink: st.isSymbolicLink(),
    fileCount,
    symlinkCount,
    totalBytes,
    sampleFiles: entries,
    indexHtml: existsSync(join(outDir, "index.html")),
  };
}

function publishBuildOutputApi(distDir) {
  rmSync(BOA_STATIC, { recursive: true, force: true });
  mkdirSync(BOA_STATIC, { recursive: true });
  cpSync(distDir, BOA_STATIC, { recursive: true });
  writeFileSync(BOA_CONFIG, `${JSON.stringify({ version: 3 }, null, 2)}\n`);
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

publishBuildOutputApi(OUT);
requireIndexHtml(BOA_STATIC, ".vercel/output/static");

const distReport = inspectOutputDir(vercelOut);
const boaReport = inspectOutputDir(BOA_STATIC);

console.log(
  JSON.stringify({
    ok: true,
    output: OUTPUT_NAME,
    projectRoot: PROJECT_ROOT,
    cwd: process.cwd(),
    outProject: resolve(OUT),
    outVercel: resolve(vercelOut),
    buildOutputApi: {
      config: resolve(BOA_CONFIG),
      static: resolve(BOA_STATIC),
      configExists: existsSync(BOA_CONFIG),
    },
    mirrored: resolve(OUT) !== resolve(vercelOut),
    dist: distReport,
    buildOutputStatic: boaReport,
  }),
);
