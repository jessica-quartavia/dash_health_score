/**
 * Simula chamada n8n ao POST /api/monitoring/pipeline/run (localhost).
 * Não imprime tokens. Exit 0 se ok ou idempotente.
 */
import { loadProjectEnv } from "../lib/load-env.mjs";

loadProjectEnv();

const port = process.env.PORT || "3010";
const token = process.env.MONITORING_PIPELINE_TOKEN?.trim();
if (!token) {
  console.error("MONITORING_PIPELINE_TOKEN ausente.");
  process.exitCode = 2;
  process.exit();
}

const url = `http://127.0.0.1:${port}/api/monitoring/pipeline/run`;
const executionId = `local-test-${Date.now()}`;

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-N8N-Execution-Id": executionId,
  },
  body: JSON.stringify({ persistBusinessData: true }),
});

const body = await res.json().catch(() => ({}));
const safe = {
  httpStatus: res.status,
  ok: body.ok,
  idempotent: body.idempotent,
  persistenceOk: body.persistenceOk,
  clientCount: body.clientCount,
  snapshotRows: body.businessData?.snapshotRows,
  runId: body.businessData?.runId,
  error: body.error,
};

console.log(JSON.stringify(safe, null, 2));

if (!res.ok || !body.ok) process.exitCode = 1;
else if (body.persistenceOk === false) process.exitCode = 1;
