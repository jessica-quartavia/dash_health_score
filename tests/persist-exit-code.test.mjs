import assert from "node:assert/strict";
import test from "node:test";
import { businessDataPersistExitCode } from "../lib/monitoring/persist-exit-code.mjs";

test("exit 0 quando idempotente ou gravado", () => {
  assert.equal(businessDataPersistExitCode({ ok: true, idempotent: true, skipped: true }), 0);
  assert.equal(businessDataPersistExitCode({ ok: true, skipped: false }), 0);
});

test("exit 1 quando BD ausente ou mal configurado", () => {
  assert.equal(businessDataPersistExitCode(null), 1);
  assert.equal(businessDataPersistExitCode({ ok: false }), 1);
  assert.equal(businessDataPersistExitCode({ skipped: true, reason: "BUSINESS_DATA_NOT_CONFIGURED" }), 1);
  assert.equal(businessDataPersistExitCode({ skipped: true, ok: true }), 1);
});
