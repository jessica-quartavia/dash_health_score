import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("index — modal corporativo (dialog) em vez de card isolado no main", () => {
  const html = readFileSync(join(ROOT, "public", "index.html"), "utf8");
  assert.match(html, /id="authModal"/);
  assert.match(html, /id="authOverlay"/);
  assert.match(html, /primeCorporateAuthModal/);
  assert.match(html, /Bem-vindo ao Health Analytics/);
  assert.match(html, /Entrar com Google/);
  assert.match(html, /conta corporativa/);
  assert.match(html, /aria-modal="true"/);
  assert.doesNotMatch(html, /Acesso corporativo/);
  assert.doesNotMatch(html, /id="authGate"/);
});

test("styles — modal, overlay e estado auth-locked", () => {
  const css = readFileSync(join(ROOT, "public", "styles.css"), "utf8");
  assert.match(css, /\.auth-overlay/);
  assert.match(css, /html\.auth-pending \.shell/);
  assert.match(css, /\.shell\.auth-locked/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /460px/);
  assert.match(css, /\.btn-google/);
});

test("app.js — gate usa modal, bloqueia Escape e mensagens por código", () => {
  const app = readFileSync(join(ROOT, "public", "app.js"), "utf8");
  assert.match(app, /getElementById\("authModal"\)/);
  assert.match(app, /showModal\(\)/);
  assert.match(app, /setAuthLocked/);
  assert.match(app, /clearProtectedUiState/);
  assert.match(app, /primeAuthGateIfNeeded/);
  assert.match(app, /setAttribute\("inert"/);
  assert.match(app, /formatAuthUserMessage/);
  assert.match(app, /AUTH_DOMAIN/);
  assert.match(app, /event\.preventDefault\(\)/);
  assert.match(app, /setAuthLoginLoading/);
  assert.doesNotMatch(app, /getElementById\("authGate"\)/);
});

test("app.js — erros de auth na API não expõem fatal view com dados", () => {
  const app = readFileSync(join(ROOT, "public", "app.js"), "utf8");
  const authBlock = app.slice(app.indexOf("isAuthErrorCode(body.code)"), app.indexOf("isAuthErrorCode(body.code)") + 600);
  assert.match(authBlock, /showAuthGate/);
  assert.doesNotMatch(authBlock, /renderFatalView/);
});
