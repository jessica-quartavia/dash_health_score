import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("session-auth — política inconclusiva assume requireAuth true (safe-default)", () => {
  const src = readFileSync(join(ROOT, "public", "session-auth.mjs"), "utf8");
  assert.match(src, /requireAuth:\s*true[\s\S]*source:\s*"safe-default"/);
  assert.doesNotMatch(src, /source:\s*"fallback"[\s\S]*requireAuth:\s*false/);
});

test("app.js — research-panorama trata 401 com modal global", () => {
  const app = readFileSync(join(ROOT, "public", "app.js"), "utf8");
  assert.match(app, /reactToProtectedApiAuthFailure/);
  assert.match(app, /ensureResearchPanorama[\s\S]*authHeaders/);
  assert.match(app, /mustBlockUnauthenticatedAccess/);
});
