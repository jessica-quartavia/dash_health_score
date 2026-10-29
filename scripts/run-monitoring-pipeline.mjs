/**
 * Pipeline de monitoramento — Etapa 10+
 * Uso: node scripts/run-monitoring-pipeline.mjs [--check-env] [--probe-storage] [--force] ...
 */
import { loadProjectEnv } from "../lib/load-env.mjs";
import { runMonitoringPipeline } from "../lib/monitoring/pipeline.mjs";
import { businessDataPersistExitCode } from "../lib/monitoring/persist-exit-code.mjs";

loadProjectEnv();

const args = process.argv.slice(2);
const checkEnvOnly = args.includes("--check-env");
const force = args.includes("--force");
const refArg = args.find((a) => a.startsWith("--reference-date="));
const referenceDate = refArg ? refArg.split("=")[1] : undefined;
const requireAutomation = args.includes("--require-automation");
const probeStorage = args.includes("--probe-storage");
const persistBusinessData =
  args.includes("--persist-business-data") ||
  (!args.includes("--no-persist-business-data") && process.env.HS_MONITORING_PERSIST_BUSINESS_DATA === "1");

async function main() {
  const result = await runMonitoringPipeline({
    checkEnvOnly,
    force,
    referenceDate,
    requireAutomation,
    probeStorage: checkEnvOnly || probeStorage,
    persistBusinessData,
  });

  if (checkEnvOnly) {
    console.log(JSON.stringify(result.environment, null, 2));
    if (!result.environment.durableDestination.configured) {
      console.warn("Aviso: destino durável não configurado — não afirmar automação operacional.");
      process.exitCode = 2;
    }
    return;
  }

  console.log(
    `Monitoramento OK — ${result.clientCount} ativos · snapshot ${result.snapshot?.skipped ? "idempotente" : "gravado"} · run ${result.run.runId}`,
  );
  const bd = result.businessData ?? result.run?.businessData;
  if (bd) {
    console.log(
      `Business Data: ${JSON.stringify({
        ok: bd.ok,
        skipped: bd.skipped,
        idempotent: bd.idempotent,
        runId: bd.runId,
        snapshotRows: bd.snapshotRows,
        reason: bd.reason,
        error: bd.error,
      })}`,
    );
  }

  const bdExit = businessDataPersistExitCode(bd, { required: persistBusinessData });
  if (bdExit !== 0) {
    console.error("Falha: persistência Business Data obrigatória não concluída com sucesso.");
    process.exitCode = bdExit;
  }

  if (result.environment.warnings?.length) {
    for (const w of result.environment.warnings) console.warn(`[aviso] ${w}`);
  }
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exitCode = 1;
});
