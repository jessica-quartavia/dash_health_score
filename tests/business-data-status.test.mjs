import assert from "node:assert/strict";
import test from "node:test";
import { describeBusinessDataPersistence } from "../lib/monitoring/business-data-status.mjs";

test("Business Data desconectado", () => {
  const s = describeBusinessDataPersistence({ configured: false });
  assert.equal(s.state, "disconnected");
});

test("Business Data erro não vira lista vazia silenciosa", () => {
  const s = describeBusinessDataPersistence({ configured: true, ok: false, error: "401" });
  assert.equal(s.state, "error");
});

test("um snapshot válido — histórico em formação", () => {
  const s = describeBusinessDataPersistence({
    configured: true,
    ok: true,
    runs: [{ status: "success", snapshot_rows: 1578, reference_date: "2026-03-01" }],
    trend: [{ dia: "2026-03-01", clientes: 1578 }],
    lastValidRun: { referenceDate: "2026-03-01", snapshotRows: 1578 },
  });
  assert.equal(s.state, "single_snapshot");
});

test("github-actions meta não importa getMonitoringHistoryBundle", async () => {
  const src = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../lib/monitoring/github-actions-meta.mjs", import.meta.url), "utf8"),
  );
  assert.doesNotMatch(src, /getMonitoringHistoryBundle/);
});
