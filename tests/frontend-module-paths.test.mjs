import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

const IMPORT_RE =
  /(?:import\s+(?:[\w*{}\s,]+\s+from\s+)?|export\s+[\w*{}\s,]+\s+from\s+)["']([^"']+)["']/g;

function collectMjsFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (name === "node_modules") continue;
      collectMjsFiles(abs, acc);
      continue;
    }
    if (name.endsWith(".mjs") || name.endsWith(".js")) acc.push(abs);
  }
  return acc;
}

function importsIn(source) {
  const out = [];
  for (const m of source.matchAll(IMPORT_RE)) out.push(m[1]);
  return out;
}

function resolveBrowserImport(fromFile, spec) {
  if (spec.startsWith("/")) return join(DIST, spec.replace(/^\//, ""));
  const base = dirname(fromFile);
  return resolve(base, spec);
}

test("Frontend — lib/ sem imports ../../public/ (quebram na Vercel)", () => {
  const libFrontend = join(ROOT, "lib", "frontend");
  for (const file of collectMjsFiles(libFrontend)) {
    const src = readFileSync(file, "utf8");
    assert.doesNotMatch(
      src,
      /\.\.\/\.\.\/public\//,
      `${relative(ROOT, file)} ainda referencia ../../public/`,
    );
  }
});

test("Frontend — dist: imports resolvem para arquivos publicados", () => {
  execSync("node scripts/vercel-build.mjs", { cwd: ROOT, stdio: "pipe" });
  const files = collectMjsFiles(DIST);
  const offenders = [];

  for (const file of files) {
    const relFile = relative(DIST, file).replace(/\\/g, "/");
    for (const spec of importsIn(readFileSync(file, "utf8"))) {
      if (spec.startsWith("http:") || spec.startsWith("https:")) continue;
      if (spec.includes("/public/") || spec.startsWith("public/")) {
        offenders.push(`${relFile} → ${spec}`);
        continue;
      }
      if (spec.startsWith(".")) {
        const target = resolveBrowserImport(file, spec);
        if (!existsSync(target)) {
          offenders.push(`${relFile} → ${spec} (ausente: ${relative(DIST, target)})`);
        }
      }
      if (spec.startsWith("/")) {
        const target = join(DIST, spec.slice(1));
        if (!existsSync(target)) {
          offenders.push(`${relFile} → ${spec} (ausente em dist)`);
        }
      }
    }
  }

  assert.deepEqual(offenders, [], offenders.join("\n"));
});

test("Frontend — analytical-csv importa analytical-columns na raiz de dist", () => {
  if (!existsSync(join(DIST, "lib", "frontend", "analytical-csv.mjs"))) {
    execSync("node scripts/vercel-build.mjs", { cwd: ROOT, stdio: "pipe" });
  }
  const csv = readFileSync(join(DIST, "lib", "frontend", "analytical-csv.mjs"), "utf8");
  assert.match(csv, /from\s+["']\.\.\/\.\.\/analytical-columns\.mjs["']/);
  assert.ok(existsSync(join(DIST, "analytical-columns.mjs")));
});
