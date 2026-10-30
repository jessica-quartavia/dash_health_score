import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthPhase,
  canFetchProtectedData,
  phaseFromBootSession,
  phaseFromApiAuthCode,
  phaseRequiresAuthGate,
  statusLineForPhase,
} from "../lib/frontend/corporate-auth-phase.mjs";

test("auth phase — gate obrigatório exceto authorized", () => {
  assert.equal(phaseRequiresAuthGate(AuthPhase.CHECKING), true);
  assert.equal(phaseRequiresAuthGate(AuthPhase.UNAUTHENTICATED), true);
  assert.equal(phaseRequiresAuthGate(AuthPhase.UNAUTHORIZED_DOMAIN), true);
  assert.equal(phaseRequiresAuthGate(AuthPhase.AUTHORIZED), false);
});

test("auth phase — fetch protegido só quando authorized", () => {
  assert.equal(canFetchProtectedData(AuthPhase.CHECKING), false);
  assert.equal(canFetchProtectedData(AuthPhase.UNAUTHENTICATED), false);
  assert.equal(canFetchProtectedData(AuthPhase.AUTHORIZED), true);
  assert.equal(canFetchProtectedData(AuthPhase.UNAUTHENTICATED, { corporateAuthRequired: false }), true);
});

test("auth phase — boot mapeia sessão e domínio", () => {
  assert.equal(
    phaseFromBootSession({ corporateAuthRequired: true, session: { access_token: "x" } }),
    AuthPhase.AUTHORIZED,
  );
  assert.equal(
    phaseFromBootSession({ corporateAuthRequired: true, session: null, authError: { code: "AUTH_DOMAIN" } }),
    AuthPhase.UNAUTHORIZED_DOMAIN,
  );
  assert.equal(
    phaseFromBootSession({ corporateAuthRequired: true, session: null }),
    AuthPhase.UNAUTHENTICATED,
  );
  assert.equal(phaseFromBootSession({ corporateAuthRequired: false, session: null }), AuthPhase.AUTHORIZED);
});

test("auth phase — API 401 mapeia fase", () => {
  assert.equal(phaseFromApiAuthCode("AUTH_DOMAIN"), AuthPhase.UNAUTHORIZED_DOMAIN);
  assert.equal(phaseFromApiAuthCode("AUTH_REQUIRED"), AuthPhase.UNAUTHENTICATED);
  assert.equal(phaseFromApiAuthCode("DATA_CONFIG"), null);
});

test("auth phase — mensagens de status", () => {
  assert.match(statusLineForPhase(AuthPhase.CHECKING), /Verificando/i);
  assert.match(statusLineForPhase(AuthPhase.UNAUTHORIZED_DOMAIN), /Domínio/i);
});
