import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("Vercel — vercel.json aponta build Node estático", () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  assert.equal(cfg.framework, null);
  assert.match(cfg.buildCommand, /npm run build/);
  assert.equal(cfg.outputDirectory, "dist");
  assert.equal(cfg.installCommand, undefined);
  const fn = cfg.functions?.["api/[...path].js"];
  const includes = fn?.includeFiles;
  assert.ok(Array.isArray(includes) ? includes.includes("lib/**") : String(includes).includes("lib"));
  assert.ok(
    Array.isArray(includes)
      ? includes.some((g) => g.includes("research/modeling/output"))
      : String(includes).includes("research/modeling/output"),
  );
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

test("Vercel — build produz dist com SPA e lib", async () => {
  const { execSync } = await import("node:child_process");
  execSync("node scripts/vercel-build.mjs", { cwd: ROOT, stdio: "pipe" });
  assert.ok(existsSync(join(ROOT, "dist", "index.html")));
  assert.ok(existsSync(join(ROOT, "dist", "app.js")));
  assert.ok(existsSync(join(ROOT, "dist", "lib", "http", "fetch-json.mjs")));
  assert.equal(existsSync(join(ROOT, ".vercel", "output", "config.json")), false);
});

test("Vercel — build espelha dist no cwd quando invocado fora da raiz (monorepo)", async () => {
  const { execSync } = await import("node:child_process");
  const parent = join(ROOT, "..");
  const script = join(ROOT, "scripts", "vercel-build.mjs");
  execSync(`node "${script}"`, { cwd: parent, stdio: "pipe", shell: true });
  assert.ok(existsSync(join(ROOT, "dist", "index.html")));
  assert.ok(existsSync(join(parent, "dist", "index.html")));
});

test("Vercel — rewrite SPA não captura /api", () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  const spa = cfg.rewrites?.find((r) => r.destination === "/index.html");
  assert.ok(spa?.source?.includes("api"));
  assert.ok(cfg.rewrites?.some((r) => String(r.source).startsWith("/api/")));
});

test("Vercel — .vercel/output não deve estar versionado (evita deploy estático-only)", () => {
  assert.equal(existsSync(join(ROOT, ".vercel", "output", "config.json")), false);
  const tracked = readFileSync(join(ROOT, ".gitignore"), "utf8");
  assert.match(tracked, /\.vercel\//);
});
