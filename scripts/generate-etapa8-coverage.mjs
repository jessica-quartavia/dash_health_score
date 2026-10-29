/**
 * Relatório de cobertura atual (autorizado) — lê lógica via payload local simulado.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getHealthScoreResponse } from "../lib/service.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "research", "modeling", "output");

async function main() {
  const payload = await getHealthScoreResponse({ cluster: "ativos" });
  const report = {
    version: "etapa8-coverage-v1",
    generatedAt: new Date().toISOString(),
    population: "ativos",
    totalClientes: payload.summary?.totalClients,
    hs2aManagerial: payload.hs2aManagerial,
    metadata: payload.metadata?.hs2a,
    indicadores: {
      observados: ["HS", "E", "M", "reuniões", "mecanismos implantados", "classificação V1"],
      reconstruidos: ["Histórico mensal no detalhe (export pesquisa)"],
      indisponiveis: ["Probabilidade de churn individual", "HS 2.0B agregado"],
    },
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "current_coverage_report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(
    join(OUT, "RELATORIO_ETAPA8.md"),
    `# Relatório Etapa 8\n\nGerado: ${report.generatedAt}\n\nClientes ativos: ${report.totalClientes}\n\nVer current_coverage_report.json e docs/HS2A_INTERPRETIVE_RULES.md\n`,
    "utf8",
  );
  console.log("current_coverage_report.json OK");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exitCode = 1;
});
