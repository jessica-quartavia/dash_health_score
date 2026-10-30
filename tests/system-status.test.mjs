import assert from "node:assert/strict";
import test from "node:test";
import { buildSystemStatus } from "../lib/platform/system-status.mjs";

test("system status distingue BD persistido vs só local", () => {
  const withBd = buildSystemStatus({
    baseQv: { ready: true },
    businessData: { configured: true, ok: true, validRuns: 2, lastReference: "2026-10-29" },
  });
  assert.ok(withBd.items.some((i) => i.title.includes("Persistência confirmada")));
  const noBd = buildSystemStatus({
    baseQv: { ready: true },
    businessData: { configured: false },
  });
  assert.ok(noBd.items.some((i) => i.kind === "persistencia" && i.level === "attention"));
});

test("não marca automação GHA ativa sem schedule.active", () => {
  const s = buildSystemStatus({
    automation: { githubActions: { workflow: {}, schedule: { active: false }, message: "cron comentado" } },
  });
  assert.ok(s.items.some((i) => i.level === "attention" && i.title.includes("Automação")));
});
