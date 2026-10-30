import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { auditOperationalExport } from "./operational-export-audit.mjs";

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const MODEL_E_FEATURES = {
  numeric: [
    "engajamento_historico",
    "mecanismos_historico",
    "reunioes_acumuladas",
    "reunioes_30d",
    "reunioes_90d",
    "reunioes_180d",
    "recencia_dias",
    "freq_media_mes",
    "mecanismos_implantados",
  ],
  categorical: ["programa"],
};

function artifactMeta(path, data, versionKey) {
  return {
    path,
    ok: Boolean(data),
    versionKey: data?.manifest?.dataset_hash_sha256_16 || data?.generatedAt || versionKey || null,
    status: data?.status || (data ? "ok" : "missing"),
  };
}

function rankEtapa4Models(etapa4) {
  if (!etapa4?.models) return [];
  const ranking = etapa4.ranking_test || Object.keys(etapa4.models);
  return (Array.isArray(ranking) ? ranking : []).map((row) => {
    const id = typeof row === "string" ? row : row.model_id;
    const test = etapa4.models[id]?.test || {};
    return {
      id,
      label: etapa4.models[id]?.label || id,
      rocAuc: test.roc_auc ?? null,
      prAuc: test.pr_auc ?? null,
      brier: test.brier ?? null,
      logLoss: test.log_loss ?? null,
      period: (etapa4.split?.test_months || []).join(", ") || "jun/2026",
      source: "modeling_results_etapa4.json",
    };
  });
}

function deriveSelection(v16, etapa4) {
  const rec = v16?.recommendation;
  if (v16?.status === "ok" && rec) {
    const challengers = (v16.models_compared || []).filter((c) => c.id !== "baseline_prevalence");
    const eRow = challengers.find((c) => String(c.id).includes("model_E") || c.feature_pack === "E");
    const bestAuc = Math.max(...challengers.map((c) => c.test?.roc_auc ?? 0));
    return {
      chosenId: rec.keep_baseline !== false ? "E" : rec.candidate_experimental || "E",
      status: rec.keep_baseline !== false ? "baseline_experimental" : "candidate_experimental",
      rationale: rec.rationale,
      validationStatus: rec.validation_status,
      holdoutMonth: v16.temporal_validation?.holdout_month,
      holdoutPurpose: v16.temporal_validation?.holdout_purpose,
      juneRole: v16.temporal_validation?.june_2026_role,
      pairedLogisticVsE: v16.paired_tests?.logistic_best_minus_E,
      pairedHgbVsE: v16.paired_tests?.hgb_minus_E,
      v16BestId: challengers.sort((a, b) => (b.test?.roc_auc ?? 0) - (a.test?.roc_auc ?? 0))[0]?.id,
      v16BestAuc: bestAuc,
      eHoldoutAuc: eRow?.test?.roc_auc ?? null,
      featurePack: v16.selected_feature_pack,
      featurePackComparison: (v16.feature_pack_comparison || []).filter((p) => !p.skipped).slice(0, 8),
      enrichment: (v16.enrichment_availability || []).filter((e) => !e.in_export || !e.pit_usable).slice(0, 10),
    };
  }
  const ranked = rankEtapa4Models(etapa4);
  const best = ranked[0];
  return {
    chosenId: "E",
    status: "baseline_experimental",
    rationale:
      best?.id === "E"
        ? "Etapa 16 indisponível — Modelo E permanece referência com melhor discriminação documentada na Etapa 4 (hold-out jun/2026 exploratório)."
        : `Etapa 16 indisponível — na Etapa 4, ${best?.id} teve maior ROC-AUC exploratório; referência de comunicação permanece Modelo E congelado até revisão com v16.`,
    validationStatus: "etapa4_exploratory_only",
    holdoutMonth: etapa4?.split?.test_months?.[0] || "2026-06",
    holdoutPurpose: "historical_etapa4",
    juneRole: "exploratory_holdout",
    pairedLogisticVsE: null,
    pairedHgbVsE: null,
    v16BestId: null,
    v16BestAuc: null,
    eHoldoutAuc: etapa4?.models?.E?.test?.roc_auc ?? null,
    featurePack: null,
    featurePackComparison: [],
    enrichment: [],
  };
}

/**
 * Pacote versionado para UI/relatório — nunca mistura métricas sem rótulo de período.
 */
