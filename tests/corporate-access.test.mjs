import assert from "node:assert/strict";
import test from "node:test";
import {
  CORPORATE_EMAIL_DOMAIN,
  isAllowedCorporateEmail,
  isSensitiveDashboardRoute,
  shouldRequireCorporateAuth,
} from "../lib/api/corporate-access.mjs";

test("corporate email — domínio exato quartavia.com.br", () => {
  assert.equal(isAllowedCorporateEmail("user@quartavia.com.br"), true);
  assert.equal(isAllowedCorporateEmail("user@evilquartavia.com.br"), false);
  assert.equal(isAllowedCorporateEmail("user@gmail.com"), false);
  assert.equal(CORPORATE_EMAIL_DOMAIN, "quartavia.com.br");
});

test("rotas sensíveis incluem health-score e exports", () => {
  assert.equal(isSensitiveDashboardRoute("/api/health-score"), true);
  assert.equal(isSensitiveDashboardRoute("/api/health-score.csv"), true);
  assert.equal(isSensitiveDashboardRoute("/api/health"), false);
  assert.equal(isSensitiveDashboardRoute("/api/predictive-lab-reference"), false);
});

test("auth corporativo exige flag ou production com AUTH configurado", () => {
  const prev = { ...process.env };
  try {
    process.env.DASH_REQUIRE_CORPORATE_AUTH = "0";
    assert.equal(shouldRequireCorporateAuth(), false);
    process.env.DASH_REQUIRE_CORPORATE_AUTH = "1";
    assert.equal(shouldRequireCorporateAuth(), true);
  } finally {
    process.env = prev;
  }
});
