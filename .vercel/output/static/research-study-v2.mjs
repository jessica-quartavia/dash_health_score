/** Estudo Preditivo 2.0 — comparação de modelos (UI). */

import { finiteNumber } from "../lib/frontend/display-format.mjs";

function pct(fmt, rate) {
  if (rate == null || !Number.isFinite(rate)) return "—";
  return `${fmt.format(rate * 100)}%`;
}

export function renderResearchStudyV2(studyPack, ui) {
  if (!studyPack?.ok) {
    return `<section class="card error-state">
      <h2>Estudo Preditivo 2.0</h2>
      <p>${ui.escapeHtml(studyPack?.error || "Artefato não encontrado.")}</p>
      <p class="sub">Comando: <code>npm run model:study-v2</code> (após <code>npm run build:predictive-validated</code>).</p>
    </section>`;
  }
  const s = studyPack.study;
  const m = s.manifest || {};
  const baseline = s.baseline_etapa4?.test || {};
  const sel = s.selection || {};
  const candidates = s.candidates || [];

  const metricRows = candidates
    .map((c) => {
      const t = c.test || {};
      return `<tr>
        <td><strong>${ui.escapeHtml(c.id)}</strong><br/><span class="sub">${ui.escapeHtml(c.label || "")}</span></td>
        <td class="num">${ui.formatNum(t.roc_auc, 3)}</td>
        <td class="num">${ui.formatNum(t.pr_auc, 3)}</td>
        <td class="num">${ui.formatNum(t.brier, 3)}</td>
        <td class="num">${ui.formatNum(t.log_loss, 3)}</td>
        <td class="num">${pct(ui.pctFmt, t.prevalence)}</td>
        <td class="num">${ui.fmt.format(t.n ?? "—")}</td>
      </tr>`;
    })
    .join("");

  const baselineRow = `<tr class="baseline-row">
    <td><strong>${ui.escapeHtml(s.baseline_etapa4?.model_id || "Etapa 4")}</strong><br/><span class="sub">Baseline congelado (exploratório)</span></td>
    <td class="num">${ui.formatNum(baseline.roc_auc, 3)}</td>
    <td class="num">${ui.formatNum(baseline.pr_auc, 3)}</td>
    <td class="num">${ui.formatNum(baseline.brier, 3)}</td>
    <td class="num">${ui.formatNum(baseline.log_loss, 3)}</td>
    <td class="num">${pct(ui.pctFmt, baseline.prevalence)}</td>
    <td class="num">${ui.fmt.format(baseline.n ?? "—")}</td>
  </tr>`;

  const compareBars = candidates.map((c) => ({
    label: c.id.replace("v2_", ""),
    value: finiteNumber(c.test?.roc_auc) ?? 0,
    meta: `PR ${ui.formatNum(c.test?.pr_auc, 3)} · Brier ${ui.formatNum(c.test?.brier, 3)}`,
  }));

  const survival = (s.survival_descriptive || [])
    .map((row) => ({
      label: row.tenure_band,
      count: row.n,
      percent: (row.churn_rate_90d || 0) * 100,
      meta: `${ui.fmt.format(row.unique_clients)} clientes · ${pct(ui.pctFmt, row.churn_rate_90d)} churn 90d`,
    }));

  const auditList = (s.audit?.conclusions || []).map((t) => `<li>${ui.escapeHtml(t)}</li>`).join("");
  const limits = (m.limitations || []).map((t) => `<li>${ui.escapeHtml(t)}</li>`).join("");

  const reco =
    sel.recommended_candidate_id != null
      ? `<p class="note"><strong>Candidato exploratório:</strong> ${ui.escapeHtml(sel.recommended_candidate_id)} — ${ui.escapeHtml(sel.rationale || "")}</p>`
      : `<p class="note">${ui.escapeHtml(sel.rationale || "Nenhum candidato supera o baseline com margem suficiente.")}</p>`;

  return `
    <section class="research-hero card">
      <p class="research-hero-eyebrow">Estudo Preditivo 2.0 · ${ui.escapeHtml(m.state || "exploratory")}</p>
      <h1 class="research-hero-title">Comparação de modelos de churn (90 dias)</h1>
      <p class="research-hero-lead">Previsão agregada e experimental — <strong>sem probabilidade individual</strong> na operação. Horizonte ${s.horizon_days ?? 90} dias · população export validada.</p>
      <p class="sub">Processado: ${ui.escapeHtml(m.processed_at || s.generatedAt || "—")} · dataset hash ${ui.escapeHtml(m.dataset_hash_sha256_16 || "—")}</p>
    </section>
    <section class="card">
      <h2 class="research-section-title">O que estamos prevendo</h2>
      <p>Desfecho binário <strong>Y=1</strong> se churn confirmado nos 90 dias após a referência mensal; censura quando a janela não completa. Distinto de HS futuro.</p>
      <p class="sub">Treino: ${ui.escapeHtml((m.train_months || []).join(", ") || "—")} · Teste exploratório: ${ui.escapeHtml((m.test_months || []).join(", ") || "—")} (não confirmatório).</p>
    </section>
    <section class="card">
      <h2 class="research-section-title">Auditoria (Fase 1)</h2>
      <ul class="plain-list">${auditList || "<li>—</li>"}</ul>
    </section>
    <section class="card">
      <h2 class="research-section-title">Métricas no hold-out exploratório</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Modelo</th><th class="num">ROC-AUC</th><th class="num">PR-AUC</th><th class="num">Brier</th><th class="num">Log loss</th><th class="num">Prev. teste</th><th class="num">n</th></tr></thead>
        <tbody>${baselineRow}${metricRows}</tbody>
      </table></div>
      ${reco}
      ${compareBars.length ? ui.hBarMetrics(compareBars, { format: (v) => ui.formatNum(v, 3) }) : ""}
    </section>
    ${survival.length ? `<section class="card"><h2 class="research-section-title">Sobrevivência observada (proxy tenure)</h2><p class="sub">Taxa de churn 90d por tempo no painel — descritivo, não previsão operacional.</p>${ui.bars(survival, "percent")}</section>` : ""}
    <section class="card research-limits-card">
      <h2 class="research-section-title">Limitações e governança</h2>
      <ul class="plain-list">${limits}</ul>
      <p class="sub">Aprovação: ${ui.escapeHtml(m.approval || "none")} · HS futuro: ${s.hs_future?.model_validated ? "em estudo" : "baseline = HS atual"}</p>
    </section>`;
}
