/** Etapa 15 — diagnóstico limitações preditivas. */

export function renderResearchStudyV15(pack, ui) {
  if (!pack?.ok) {
    return `<section class="card"><h2>Diagnóstico Etapa 15</h2><p class="note">${ui.escapeHtml(pack?.error || "Artefato ausente")}</p><p class="sub"><code>npm run model:study-v15</code></p></section>`;
  }
  const s = pack.study;
  const fair = s.fair_comparison || {};
  const e = fair.model_E_refit || {};
  const v2 = fair.model_V2_logistic_refit || {};
  const paired = fair.paired_v2_minus_E_auc || {};
  const diag = s.diagnosis || {};

  const row = (label, m) =>
    `<tr><td>${ui.escapeHtml(label)}</td><td class="num">${ui.formatNum(m.roc_auc, 3)}</td><td class="num">${ui.formatNum(m.pr_auc, 3)}</td><td class="num">${ui.formatNum(m.brier, 3)}</td><td class="num">${ui.formatNum(m.log_loss, 3)}</td><td class="num">${ui.fmt.format(m.n ?? "—")}</td></tr>`;

  const segRows = (s.segment_audit || [])
    .map(
      (g) =>
        `<tr><td>${ui.escapeHtml(g.segment)}</td><td class="num">${ui.fmt.format(g.n_obs ?? "—")}</td><td class="num">${g.churn_rate != null ? ui.pctFmt.format(g.churn_rate * 100) + "%" : "—"}</td><td class="num">${g.ci_low != null ? ui.pctFmt.format(g.ci_low * 100) + "–" + ui.pctFmt.format(g.ci_high * 100) + "%" : "—"}</td></tr>`,
    )
    .join("");

  const bullets = (diag.bullets || []).map((b) => `<li>${ui.escapeHtml(b.replace(/\*\*/g, ""))}</li>`).join("");
  const horizons = (s.horizons || [])
    .map(
      (h) =>
        `<li>${h.horizon_days}d: ${h.labeled_rows ?? "—"} linhas · taxa ${h.observed_rate != null ? ui.pctFmt.format(h.observed_rate * 100) + "%" : "—"}</li>`,
    )
    .join("");

  return `
    <section class="research-hero card">
      <p class="research-hero-eyebrow">Etapa 15 · diagnóstico</p>
      <h1 class="research-hero-title">Por que o modelo ainda não melhorou?</h1>
      <p class="research-hero-lead">Comparação justa E vs V2 — mesma base, rótulos 90d e split temporal. Sem seleção de hiperparâmetros em jun/2026.</p>
    </section>
    <section class="card">
      <h2 class="research-section-title">Comparação justa (teste exploratório)</h2>
      <p class="sub">${ui.escapeHtml(fair.protocol?.split_note || "")}</p>
      <table><thead><tr><th>Modelo</th><th class="num">ROC-AUC</th><th class="num">PR-AUC</th><th class="num">Brier</th><th class="num">Log loss</th><th class="num">n</th></tr></thead>
      <tbody>${row("E (refit)", e)}${row("V2 logística (refit)", v2)}</tbody></table>
      <p class="note">V2 − E (AUC, bootstrap por cliente): ${ui.formatNum(paired.diff_mean, 4)} · IC95% [${ui.formatNum(paired.ci_low, 4)}, ${ui.formatNum(paired.ci_high, 4)}]</p>
      <p>${ui.escapeHtml(s.methodological_recommendation || "")}</p>
    </section>
    <section class="card">
      <h2 class="research-section-title">${ui.escapeHtml(diag.title || "Diagnóstico")}</h2>
      <ul class="plain-list">${bullets}</ul>
    </section>
    <section class="card">
      <h2 class="research-section-title">Churn observado por segmento</h2>
      <table><thead><tr><th>Segmento</th><th class="num">Obs</th><th class="num">Taxa</th><th class="num">IC95%</th></tr></thead><tbody>${segRows}</tbody></table>
    </section>
    <section class="card">
      <h2 class="research-section-title">Horizontes</h2>
      <ul class="plain-list">${horizons || "<li>—</li>"}</ul>
      <p class="sub">30d/60d: requer extensão do export validado.</p>
    </section>`;
}