export function buildPredictiveLabReference(root) {
  const base = root || process.cwd();
  const out = join(base, "research", "modeling", "output");
  const etapa4Path = join(out, "modeling_results_etapa4.json");
  const etapa4AltPath = join(out, "modeling_results.json");
  const v15Path = join(out, "predictive_study_v15.json");
  const v16Path = join(out, "predictive_study_v16.json");
  const v17Path = join(out, "predictive_study_v17.json");

  const etapa4 = readJson(etapa4Path) || readJson(etapa4AltPath);
  const v15 = readJson(v15Path);
  const v16 = readJson(v16Path);
  const v17 = readJson(v17Path);

  const sources = {
    etapa4: artifactMeta(
      existsSync(etapa4Path) ? "research/modeling/output/modeling_results_etapa4.json" : "research/modeling/output/modeling_results.json",
      etapa4,
      etapa4?.generatedAt,
    ),
    v15: artifactMeta("research/modeling/output/predictive_study_v15.json", v15, v15?.manifest?.processed_at),
    v16: artifactMeta("research/modeling/output/predictive_study_v16.json", v16, v16?.manifest?.dataset_hash_sha256_16),
    v17: artifactMeta("research/modeling/output/predictive_study_v17.json", v17, v17?.manifest?.processed_at),
  };

  const eTestJune = etapa4?.models?.E?.test ?? v16?.frozen_etapa4_E_test_june ?? null;
  const eTestV16Holdout = (v16?.models_compared || []).find(
    (c) => c.id === "model_E_frozen_family" || c.feature_pack === "E",
  )?.test;

  const selection = deriveSelection(v16, etapa4);

  const referenceModel = {
    id: "E",
    label: "Estruturados + Engajamento + Mecanismos (Modelo E)",
    algorithm: "Regressão logística regularizada L2 (class_weight balanced)",
    horizonDays: 90,
    formula: "P(churn 90d | X) = 1 / (1 + exp(−z)), z = β₀ + Σ βᵢ Xᵢ",
    features: MODEL_E_FEATURES,
    status: "experimental",
    statusPlain:
      "Referência de pesquisa — não é modelo operacional em produção e não publica probabilidade individual de churn.",
    metrics: {
      june2026Exploratory: eTestJune
        ? {
            ...pickMetrics(eTestJune),
            period: "2026-06",
            label: "Hold-out Etapa 4 (exploratório)",
            source: sources.etapa4.path,
          }
        : null,
      v16Holdout: eTestV16Holdout
        ? {
            ...pickMetrics(eTestV16Holdout),
            period: selection.holdoutMonth || "—",
            label: "Hold-out Etapa 16 (seleção exploratória)",
            source: sources.v16.path,
          }
        : null,
    },
    split: etapa4?.split ?? null,
  };

  let etapa15 = null;
  if (v15?.status === "ok") {
    const fair = v15.fair_comparison || {};
    etapa15 = {
      status: "ok",
      summary:
        "Na Etapa 15, Modelo E reestimado e logística V2 no mesmo split: diferença de ROC-AUC estatisticamente inconclusiva (IC bootstrap por cliente inclui zero).",
      eRefit: fair.model_E_refit,
      v2Refit: fair.model_V2_logistic_refit,
      pairedAucDiff: fair.paired_v2_minus_E_auc,
      recommendation: v15.methodological_recommendation,
      source: sources.v15.path,
    };
  } else {
    etapa15 = { status: sources.v15.ok ? "failed" : "missing", summary: sources.v15.ok ? "Artefato Etapa 15 inválido." : "Etapa 15 não encontrada." };
  }

  let etapa16 = null;
  if (v16?.status === "ok") {
    etapa16 = {
      status: "ok",
      holdout: v16.temporal_validation?.holdout_month,
      splitNote: v16.temporal_validation?.split_note,
      recommendation: v16.recommendation,
      modelsCompared: (v16.models_compared || []).map((c) => ({
        id: c.id,
        family: c.family,
        featurePack: c.feature_pack,
        rocAuc: c.test?.roc_auc,
        prAuc: c.test?.pr_auc,
        brier: c.test?.brier,
        logLoss: c.test?.log_loss,
        n: c.test?.n,
        period: v16.temporal_validation?.holdout_month,
      })),
      limitations: v16.operational_limitations,
      datasetHash: v16.manifest?.dataset_hash_sha256_16,
      processedAt: v16.manifest?.processed_at || v16.generatedAt,
      source: sources.v16.path,
    };
  } else {
    etapa16 = { status: sources.v16.ok ? "failed" : "missing", summary: sources.v16.ok ? "Etapa 16 inválida." : "Etapa 16 não processada neste ambiente." };
  }

  let etapa17 = null;
  if (v17?.status === "ok") {
    const eBal = (v17.experiments || []).find((e) => e.id === "model_E_balanced");
    const conclusion = v17.conclusion_abc || {};
    etapa17 = {
      status: "ok",
      evaluationMonth: v17.temporal_audit?.evaluation_month,
      temporalNote: v17.temporal_audit?.note,
      diagnosis: v17.diagnosis,
      conclusionLetter: conclusion.letter,
      conclusionSummary: conclusion.summary,
      experiments: (v17.experiments || []).map((e) => ({
        id: e.id,
        label: e.label,
        rocAuc: e.test?.roc_auc,
        prAuc: e.test?.pr_auc,
        brier: e.test?.brier,
        logLoss: e.test?.log_loss,
        n: e.test?.n,
        prevalence: e.test?.prevalence,
        probMean: e.test?.probability_summary?.prob_mean,
        calibrationIntercept: e.test?.calibration_logit?.intercept,
        calibrationSlope: e.test?.calibration_logit?.slope,
        bootstrapRoc: e.test?.bootstrap_roc_auc,
        riskGroups: e.test?.risk_groups,
        calibrationBins: e.test?.calibration_bins,
      })),
      riskGroupsE: eBal?.test?.risk_groups || [],
      segments: v17.segments_model_E,
      recommendation: conclusion.recommendation,
      source: sources.v17.path,
    };
  } else {
    etapa17 = {
      status: sources.v17.ok ? "failed" : "missing",
      summary: sources.v17.ok ? "Etapa 17 inválida." : "Etapa 17 não processada — npm run model:study-v17",
    };
  }

  const etapa4Ranking = rankEtapa4Models(etapa4);
  const operationalAudit = auditOperationalExport(base);

  const ok = Boolean(referenceModel.metrics.june2026Exploratory || referenceModel.metrics.v16Holdout || etapa4);

  return {
    ok,
    loadState: ok ? "ready" : "partial",
    sources,
    referenceModel,
    selection,
    etapa15,
    etapa16,
    etapa17,
    etapa4Ranking,
    operationalAudit,
    whyChosenPlain: buildWhyChosenPlain(referenceModel, selection, etapa15, etapa16, etapa17, etapa4Ranking),
    improvementRoadmap: buildImprovementRoadmap(etapa16, etapa17, operationalAudit),
    alternativesNote: selection.rationale,
  };
}

