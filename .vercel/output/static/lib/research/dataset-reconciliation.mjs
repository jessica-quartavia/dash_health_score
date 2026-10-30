/**
 * Reconcilia denominadores entre pre_audit, CSV descritivo e estudos v15/v16.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { finiteNumber, sanitizeRate } from "../frontend/display-format.mjs";

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function buildDatasetReconciliation(preAudit, options = {}) {
  const root = options.root || process.cwd();
  const v16 = options.studyV16 || readJson(join(root, "research/modeling/output/predictive_study_v16.json"));
  const v16ok = v16?.status === "ok";

  const pos = finiteNumber(preAudit?.positive_rows_90d) ?? 0;
  const neg = finiteNumber(preAudit?.negative_rows_90d) ?? 0;
  const labeledPreAudit = pos + neg;
  const ratePreAudit = labeledPreAudit ? sanitizeRate(pos / labeledPreAudit) : null;

  const hsLines = finiteNumber(preAudit?.hs_distribution?.count);
  const v16Obs = v16ok ? finiteNumber(v16.dataset_audit?.observations_eligible_90d) : null;
  const v16Rate = v16ok ? finiteNumber(v16.dataset_audit?.prevalence_by_observation) : null;

  const rows = [
    {
      id: "pre_audit_labeled_90d",
      label: "pre_audit.json — linhas com janela 90d completa",
      observations: labeledPreAudit || null,
      rate: ratePreAudit,
      population: "Cliente-mês elegível ao rótulo Y (positivo + negativo)",
      period: "Recorte do último audit de modelagem",
      use: "Taxa ~30,6% citada historicamente; KPI principal do Panorama",
    },
    {
      id: "hs_distribution_lines",
      label: "pre_audit.hs_distribution — linhas com HS reconstruído",
      observations: hsLines,
      rate: null,
      population: "Inclui censuradas e linhas sem Y rotulado",
      period: "Mesmo export validado",
      use: "Denominador maior (~18,6 mil) — não confundir com rotuladas",
    },
    {
      id: "etapa16_modeling_frame",
      label: v16ok ? "predictive_study_v16 — frame elegível + não censurado" : "Etapa 16 — pendente",
      observations: v16Obs,
      rate: v16Rate,
      population: v16ok ? "eligible ∧ ¬censura_90d (Python modeling_frame)" : "Artefato ausente ou incompleto",
      period: v16ok ? `Hold-out exploratório ${v16.temporal_validation?.holdout_month || "—"}` : "—",
      use: v16ok ? "Taxa ~28,2% no rebuild recente — mesma lógica de Y, filtro de elegibilidade pode diferir do pre_audit" : "Aguardar processamento",
    },
    {
      id: "descriptive_filtered",
      label: "Gráficos do Panorama (faixas HS/E/M)",
      observations: options.descriptiveObservations ?? null,
      rate: options.descriptiveRate ?? null,
      population: options.descriptiveFilterLabel || "Filtros descritivos ativos (programa/fase/cobertura)",
      period: "Subset do CSV validado",
      use: "Soma das faixas deve bater com observações do recorte filtrado",
    },
  ];

  const notes = [
    "12596 ≈ 3855 + 8741 (pre_audit): taxa 30,6% = positivas ÷ rotuladas 90d.",
    "14609 (Etapa 16): frame de modelagem após filtros de elegibilidade/censura — prevalência ~28,2% no manifesto v16.",
    "18638 (hs_distribution): universo histórico mais amplo; diferença para 12596 inclui censura e linhas sem rótulo completo.",
    "Jun/2026: hold-out congelado Etapa 4 (exploratório). Jul/2026: hold-out principal Etapa 16 — não misturar métricas sem identificar período.",
  ];

  return {
    ok: Boolean(preAudit),
    manifest: {
      preAudit: preAudit ? "research/modeling/output/pre_audit.json" : null,
      studyV16: v16ok ? "research/modeling/output/predictive_study_v16.json" : null,
      datasetHashV16: v16?.manifest?.dataset_hash_sha256_16 ?? null,
    },
    rows,
    notes,
  };
}
