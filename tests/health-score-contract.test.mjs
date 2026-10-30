import assert from "node:assert/strict";
import test from "node:test";
import { validateHealthScorePayload } from "../lib/frontend/health-score-contract.mjs";

test("health-score contract — payload mínimo válido", () => {
  const body = {
    clients: [{ clientId: 1 }],
    summary: { totalClients: 1 },
    metadata: { generatedAt: "2026-01-01T00:00:00.000Z" },
    filters: {
      options: {
        cluster: [{ value: "ativos", label: "Ativos" }],
        ep: [{ value: "all", label: "Todos" }],
        program: [{ value: "all", label: "Todos" }],
        finalClass: [{ value: "all", label: "Todos" }],
      },
    },
  };
  const result = validateHealthScorePayload(body);
  assert.equal(result.ok, true);
});

test("health-score contract — falha sem clients", () => {
  const result = validateHealthScorePayload({ summary: {}, metadata: {}, filters: { options: {} } });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("clients")));
});
