/**
 * Compat: delega ao pipeline Etapa 10.
 */
import { runMonitoringPipeline } from "../lib/monitoring/pipeline.mjs";

runMonitoringPipeline({ scheduleMode: "manual" })
  .then((r) => {
    console.log(`Etapa 9/10 OK — ${r.clientCount} ativos, snapshot ${r.snapshot?.skipped ? "skip" : "new"}`);
  })
  .catch((e) => {
    console.error(e?.message || e);
    process.exitCode = 1;
  });
