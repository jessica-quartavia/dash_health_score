import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Vercel — vercel.json usa Build Output API (sem outputDirectory conflitante)", () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  assert.equal(cfg.framework, null);
  assert.match(cfg.buildCommand, /npm run build/);
  assert.equal(cfg.outputDirectory, undefined);
  assert.equal(cfg.functions, undefined);
  assert.equal(cfg.rewrites, undefined);
});

test("Vercel — sem requirements.txt na raiz (detecção Python)", () => {
  assert.equal(existsSync(join(ROOT, "requirements.txt")), false);
  assert.equal(existsSync(join(ROOT, "pyproject.toml")), false);
  assert.equal(existsSync(join(ROOT, "research", "modeling", "requirements.txt")), false);
  assert.ok(existsSync(join(ROOT, "research", "modeling", "requirements-modeling.txt")));
});

test("Vercel — catch-all API e dispatch compartilhado", () => {
  assert.ok(existsSync(join(ROOT, "api", "[...path].js")));
  const api = readFileSync(join(ROOT, "api", "[...path].js"), "utf8");
  assert.match(api, /dispatchHttpApi/);
  const dispatch = readFileSync(join(ROOT, "lib", "api", "dispatch-http-api.mjs"), "utf8");
  assert.match(dispatch, /predictive-lab-reference/);
  assert.match(dispatch, /sendApiNotFound/);
});

test("Vercel — build produz dist e Build Output API v3 completa", async () => {
  const { execSync } = await import("node:child_process");
  execSync("node scripts/vercel-build.mjs", { cwd: ROOT, stdio: "pipe" });
  assert.ok(existsSync(join(ROOT, "dist", "index.html")));
  assert.ok(existsSync(join(ROOT, "dist", "app.js")));
  assert.ok(existsSync(join(ROOT, ".vercel", "output", "config.json")));
  assert.ok(existsSync(join(ROOT, ".vercel", "output", "static", "index.html")));
  assert.ok(existsSync(join(ROOT, ".vercel", "output", "functions", "api", "[...path].func", ".vc-config.json")));
  assert.ok(
    existsSync(join(ROOT, ".vercel", "output", "functions", "api", "[...path].func", "api", "[...path].js")),
  );
  const cfg = JSON.parse(readFileSync(join(ROOT, ".vercel", "output", "config.json"), "utf8"));
  assert.equal(cfg.version, 3);
  assert.ok(Array.isArray(cfg.routes));
});

test("Vercel — build espelha dist no cwd quando invocado fora da raiz (monorepo)", async () => {
  const { execSync } = await import("node:child_process");
  const parent = join(ROOT, "..");
  const script = join(ROOT, "scripts", "vercel-build.mjs");
  execSync(`node "${script}"`, { cwd: parent, stdio: "pipe", shell: true });
  assert.ok(existsSync(join(ROOT, "dist", "index.html")));
  assert.ok(existsSync(join(parent, "dist", "index.html")));
});

test("Vercel — .vercel/output não deve estar versionado no git", () => {
  const tracked = readFileSync(join(ROOT, ".gitignore"), "utf8");
  assert.match(tracked, /\.vercel\//);
});
