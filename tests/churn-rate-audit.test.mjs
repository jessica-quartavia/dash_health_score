import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChurnRateAudit } from "../lib/research/churn-rate-audit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("taxa ~30,6% é prevalência por linha cliente-mês", () => {
  const preAudit = JSON.parse(
    readFileSync(join(ROOT, "research", "modeling", "output", "pre_audit.json"), "utf8"),
  );
  const audit = buildChurnRateAudit(preAudit, null);
  assert.equal(audit.ok, true);
  const m = audit.measures;
  const expected = m.positiveRows / m.labeledRows;
  assert.ok(Math.abs(m.rateByObservationClientMonth - expected) < 0.0001);
  assert.ok(m.rateByObservationClientMonth > 0.3 && m.rateByObservationClientMonth < 0.32);
  assert.ok(m.rateByUniqueClientWithOutcome > m.rateByObservationClientMonth);
  assert.ok(audit.confirmed.some((t) => t.includes("cliente-mês")));
});

test("hold-out teste tem prevalência menor que taxa global agregada", () => {
  const preAudit = JSON.parse(
    readFileSync(join(ROOT, "research", "modeling", "output", "pre_audit.json"), "utf8"),
  );
  const modeling = JSON.parse(
    readFileSync(join(ROOT, "research", "modeling", "output", "modeling_results_etapa4.json"), "utf8"),
  );
  const audit = buildChurnRateAudit(preAudit, modeling);
  assert.ok(audit.measures.prevalenceTestHoldout < audit.measures.rateByObservationClientMonth);
});