function pickMetrics(t) {
  return {
    rocAuc: t.roc_auc ?? null,
    prAuc: t.pr_auc ?? null,
    brier: t.brier ?? null,
    logLoss: t.log_loss ?? null,
    n: t.n ?? null,
    prevalence: t.prevalence ?? null,
  };
}

function buildWhyChosenPlain(ref, sel, e15, e16, e17, ranking) {
  const parts = [
    "O Modelo E combina cadastro estruturado (programa), Engajamento e Mecanismos medidos na data de referência.",
    "Na Etapa 4, entre os modelos A–E no mesmo hold-out, E apresentou discriminação superior aos modelos mais simples (A, B, C).",
  ];
  if (e15?.status === "ok") parts.push(e15.summary);
  if (e16?.status === "ok") parts.push(`Etapa 16 (hold-out ${sel.holdoutMonth}): ${sel.rationale}`);
  else parts.push("Etapa 16: resultados não carregados — decisão baseada em Etapa 4 e 15 quando disponíveis.");
  if (e17?.status === "ok") parts.push(`Etapa 17 (calibração): conclusão ${e17.conclusionLetter} — ${e17.conclusionSummary}`);
  parts.push("Não afirmamos uso operacional individual até validação prospectiva independente.");
  return parts.join(" ");
}

function buildImprovementRoadmap(e16, e17, op) {
  const cal =
    e17?.status === "ok"
      ? e17.conclusionSummary
      : "Recalibrar probabilidades agregadas (Platt/isotônica) após novo hold-out independente.";
  return [
    { step: "Dados", text: "Integrar NPS, suporte e tenure contratual no export point-in-time (snapshot tem NPS parcial)." },
    { step: "Cobertura", text: `Snapshot: ${op.clientsInSnapshot ?? "—"} clientes; ~${op.activeProxyNoChurnDate ?? "—"} ativos; ${op.clientsWithNpsHistory ?? "—"} com NPS histórico exportado.` },
    { step: "Calibração", text: cal },
    { step: "Validação", text: "Congelar mês prospectivo futuro antes de qualquer uso operacional." },
    { step: "Governança", text: "Manter HS V1 50/50 operacional; churn preditivo apenas agregado em pesquisa." },
  ];
}

/** @deprecated use buildPredictiveLabReference return shape */
export function loadPredictiveLabReference(root) {
  const pack = buildPredictiveLabReference(root);
  return {
    referenceModel: pack.referenceModel,
    etapa15: pack.etapa15,
    etapa16: pack.etapa16,
    alternativesNote: pack.alternativesNote,
  };
}
