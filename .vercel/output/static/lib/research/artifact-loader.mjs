import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson(relPath) {
  const path = join(ROOT, relPath);
  if (!existsSync(path)) return { ok: false, path: relPath, data: null };
  try {
    return { ok: true, path: relPath, data: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { ok: false, path: relPath, error: error.message, data: null };
  }
}

export function loadResearchArtifacts() {
  const modeling = readJson("research/modeling/output/modeling_results.json");
  const modelingEtapa4 = readJson("research/modeling/output/modeling_results_etapa4.json");
  const robustness = readJson("research/modeling/output/robustness_results.json");
  const etapa6 = readJson("research/modeling/output/etapa6_manifest.json");
  const etapa7 = readJson("research/modeling/output/etapa7_manifest.json");
  const hs2Compare = readJson("research/modeling/output/hs2_comparison.json");
  const readiness = readJson("exports/predictive-study/predictive_readiness.json");
  const envAudit = readJson("research/monitoring/output/ENV_AUDIT_ETAPA11.json");
  const hsWeightStudy = readJson("research/modeling/output/hs_weight_study.json");
  const hsFutureFeasibility = readJson("research/modeling/output/hs_future_feasibility.json");

  const modelsTrained = modeling.ok && modeling.data?.status === "ok";
  const robustnessOk = robustness.ok;
  const etapa6Ok = etapa6.ok;
  const etapa7Ok = etapa7.ok;

  let researchState = "artifacts_missing";
  if (modelsTrained) researchState = "models_trained_not_operational";
  if (readiness.ok) researchState = modelsTrained ? "models_trained_not_operational" : "dataset_ready_no_models";
  if (!modeling.ok && !readiness.ok && !robustness.ok) researchState = "artifacts_missing";

  const synthReadiness = readiness.data || (modeling.data
    ? {
        source: "modeling_results.json",
        generatedAt: modeling.data.generatedAt,
        churnStats: {
          episodesConfirmed: modeling.data.sample?.positives_test ?? null,
          note: "Síntese a partir de modeling_results — preferir build:predictive-validated para churn consolidado.",
        },
        audit: {
          rowsEligible90: modeling.data.sample?.labeled_rows,
          positives90: Math.round((modeling.data.sample?.prevalence_train || 0) * (modeling.data.sample?.train || 0)),
        },
      }
    : null);

  return {
    version: "research-bundle-v1",
    checkedAt: new Date().toISOString(),
    researchState,
    researchStateLabel:
      researchState === "models_trained_not_operational"
        ? "Modelos experimentais treinados — não validados para uso operacional"
        : researchState === "artifacts_missing"
          ? "Resultados de pesquisa indisponíveis neste ambiente. Regere os artefatos."
          : "Dataset / artefatos parciais",
    artifacts: {
      predictiveReadiness: { available: readiness.ok, path: readiness.path },
      modelingResults: { available: modeling.ok, path: modeling.path },
      modelingEtapa4: { available: modelingEtapa4.ok, path: modelingEtapa4.path },
      robustness: { available: robustness.ok, path: robustness.path },
      etapa6: { available: etapa6.ok, path: etapa6.path },
      etapa7: { available: etapa7.ok, path: etapa7.path },
      hs2Comparison: { available: hs2Compare.ok, path: hs2Compare.path },
      monitoringEnvAudit: { available: envAudit.ok, path: envAudit.path },
      hsWeightStudy: { available: hsWeightStudy.ok, path: hsWeightStudy.path },
      hsFutureFeasibility: { available: hsFutureFeasibility.ok, path: hsFutureFeasibility.path },
    },
    regenerateCommands: [
      "npm run build:predictive-validated",
      "npm run model:all",
      "npm run model:robustness",
      "npm run model:etapa6",
      "npm run model:etapa7",
      "npm run monitoring:pipeline",
    ],
    data: {
      predictiveReadiness: synthReadiness,
      modelingResults: modeling.data,
      robustnessResults: robustness.data,
      etapa6Results: etapa6.data,
      etapa7Results: etapa7.ok
        ? { ...etapa7.data, comparison_cache: hs2Compare.ok ? hs2Compare.data : null }
        : null,
      hsWeightStudy: hsWeightStudy.data,
      hsFutureFeasibility: hsFutureFeasibility.data,
    },
    separation: {
      operacional: "Snapshot BASE QV — status e indicadores atuais (filtros do dashboard).",
      pesquisa: "Arquivos congelados em research/modeling/output e exports/predictive-study — não recalcular com dados atuais.",
    },
  };
}
