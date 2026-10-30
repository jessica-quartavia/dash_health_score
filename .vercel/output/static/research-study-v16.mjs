/** Etapa 16 — modelagem avançada e validação temporal. */

function modelRows(candidates, ui) {
  return (candidates || [])
    .map((c) => {
      const t = c.test || {};
      return `<tr><td>${ui.escapeHtml(c.id)}</td><td>${ui.escapeHtml(c.family || "—")}</td><td class="num">${ui.formatNum(t.roc_auc, 3)}</td><td class="num">${ui.formatNum(t.pr_auc, 3)}</td><td class="num">${ui.formatNum(t.brier, 3)}</td><td class="num">${ui.fmt.format(t.n ?? "—")}</td></tr>`;
    })
    .join("");
}

function packRows(packs, ui) {
  return (packs || [])
    .map((p) => {
      if (p.skipped) {
        return `<tr><td>${ui.escapeHtml(p.pack_id)}</td><td colspan="3" class="note">${ui.escapeHtml(p.reason || "—")}</td></tr>`;
      }
      return `<tr><td>${ui.escapeHtml(p.pack_id)}</td><td class="num">${ui.formatNum(p.inner_val_roc_auc, 3)}</td><td class="num">${p.n_features ?? "—"}</td><td class="num">${ui.formatNum(p.C_selected_on_inner_val, 2)}</td></tr>`;
    })
    .join("");
}

export function renderResearchStudyV16(pack, ui) {
  if (!pack?.ok) {
    return `<section class="card"><h2>Etapa 16 — Modelagem avançada</h2><p class="note">${ui.escapeHtml(pack?.error || "Artefato ausente")}</p><p class="sub"><code>npm run model:study-v16</code></p></section>`;
  }
  const s = pack.study;
  const tv = s.temporal_validation || {};
  const rec = s.recommendation || {};
  const lim = s.operational_limitations || {};
  const paired = s.paired_tests?.logistic_best_minus_E || {};
  const sel = s.selected_feature_pack || {};

  const enrichRows = (s.enrichment_availability || [])
    .filter((r) => !r.in_export || !r.pit_usable)
    .slice(0, 12)
    .map(
      (r) =>
        `<tr><td>${ui.escapeHtml(r.group)}</td><td>${ui.escapeHtml(r.name)}</td><td>${r.in_export ? "sim" : "não"}</td><td class="num">${r.coverage != null ? ui.pctFmt.format(r.coverage * 100) + "%" : "—"}</td></tr>`,
    )
    .join("");

  const limItems = (lim.limitations_demonstrated || [])
    .map(
      (l) =>
        `<li><strong>${ui.escapeHtml(l.limitation)}</strong> — ${ui.escapeHtml(l.evidence)}. Impacto: ${ui.escapeHtml(l.impact)}</li>`,
    )
    .join("");

  const wf = (tv.walk_forward_backtests || [])
    .map((w) => `<li>${ui.escapeHtml(w.holdout_month)}: ROC ${ui.formatNum(w.roc_auc, 3)} (n=${w.n ?? "—"})</li>`)
    .join("");

  return `
    <section class="research-hero card">
      <p class="research-hero-eyebrow">Etapa 16 · modelagem avançada</p>
      <h1 class="research-hero-title">Churn 90d — melhor candidato sustentado pelos dados</h1>
      <p class="research-hero-lead">Validação temporal com hold-out <strong>${ui.escapeHtml(tv.holdout_month || "—")}</strong> · jun/2026 apenas referência histórica · sem probabilidades individuais.</p>
      <p class="sub">Status: ${ui.escapeHtml(rec.validation_status || "exploratory")} · ${ui.escapeHtml(rec.rationale || "")}</p>
    </section>
    <section class="card">
      <h2 class="research-section-title">Modelos comparados (exploratório)</h2>
      <table><thead><tr><th>ID</th><th>Família</th><th class="num">ROC-AUC</th><th class="num">PR-AUC</th><th class="num">Brier</th><th class="num">n</th></tr></thead>
      <tbody>${modelRows(s.models_compared, ui)}</tbody></table>
      <p class="note">Logística vs E (bootstrap cliente): ${ui.formatNum(paired.diff_mean, 4)} · IC95% [${ui.formatNum(paired.ci_low, 4)}, ${ui.formatNum(paired.ci_high, 4)}]</p>
      <p>${rec.keep_baseline ? "Referência operacional: <strong>Modelo E (Etapa 4)</strong>." : `Candidato experimental: ${ui.escapeHtml(rec.candidate_experimental || "—")}.`}</p>
    </section>
    <section class="card">
      <h2 class="research-section-title">Engenharia de variáveis (ganho incremental)</h2>
      <p class="sub">Pacote selecionado: ${ui.escapeHtml(sel.id || "—")} · C=${ui.formatNum(sel.C, 2)}</p>
      <table><thead><tr><th>Pacote</th><th class="num">ROC val. interna</th><th class="num"># feat.</th><th class="num">C</th></tr></thead><tbody>${packRows(s.feature_pack_comparison, ui)}</tbody></table>
    </section>
    <section class="card">
      <h2 class="research-section-title">Auditoria de dados</h2>
      <ul class="plain-list">
        <li>Observações elegíveis: ${ui.fmt.format(s.dataset_audit?.observations_eligible_90d ?? "—")}</li>
        <li>Episódios churn_consolidado: ${ui.fmt.format(s.dataset_audit?.churn_episode_rows ?? "—")} (confirmados: ${ui.fmt.format(s.dataset_audit?.churn_episodes_confirmed ?? "—")})</li>
        <li>Clientes únicos no frame: ${ui.fmt.format(s.dataset_audit?.unique_clients_in_model_frame ?? "—")}</li>
        <li>Proxy reativação pre_audit (≠ episódios): ${ui.fmt.format(s.dataset_audit?.pre_audit_crosswalk?.reactivated_proxy_multi_month_span ?? "—")}</li>
      </ul>
    </section>
    <section class="card">
      <h2 class="research-section-title">Cobertura — variáveis não exportadas</h2>
      <table><thead><tr><th>Grupo</th><th>Variável</th><th>Export</th><th class="num">Cobertura</th></tr></thead><tbody>${enrichRows || "<tr><td colspan=\"4\">Todas auditadas presentes</td></tr>"}</tbody></table>
    </section>
    <section class="card">
      <h2 class="research-section-title">Estabilidade temporal (backtests)</h2>
      <ul class="plain-list">${wf || "<li>—</li>"}</ul>
      <p class="sub">${ui.escapeHtml(tv.split_note || "")}</p>
    </section>
    <section class="card research-limitations-card">
      <h2 class="research-section-title">${ui.escapeHtml(lim.title || "Limitações")}</h2>
      <ul class="plain-list">${limItems}</ul>
      <p>${ui.escapeHtml(lim.executive_conclusion || "")}</p>
    </section>`;
}
