#!/usr/bin/env node
/**
 * Build para Vercel:
 * - dist/ (espelho local / testes)
 * - Build Output API v3 (.vercel/output) — static + serverless, sem outputDirectory no vercel.json
 *
 * Evita STATIC_BUILD_NO_OUT_DIR: o static-build detecta config.json v3 e não valida dist/.
 * Evita deploy estático-only: functions/api/[...path].func inclui lib + artefatos JSON.
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
const BOA_ROOT = join(PROJECT_ROOT, ".vercel", "output");
const BOA_STATIC = join(BOA_ROOT, "static");
const BOA_FUNC = join(BOA_ROOT, "functions", "api", "[...path].func");
const API_ENTRY = join(PROJECT_ROOT, "api", "[...path].js");

function assertProjectRoot(root) {
  if (!existsSync(join(root, "package.json"))) {
    console.error("vercel-build: package.json não encontrado em", root);
    process.exit(1);
  }
  if (!existsSync(join(root, "public", "index.html"))) {
    console.error("vercel-build: public/index.html ausente — raiz do projeto incorreta?", root);
    process.exit(1);
  }
  if (!existsSync(API_ENTRY)) {
    console.error("vercel-build: api/[...path].js ausente");
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

function publishBuildOutputApi(distDir) {
  rmSync(BOA_ROOT, { recursive: true, force: true });
  mkdirSync(BOA_STATIC, { recursive: true });
  cpSync(distDir, BOA_STATIC, { recursive: true });

  mkdirSync(join(BOA_FUNC, "api"), { recursive: true });
  cpSync(API_ENTRY, join(BOA_FUNC, "api", "[...path].js"));
  cpSync(join(PROJECT_ROOT, "lib"), join(BOA_FUNC, "lib"), { recursive: true });

  const researchOut = join(PROJECT_ROOT, "research", "modeling", "output");
  if (existsSync(researchOut)) {
    const target = join(BOA_FUNC, "research", "modeling", "output");
    mkdirSync(target, { recursive: true });
    cpSync(researchOut, target, { recursive: true });
  }

  writeFileSync(join(BOA_FUNC, "package.json"), `${JSON.stringify({ type: "module" })}\n`);
  writeFileSync(
    join(BOA_FUNC, ".vc-config.json"),
    `${JSON.stringify(
      {
        runtime: "nodejs20.x",
        handler: "api/[...path].js",
        launcherType: "Nodejs",
        shouldAddHelpers: true,
        maxDuration: 60,
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    join(BOA_ROOT, "config.json"),
    `${JSON.stringify(
      {
        version: 3,
        routes: [
          { handle: "filesystem" },
          {
            src: "/((?!api/).*)",
            dest: "/index.html",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
}

function validateBuildOutputApi() {
  requireIndexHtml(BOA_STATIC, ".vercel/output/static");
  if (!existsSync(join(BOA_ROOT, "config.json"))) {
    console.error("vercel-build: .vercel/output/config.json ausente");
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync(join(BOA_ROOT, "config.json"), "utf8"));
  if (cfg.version !== 3) {
    console.error("vercel-build: config.json version !== 3");
    process.exit(1);
  }
  if (!existsSync(join(BOA_FUNC, ".vc-config.json"))) {
    console.error("vercel-build: função api/[...path].func sem .vc-config.json");
    process.exit(1);
  }
  if (!existsSync(join(BOA_FUNC, "api", "[...path].js"))) {
    console.error("vercel-build: handler api/[...path].js ausente no bundle da função");
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
      deployMode: "build-output-api-v3",
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
requireIndexHtml(vercelOut, "cwd/dist");

publishBuildOutputApi(OUT);
validateBuildOutputApi();

const distReport = inspectOutputDir(vercelOut);
const boaStaticReport = inspectOutputDir(BOA_STATIC);

console.log(
  JSON.stringify({
    ok: true,
    deployMode: "build-output-api-v3",
    projectRoot: PROJECT_ROOT,
    cwd: process.cwd(),
    outProject: resolve(OUT),
    outVercel: resolve(vercelOut),
    buildOutputApi: {
      config: join(BOA_ROOT, "config.json"),
      static: resolve(BOA_STATIC),
      function: resolve(BOA_FUNC),
      configVersion: 3,
    },
    dist: distReport,
    buildOutputStatic: boaStaticReport,
    note: "vercel.json sem outputDirectory — publicação via .vercel/output (static + functions).",
  }),
);
