/**
 * Pós-pipeline (CI): confere última run success no Business Data. Não imprime segredos.
 */
import { loadProjectEnv } from "../lib/load-env.mjs";
import { listPersistedRuns } from "../lib/monitoring/business-data-read.mjs";

loadProjectEnv();

const res = await listPersistedRuns({ limit: 1 });
if (!res.ok) {
  console.error("Business Data indisponível para verificação.");
  process.exit(1);
}

const run = res.runs?.[0];
if (!run) {
  console.error("Nenhuma pipeline_runs success encontrada.");
  process.exit(1);
}

const clients = run.client_count ?? 0;
const snaps = run.snapshot_rows ?? 0;
if (run.status !== "success") {
  console.error(`Última run status=${run.status}`);
  process.exit(1);
}
if (clients > 0 && snaps !== clients) {
  console.error(`Contagem incoerente: client_count=${clients} snapshot_rows=${snaps}`);
  process.exit(1);
}

console.log(
  JSON.stringify({
    ok: true,
    reference_date: run.reference_date,
    client_count: clients,
    snapshot_rows: snaps,
    run_id: run.run_id,
  }),
);
