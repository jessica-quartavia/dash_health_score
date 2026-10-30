import assert from "node:assert/strict";
import test from "node:test";

const BASE =
  process.env.HA_PRODUCTION_BASE_URL?.replace(/\/$/, "") ||
  "https://dashhealthscore.vercel.app";

const MJS_MODULES = [
  "analytical-columns.mjs",
  "session-auth.mjs",
  "app.js",
  "lib/frontend/health-score-contract.mjs",
];

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: "follow" });
  const ct = res.headers.get("content-type") || "";
  const body = await res.text();
  return { status: res.status, ct, body };
}

test("Produção — módulos .mjs/.js não retornam HTML (MIME correto)", async () => {
  for (const file of MJS_MODULES) {
    const { status, ct, body } = await get(`/${file}`);
    assert.equal(status, 200, `${file} status`);
    assert.match(ct, /javascript/i, `${file} Content-Type`);
    assert.doesNotMatch(body.trimStart(), /^<!DOCTYPE/i, `${file} body is HTML`);
    assert.doesNotMatch(body.trimStart(), /^<html/i, `${file} body is HTML`);
  }
});

test("Produção — asset .mjs inexistente retorna 404, não index.html", async () => {
  const { status, ct, body } = await get("/__ha_missing_asset_test__.mjs");
  assert.equal(status, 404);
  assert.doesNotMatch(body.trimStart(), /^<!DOCTYPE/i);
  assert.doesNotMatch(ct, /text\/html/i);
});

test("Produção — APIs sensíveis retornam JSON, não HTML", async () => {
  const { status, ct, body } = await get("/api/health-score?cluster=ativos");
  assert.equal(status, 401);
  assert.match(ct, /json/i);
  assert.doesNotMatch(body.trimStart(), /^<!DOCTYPE/i);
  const parsed = JSON.parse(body);
  assert.equal(parsed.code, "AUTH_REQUIRED");
});

test("Produção — session-policy acessível", async () => {
  const { status, ct, body } = await get("/api/session-policy");
  assert.equal(status, 200);
  assert.match(ct, /json/i);
  const parsed = JSON.parse(body);
  assert.equal(parsed.requireAuth, true);
  assert.equal(parsed.domain, "quartavia.com.br");
});
