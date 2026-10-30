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
  assert.match(cfg.installCommand, /npm install/);
  assert.ok(cfg.functions?.["api/**/*.js"]?.includeFiles?.includes("research/modeling/output"));
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
});

test("Vercel — build espelha dist no cwd quando invocado fora da raiz (monorepo)", async () => {
  const { execSync } = await import("node:child_process");
  const parent = join(ROOT, "..");
  const script = join(ROOT, "scripts", "vercel-build.mjs");
  execSync(`node "${script}"`, { cwd: parent, stdio: "pipe", shell: true });
  assert.ok(existsSync(join(ROOT, "dist", "index.html")));
  assert.ok(existsSync(join(parent, "dist", "index.html")));
});

test("Vercel — rewrite SPA não menciona api no destino index", () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  const rw = cfg.rewrites?.[0];
  assert.ok(rw?.source?.includes("api"));
  assert.equal(rw?.destination, "/index.html");
});
