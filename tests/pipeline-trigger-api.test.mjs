import assert from "node:assert/strict";
import test from "node:test";
import { buildPipelineRunApiResponse } from "../lib/api/pipeline-run-response.mjs";

test("resposta API não inclui segredos e marca idempotência como sucesso", () => {
  const body = buildPipelineRunApiResponse({
    startedAt: "2026-10-29T12:00:00.000Z",
    finishedAt: "2026-10-29T12:00:30.000Z",
    result: {
      clientCount: 1578,
      run: { runId: "local-1", status: "success", referenceDay: "2026-10-29" },
      businessData: {
        ok: true,
        skipped: true,
        idempotent: true,
        runId: "0ce7b0d2-6432-4005-9794-e486d3dce5c9",
        snapshotRows: 1578,
      },
    },
  });
  assert.equal(body.ok, true);
  assert.equal(body.idempotent, true);
  assert.equal(body.persistenceOk, true);
  assert.equal(body.businessData.idempotent, true);
  assert.equal(body.clientCount, 1578);
  assert.equal(body.businessData.snapshotRows, 1578);
  assert.equal(JSON.stringify(body).includes("SERVICE_ROLE"), false);
  assert.equal(JSON.stringify(body).includes("Bearer"), false);
});
