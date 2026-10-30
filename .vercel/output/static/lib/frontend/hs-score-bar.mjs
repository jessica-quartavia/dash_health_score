/** Barra fina de HS para tabelas — cores pela classificação operacional. */

export function hsBarTone(finalClass) {
  const c = String(finalClass || "");
  if (c === "Saudável") return "healthy";
  if (c === "Atenção") return "attention";
  if (c === "Crítico") return "critical";
  return "neutral";
}

export function hsScoreBarHtml(row, ctx = {}) {
  const escapeHtml = ctx.escapeHtml || ((s) => String(s ?? ""));
  const formatNum = ctx.formatNum || ((n) => String(n));
  const weights = ctx.weights || { engagement: 50, mechanism: 50 };
  const showScenario = ctx.showScenario !== false;
  const e = row.engagementScore;
  const m = row.mechanismScore;
  const score = Number(row.healthScore);
  const tone = hsBarTone(row.finalClass);
  const pct = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const scenario =
    showScenario && !(weights.engagement === 50 && weights.mechanism === 50)
      ? `<span class="hs-scenario-tag">exp</span>`
      : "";
  let title = "";
  if (e == null && m == null) title = "HS indisponível — componentes E/M ausentes";
  else if (!Number.isFinite(score)) title = "HS não calculável";
  else if (score === 0 && e === 0 && m === 0) title = "HS 0 legítimo (E=0, M=0) — ver classificação";
  else if (score === 0) title = `HS 0 · ${row.finalClass || ""}`;
  const val = Number.isFinite(score) ? formatNum(score, 0) : "—";
  return `<span class="hs-inline-bar ${tone}" title="${escapeHtml(title)}">${scenario}<span class="hs-inline-val">${val}</span><span class="hs-inline-track"><i style="width:${pct}%"></i></span></span>`;
}
