import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("index — layer fixo no body (sem dialog) e fora do shell", () => {
  const html = readFileSync(join(ROOT, "public", "index.html"), "utf8");
  const shellEnd = html.indexOf("</div>", html.indexOf('id="shell"'));
  const layerIdx = html.indexOf('id="authGateLayer"');
  assert.ok(layerIdx > shellEnd, "authGateLayer deve ficar após #shell");
  assert.match(html, /auth-gate-scrim/);
  assert.match(html, /auth-gate-center/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /Bem-vindo ao Health Analytics/);
  assert.doesNotMatch(html, /id="authModal"/);
  assert.doesNotMatch(html, /id="authOverlay"/);
  assert.doesNotMatch(html, /Acesso corporativo/);
});

test("styles — overlay viewport, blur no scrim, modal centralizado", () => {
  const css = readFileSync(join(ROOT, "public", "styles.css"), "utf8");
  assert.match(css, /\.auth-gate-layer[\s\S]*position:\s*fixed/);
  assert.match(css, /\.auth-gate-layer[\s\S]*place-items:\s*center/);
  assert.match(css, /\.auth-gate-scrim[\s\S]*backdrop-filter:\s*blur\(8px\)/);
  assert.match(css, /html\.auth-booting #view/);
  assert.match(css, /auth-scroll-lock/);
  assert.doesNotMatch(css, /\.shell\.auth-locked[\s\S]*filter:\s*blur/);
});

test("app.js — gate via authGateLayer, bloqueia APIs e Escape", () => {
  const app = readFileSync(join(ROOT, "public", "app.js"), "utf8");
  assert.match(app, /getElementById\("authGateLayer"\)/);
  assert.match(app, /authUIRequired/);
  assert.match(app, /clearProtectedUiState/);
  assert.match(app, /if \(authUIRequired\) return/);
  assert.match(app, /finishAuthBooting/);
  assert.doesNotMatch(app, /showModal\(\)/);
});

test("app.js — erros de auth na API não expõem fatal view com dados", () => {
  const app = readFileSync(join(ROOT, "public", "app.js"), "utf8");
  const authBlock = app.slice(app.indexOf("isAuthErrorCode(body.code)"), app.indexOf("isAuthErrorCode(body.code)") + 600);
  assert.match(authBlock, /reactToProtectedApiAuthFailure/);
  assert.doesNotMatch(authBlock, /renderFatalView/);
});
