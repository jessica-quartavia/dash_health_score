/**
 * Estudo exploratório de pesos HS(w)= w·E + (1-w)·M.
 * Não escolhe ótimo no hold-out jun/2026 como confirmação — usa métricas documentadas e proxy quando dataset row-level ausente.
 */

const WEIGHT_GRID = Array.from({ length: 21 }, (_, i) => i * 5);

export function buildHsWeightStudy({ modeling = null, robustness = null, readiness = null } = {}) {
  const audit = {
    pointInTime: readiness?.audit?.hsIntegral != null ? "hs_historico_mensal disponível no export validado" : "requer build:predictive-validated",
    eligible90: readiness?.audit?.rowsEligible90 ?? modeling?.sample?.labeled_rows ?? null,
    positives90: readiness?.audit?.positives90 ?? null,
    censored90: readiness?.audit?.censored90 ?? null,
    clientDependency: "observações repetidas por cliente — usar IC cluster / bootstrap",
    mHistoricalReliability: robustness?.m_sensitivity ? "sensibilidade M documentada (Etapa 5)" : "pendente",
    holdoutNote:
      "Conjunto teste 2026-06 já usado em experimentos — não usar como validação confirmatória de novos pesos.",
  };

  const modelRanking = modeling?.ranking_test || [];
  const models = modeling?.models || {};
  const baseline = {
    E: modelRanking.find((r) => r.model_id === "A") || null,
    M: modelRanking.find((r) => r.model_id === "B") || null,
    HS5050: modelRanking.find((r) => r.model_id === "C") || null,
    structured: modelRanking.find((r) => r.model_id === "D") || null,
    full: modelRanking.find((r) => r.model_id === "E") || null,
  };

  const grid = WEIGHT_GRID.map((wE) => {
    const entry = {
      engagementPercent: wE,
      mechanismPercent: 100 - wE,
      official: wE === 50,
      rocAucTest: null,
      prAucTest: null,
      source: "requires_row_level_refit",
      note:
        wE === 50
          ? "Baseline operacional V1 documentado."
          : "Re-score completo exige dataset_preditivo_validado — não inferido aqui.",
    };
    if (wE === 50 && baseline.HS5050 && models.C?.test) {
      entry.rocAucTest = models.C.test.roc_auc;
      entry.prAucTest = models.C.test.pr_auc;
      entry.source = "model_C_holdout_jun2026_exploratory";
      entry.note = "Modelo C (HS 50/50) no hold-out exploratório — não validação independente.";
    }
    if (wE === 100 && baseline.E && models.A?.test) {
      entry.rocAucTest = models.A.test.roc_auc;
      entry.prAucTest = models.A.test.pr_auc;
      entry.source = "model_A_proxy";
      entry.note = "Proxy: só E (não equivalente a HS 100/0 calibrado).";
    }
    if (wE === 0 && baseline.M && models.B?.test) {
      entry.rocAucTest = models.B.test.roc_auc;
      entry.prAucTest = models.B.test.pr_auc;
      entry.source = "model_B_proxy";
      entry.note = "Proxy: só M.";
    }
    return entry;
  });

  let decision = "maintain_50_50";
  let summaryPlain =
    "Manter 50/50 como HS operacional. Grid completo de 21 pesos exige refit no dataset validado; jun/2026 não serve como teste confirmatório.";
  if (!modeling?.status || modeling.status !== "ok") {
    decision = "insufficient_artifacts";
    summaryPlain = "Artefatos de modelagem ausentes — conduzir estudo após build:predictive-validated e model:all.";
  } else if (baseline.full && baseline.HS5050) {
    const fullAuc = models[baseline.full.model_id]?.test?.roc_auc;
    const hsAuc = models[baseline.HS5050.model_id]?.test?.roc_auc;
    if (fullAuc != null && hsAuc != null && fullAuc - hsAuc > 0.03) {
      decision = "explore_structured_not_fixed_weight";
      summaryPlain =
        "Modelo estruturado+E+M supera HS 50/50 no hold-out exploratório — sugere investigar forma funcional além de peso fixo, sem mudar operação.";
    }
  }

  return {
    version: "hs-weight-study-v1",
    generatedAt: new Date().toISOString(),
    formula: "HS(w) = w × E + (1 − w) × M, w ∈ [0,1]",
    weightGridPercent: WEIGHT_GRID,
    audit,
    grid,
    modelBaselines: baseline,
    hsChurnByBand: modeling?.hs_eda?.hs_churn_rate_by_band || [],
    recommendation: {
      decision,
      summaryPlain,
      uncertainty:
        "Resultados condicionados a cobertura, censura e vieses documentados na pesquisa. Sem validação temporal independente adicional.",
      doNotChangeOperationalV1: true,
    },
  };
}

export function renderHsWeightStudyMarkdown(study) {
  const lines = [
    "# Estudo de pesos E/M — Health Score",
    "",
    `Gerado: ${study.generatedAt}`,
    "",
    "## Fórmula",
    "",
    study.formula,
    "",
    "## Auditoria (pré-otimização)",
    "",
    ...Object.entries(study.audit).map(([k, v]) => `- **${k}**: ${v}`),
    "",
    "## Recomendação",
    "",
    `- **Decisão**: \`${study.recommendation.decision}\``,
    `- ${study.recommendation.summaryPlain}`,
    `- ${study.recommendation.uncertainty}`,
    "",
    "## Grid de pesos (21 combinações)",
    "",
    "| E% | M% | ROC-AUC (teste) | PR-AUC | Fonte |",
    "|---:|---:|---:|---:|---|",
    ...study.grid.map(
      (g) =>
        `| ${g.engagementPercent} | ${g.mechanismPercent} | ${g.rocAucTest ?? "—"} | ${g.prAucTest ?? "—"} | ${g.source} |`,
    ),
    "",
    "## Baselines de modelos (A–E)",
    "",
    "Ver `research/modeling/output/modeling_results.json` para curvas, calibração e limitações.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}
