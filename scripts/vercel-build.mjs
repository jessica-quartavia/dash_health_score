#!/usr/bin/env node
/**
 * Deploy tradicional Vercel: gera outputDirectory `dist/` (public + lib browser).
 * APIs: zero-config em api/[...path].js (vercel.json → functions.includeFiles).
 *
 * Não gera `.vercel/output` — misturar BOA v3 com outputDirectory causa validação
 * errada (ex.: STATIC_BUILD_NO_OUT_DIR pedindo `public` quando outputDirectory
 * está ausente no vercel.json).
 */
import {
  cpSync,
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
  lstatSync,
  readdirSync,
} from "node:fs";
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

function removeBuildOutputApiArtifacts() {
  rmSync(join(PROJECT_ROOT, ".vercel", "output"), { recursive: true, force: true });
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

  function walk(abs) {
    for (const name of readdirSync(abs)) {
      const absPath = join(abs, name);
      const lst = lstatSync(absPath);
      if (lst.isSymbolicLink()) {
        symlinkCount += 1;
        continue;
      }
      if (lst.isDirectory()) {
        walk(absPath);
        continue;
      }
      fileCount += 1;
      totalBytes += lst.size;
    }
  }

  walk(outDir);

  return {
    path: resolve(outDir),
    isDirectory: st.isDirectory(),
    isSymlink: st.isSymbolicLink(),
    fileCount,
    symlinkCount,
    totalBytes,
    indexHtml: existsSync(join(outDir, "index.html")),
  };
}

assertProjectRoot(PROJECT_ROOT);
removeBuildOutputApiArtifacts();
buildStatic(OUT);

const buildId = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const indexPath = join(OUT, "index.html");
writeFileSync(
  indexPath,
  readFileSync(indexPath, "utf8").replaceAll("__HA_BUILD_ID__", buildId),
  "utf8",
);
writeFileSync(join(OUT, "build-id.txt"), `${buildId}\n`, "utf8");

writeFileSync(
  join(OUT, ".vercel-build.json"),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      projectRoot: PROJECT_ROOT,
      cwd: process.cwd(),
      deployMode: "traditional-outputDirectory-dist",
      outputDirectory: OUTPUT_NAME,
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

removeBuildOutputApiArtifacts();

const distReport = inspectOutputDir(vercelOut);

console.log(
  JSON.stringify({
    ok: true,
    deployMode: "traditional-outputDirectory-dist",
    outputDirectory: OUTPUT_NAME,
    projectRoot: PROJECT_ROOT,
    cwd: process.cwd(),
    outProject: resolve(OUT),
    outVercel: resolve(vercelOut),
    buildOutputApi: null,
    dist: distReport,
  }),
);
