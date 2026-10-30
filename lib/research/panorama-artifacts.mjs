import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

export const PANORAMA_ARTIFACT_PATHS = {
  datasetValidado: "exports/predictive-study/dataset_preditivo_validado.csv",
  churnConsolidado: "exports/predictive-study/churn_consolidado.csv",
  hsHistoricoMensal: "exports/predictive-study/hs_historico_mensal.csv",
  preAudit: "research/modeling/output/pre_audit.json",
  modeling: "research/modeling/output/modeling_results_etapa4.json",
  modelingFallback: "research/modeling/output/modeling_results.json",
  robustness: "research/modeling/output/robustness_results.json",
  weightStudy: "research/modeling/output/hs_weight_study.json",
  profiles: "research/modeling/output/hs_profiles_analysis.json",
  pseudonymSecret: "exports/predictive-study/.pseudonym-secret",
};

export function probePanoramaArtifacts(root) {
  const entries = {};
  for (const [key, rel] of Object.entries(PANORAMA_ARTIFACT_PATHS)) {
    const abs = join(root, rel);
    if (!existsSync(abs)) {
      entries[key] = { path: rel, present: false };
      continue;
    }
    try {
      const st = statSync(abs);
      entries[key] = {
        path: rel,
        present: true,
        bytes: st.size,
        mtime: st.mtime.toISOString(),
      };
    } catch {
      entries[key] = { path: rel, present: false, unreadable: true };
    }
  }
  const csv = entries.datasetValidado?.present;
  const robustness = entries.robustness?.present;
  const preAudit = entries.preAudit?.present;
  let readiness = "unavailable";
  if (csv) readiness = "full";
  else if (robustness && preAudit) readiness = "partial_hs_only";
  else if (preAudit || entries.modeling?.present || entries.modelingFallback?.present) readiness = "models_only";

  const missing = Object.values(entries)
    .filter((e) => !e.present)
    .map((e) => e.path);

  return { entries, readiness, missing };
}

export const PANORAMA_REASON_MESSAGES = {
  csv_missing: "Arquivo exports/predictive-study/dataset_preditivo_validado.csv ausente neste ambiente.",
  csv_empty: "CSV validado existe mas está vazio ou corrompido.",
  pre_audit_missing: "research/modeling/output/pre_audit.json ausente.",
  artifacts_missing: "Artefatos mínimos (CSV ou robustness + pre_audit) ausentes.",
  pending: "Agregação não concluída (estado interno inconsistente).",
  invalid_api_response:
    "A URL /api/research-panorama não retornou JSON — use npm run dev (node scripts/dev-server.mjs), não servidor estático.",
  parse_error: "Resposta da API não é JSON válido.",
  http_error: "Falha HTTP ao carregar agregados.",
  processing_error: "Erro ao calcular agregados no servidor.",
};

export function reasonMessage(code) {
  return PANORAMA_REASON_MESSAGES[code] || `Código: ${code || "unknown"}`;
}
