import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Espelha vercel.json — SPA só quando path não é /api/* nem arquivo com extensão. */
function spaFallbackMatches(pathname) {
  const re = /^\/((?!api(?:\/|$))(?!.*\.[a-zA-Z0-9]+(?:\?.*)?$).*)$/;
  return re.test(pathname);
}

test("Vercel — deploy tradicional: outputDirectory dist + api catch-all", () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  assert.equal(cfg.framework, null);
  assert.match(cfg.buildCommand, /npm run build/);
  assert.equal(cfg.outputDirectory, "dist");
  const fn = cfg.functions?.["api/[...path].js"];
  assert.equal(typeof fn?.includeFiles, "string");
  assert.match(fn.includeFiles, /lib/);
  assert.match(fn.includeFiles, /research\/modeling\/output/);
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

test("Vercel — build produz dist e NÃO gera Build Output API", async () => {
  const { execSync } = await import("node:child_process");
  execSync("node scripts/vercel-build.mjs", { cwd: ROOT, stdio: "pipe" });
  assert.ok(existsSync(join(ROOT, "dist", "index.html")));
  assert.ok(existsSync(join(ROOT, "dist", "app.js")));
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

test("Vercel — rewrite SPA não captura /api (sem rewrite identidade em /api)", () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  const spa = cfg.rewrites?.find((r) => r.destination === "/index.html");
  assert.ok(spa?.source?.includes("api"));
  assert.match(spa?.source || "", /\\\.\[a-zA-Z0-9\]/);
  const apiIdentity = cfg.rewrites?.some(
    (r) => String(r.source).startsWith("/api/") && String(r.destination).startsWith("/api/"),
  );
  assert.equal(apiIdentity, false);
});

test("Vercel — fallback SPA não captura assets .mjs/.js/.css", () => {
  assert.equal(spaFallbackMatches("/analytical-columns.mjs"), false);
  assert.equal(spaFallbackMatches("/app.js"), false);
  assert.equal(spaFallbackMatches("/lib/frontend/hs-weight.mjs"), false);
  assert.equal(spaFallbackMatches("/styles.css"), false);
  assert.equal(spaFallbackMatches("/api/health"), false);
  assert.equal(spaFallbackMatches("/"), true);
  assert.equal(spaFallbackMatches("/visao-geral"), true);
});

test("Vercel — dist contém módulos .mjs do frontend referenciados por app.js", () => {
  const app = readFileSync(join(ROOT, "public", "app.js"), "utf8");
  const relativeImports = [...app.matchAll(/from\s+["']\.\/([^"']+\.mjs)["']/g)].map((m) => m[1]);
  for (const file of relativeImports) {
    assert.ok(
      existsSync(join(ROOT, "dist", file)),
      `dist/${file} ausente — build não copiou public/`,
    );
  }
  assert.ok(existsSync(join(ROOT, "dist", "analytical-columns.mjs")));
  const publicMjs = readdirSync(join(ROOT, "public")).filter((f) => f.endsWith(".mjs"));
  for (const file of publicMjs) {
    assert.ok(existsSync(join(ROOT, "dist", file)), `dist/${file}`);
  }
});

test("Vercel — headers Content-Type para .mjs e .js", () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, "vercel.json"), "utf8"));
  const mjs = cfg.headers?.find((h) => h.source?.includes(".mjs"));
  const js = cfg.headers?.find((h) => h.source?.includes(".js") && !h.source?.includes(".mjs"));
  assert.match(mjs?.headers?.find((x) => x.key === "Content-Type")?.value || "", /javascript/i);
  assert.match(js?.headers?.find((x) => x.key === "Content-Type")?.value || "", /javascript/i);
});

test("Vercel — rotas de sessão em segmento único (session-policy)", () => {
  const dispatch = readFileSync(join(ROOT, "lib", "api", "dispatch-http-api.mjs"), "utf8");
  assert.match(dispatch, /\/api\/session-policy/);
  assert.match(dispatch, /\/api\/session-config/);
  assert.match(dispatch, /\/api\/session-me/);
  assert.doesNotMatch(dispatch, /path === "\/api\/auth\/policy"/);
});

test("Vercel — resolveApiPathFromRequest usa req.url quando query.path vazio", async () => {
  const { resolveApiPathFromRequest } = await import("../lib/api/dispatch-http-api.mjs");
  assert.equal(
    resolveApiPathFromRequest({ url: "/api/health?x=1", query: {} }),
    "/api/health",
  );
  assert.equal(
    resolveApiPathFromRequest({ url: "/api/predictive-lab-reference", query: {} }),
    "/api/predictive-lab-reference",
  );
  assert.equal(
    resolveApiPathFromRequest({ url: "/api/health-score", query: { path: ["health-score"] } }),
    "/api/health-score",
  );
});
