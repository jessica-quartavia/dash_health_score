/**
 * Regras de classificação e pesos do Health Score.
 */

export const MODEL_COMPLETO = "completo";
export const MODEL_SIMPLIFICADO = "simplificado";

export const WEIGHTS = {
  [MODEL_COMPLETO]: {
    s1: 0.1,
    s2: 0.3,
    s3: 0.1,
    s4: 0.5,
    label: "Pesos: Situação 1 = 10% · Situação 2 = 30% · Situação 3 = 10% · Situação 4 = 50%",
    formula: "Health Score = S1×0,1 + S2×0,3 + S3×0,1 + S4×0,5",
  },
  [MODEL_SIMPLIFICADO]: {
    s1: 0,
    s2: 0.4,
    s3: 0,
    s4: 0.6,
    label: "Pesos: Situação 2 = 40% · Situação 4 = 60%",
    formula: "Health Score = S2×0,4 + S4×0,6",
  },
};

export const FINAL_CLASSES = [
  { key: "Saudável", min: 75, max: 100, reading: "Cliente engajado e com mecanismo rodando" },
  { key: "Atenção", min: 50, max: 74, reading: "Algum sinal fraco, monitorar" },
  { key: "Crítico", min: 0, max: 49, reading: "Alta probabilidade de churn" },
];

export function classifyFinal(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return "Crítico";
  if (n >= 75) return "Saudável";
  if (n >= 50) return "Atenção";
  return "Crítico";
}

/** Situação 1 — reuniões nos primeiros 45 dias. */
export function classifySituation1({ meetingsFirst45, cycleDays }) {
  if (cycleDays == null || cycleDays < 45) {
    return {
      key: "Fase natural de acompanhamento",
      label: "Fase natural de acompanhamento",
      score: 100,
    };
  }
  if (meetingsFirst45 >= 3) return { key: "Saudável", label: "Saudável", score: 100 };
  if (meetingsFirst45 === 2) return { key: "Atenção", label: "Atenção", score: 75 };
  if (meetingsFirst45 === 1) return { key: "Crítico", label: "Crítico", score: 50 };
  return { key: "Crítico", label: "Crítico", score: 0 };
}

/** Situação 2 — média de reuniões por mês. */
export function classifySituation2(avgPerMonth) {
  const m = Number(avgPerMonth);
  if (!Number.isFinite(m) || m < 0.25) {
    return { key: "Crítico", label: "Crítico", score: 0 };
  }
  if (m >= 1) return { key: "Saudável", label: "Saudável", score: 100 };
  if (m >= 0.75) return { key: "Atenção", label: "Atenção", score: 75 };
  if (m >= 0.5) return { key: "Crítico", label: "Crítico", score: 50 };
  return { key: "Crítico", label: "Crítico", score: 25 };
}

/** Situação 3 — implementação por prazo. */
export function classifySituation3({ implementedCount, cycleDays }) {
  const impl = Number(implementedCount) || 0;
  const days = cycleDays == null ? 0 : Number(cycleDays);
  if (impl >= 1) return { key: "Saudável", label: "Saudável", score: 100 };
  if (days < 90) {
    return {
      key: "Fase natural de implantação",
      label: "Fase natural de implantação",
      score: 100,
    };
  }
  if (days <= 119) return { key: "Atenção", label: "Atenção", score: 75 };
  if (days <= 179) return { key: "Crítico", label: "Crítico", score: 50 };
  if (days <= 359) return { key: "Crítico", label: "Crítico", score: 25 };
  return { key: "Crítico", label: "Crítico", score: 0 };
}

/** Situação 4 — quantidade de mecanismos. */
export function classifySituation4({ implementedCount, cycleDays }) {
  const impl = Number(implementedCount) || 0;
  const days = cycleDays == null ? 0 : Number(cycleDays);
  if (impl === 0 && days < 90) {
    return {
      key: "Fase natural de implantação",
      label: "Fase natural de implantação",
      score: 100,
    };
  }
  if (impl >= 4) return { key: "Saudável", label: "Saudável (≥4)", score: 200 };
  if (impl === 3) return { key: "Saudável", label: "Saudável (3)", score: 175 };
  if (impl === 2) return { key: "Saudável", label: "Saudável (2)", score: 125 };
  if (impl === 1) return { key: "Saudável", label: "Saudável (1)", score: 100 };
  return { key: "Crítico", label: "Crítico", score: 0 };
}

export function computeWeightedScore(scores, model = MODEL_COMPLETO) {
  const w = WEIGHTS[model] || WEIGHTS[MODEL_COMPLETO];
  const weighted =
    (scores.s1 || 0) * w.s1 +
    (scores.s2 || 0) * w.s2 +
    (scores.s3 || 0) * w.s3 +
    (scores.s4 || 0) * w.s4;
  return Math.min(weighted, 100);
}

export function normalizeModel(value) {
  const v = String(value || "").toLowerCase().trim();
  if (v === "simplificado" || v === "simple" || v === "simplified") return MODEL_SIMPLIFICADO;
  return MODEL_COMPLETO;
}
