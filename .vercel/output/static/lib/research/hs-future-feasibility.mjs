/** Viabilidade de modelar HS futuro (30/60/90d) a partir de snapshots persistidos. */

export function assessHsFutureFeasibility({ snapshotTrend = [], freezes = [], modeling = null } = {}) {
  const distinctDays = new Set(
    (snapshotTrend || []).map((t) => t.dia || t.reference_date).filter(Boolean),
  );
  const validPoints = (snapshotTrend || []).filter((t) => (t.clientes ?? t.row_count ?? 0) > 0);
  const freezeCount = freezes?.length || 0;

  let feasible = validPoints.length >= 2 && distinctDays.size >= 2;
  let reason = feasible
    ? "Snapshots em dias distintos permitem pares (t → t+k) exploratórios."
    : "É necessário ao menos dois snapshots comparáveis em dias diferentes.";

  if (feasible && validPoints.length < 4) {
    feasible = false;
    reason = "Série curta — preferir baseline de persistência até acumular mais execuções mensais.";
  }

  const targets = [
    { horizonDays: 30, label: "HS +30d" },
    { horizonDays: 60, label: "HS +60d" },
    { horizonDays: 90, label: "HS +90d" },
  ];

  return {
    version: "hs-future-feasibility-v1",
    generatedAt: new Date().toISOString(),
    feasible,
    modelValidated: false,
    reason,
    snapshotPoints: validPoints.length,
    distinctReferenceDays: distinctDays.size,
    prospectiveFreezes: freezeCount,
    targets,
    baselinesRecommended: [
      "HS futuro = HS atual (persistência)",
      "Média móvel do cliente quando série BD ≥ 3 pontos",
      "Regressão regularizada após validação cronológica",
    ],
    churnInteraction:
      "Clientes que saem antes do horizonte não recebem HS imputado — tratar como evento concorrente ou censura na modelagem.",
    leakageRules: [
      "Não usar HS futuro como feature na data t",
      "Harmonizar versão de fórmula entre snapshots",
    ],
    modelingChurnPreserved: Boolean(modeling?.status === "ok"),
  };
}
