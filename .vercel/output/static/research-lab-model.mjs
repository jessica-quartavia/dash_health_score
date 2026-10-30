/** Aba "Modelo escolhido e limitações". */

function fmtMetric(ui, v, d = 3) {
  return ui.formatNum(v, d);
}

function metricsTable(ui, block) {
  if (!block) return "<p class=\"note\">—</p>";
  return `<table class="table-compact"><tbody>
    <tr><td>Período</td><td>${ui.escapeHtml(block.period)} · ${ui.escapeHtml(block.label || "")}</td></tr>
    <tr><td>ROC-AUC</td><td class="num">${fmtMetric(ui, block.rocAuc)}</td></tr>
    <tr><td>PR-AUC</td><td class="num">${fmtMetric(ui, block.prAuc)}</td></tr>
    <tr><td>Brier</td><td class="num">${fmtMetric(ui, block.brier)}</td></tr>
    <tr><td>Log loss</td><td class="num">${fmtMetric(ui, block.logLoss)}</td></tr>
    <tr><td>n</td><td class="num">${ui.fmt.format(block.n ?? "—")}</td></tr>
  </tbody></table><p class="sub">Fonte: ${ui.escapeHtml(block.source || "—")}</p>`;
}

function limitationList(items, ui) {
  return (items || [])
    .map(
      (l) =>
        `<li><strong>${ui.escapeHtml(l.limitation || l.title || "")}</strong> — ${ui.escapeHtml(l.evidence || l.text || "")}. <em>Impacto:</em> ${ui.escapeHtml(l.impact || "")}</li>`,
    )
    .join("");
}

function renderRiskGroupChart(groups, ui) {
  if (!groups?.length) return "<p class=\"note\">Grupos de risco indisponíveis (amostra insuficiente).</p>";
  const maxRate = Math.max(...groups.map((g) => Math.max(g.observed_rate || 0, g.pred_mean || 0)), 0.01);
  const bars = groups
    .map((g) => {
      const obsH = Math.round(((g.observed_rate || 0) / maxRate) * 100);
      const predH = Math.round(((g.pred_mean || 0) / maxRate) * 100);
      const obsPct = g.observed_rate != null ? `${(g.observed_rate * 100).toFixed(1)}%` : "—";
      const predPct = g.pred_mean != null ? `${(g.pred_mean * 100).toFixed(1)}%` : "—";
      return `<div class="calib-group-row">
        <span class="calib-group-label">${ui.escapeHtml(g.label || `G${g.group}`)}</span>
        <div class="calib-bar-stack" title="n=${g.n ?? "—"}">
          <div class="calib-bar calib-bar-obs" style="width:${obsH}%"><span>${obsPct}</span></div>
          <div class="calib-bar calib-bar-pred" style="width:${predH}%"><span>${predPct}</span></div>
        </div>
      </div>`;
    })
    .join("");
  return `<div class="calib-chart">${bars}</div>
    <p class="sub calib-legend"><span class="calib-swatch calib-bar-obs"></span> Churn observado (grupo) · <span class="calib-swatch calib-bar-pred"></span> Risco médio previsto (Modelo E)</p>`;
}

function renderCalibrationTrustSection(e17, ui) {
  if (!e17 || e17.status !== "ok") {
    return `<section class="card">
      <h2 class="research-section-title">Podemos confiar nas probabilidades?</h2>
      <p class="note">${ui.escapeHtml(e17?.summary || "Etapa 17 não processada — execute npm run model:study-v17.")}</p>
    </section>`;
  }
  const rows = (e17.experiments || [])
    .map(
      (e) =>
        `<tr><td>${ui.escapeHtml(e.label || e.id)}</td><td class="num">${ui.formatNum(e.rocAuc)}</td><td class="num">${ui.formatNum(e.brier)}</td><td class="num">${e.probMean != null ? (e.probMean * 100).toFixed(1) + "%" : "—"}</td><td class="num">${e.prevalence != null ? (e.prevalence * 100).toFixed(1) + "%" : "—"}</td></tr>`,
    )
    .join("");
  const diag = e17.diagnosis || {};
  return `<section class="card research-calibration-card">
    <h2 class="research-section-title">Podemos confiar nas probabilidades?</h2>
    <p class="research-calib-lead"><strong>Ranking ≠ probabilidade calibrada.</strong> ROC-AUC mede se quem cancelou tende a receber scores mais altos; Brier mede se os percentuais previstos batem com a taxa real observada.</p>
    <p>${ui.escapeHtml(diag.why_high_auc_low_brier_vs_prevalence || "")}</p>
    <p class="note">${ui.escapeHtml(diag.class_weight_balanced || e17.temporalNote || "")}</p>
    <p><strong>Conclusão Etapa 17 (${ui.escapeHtml(e17.conclusionLetter || "—")}):</strong> ${ui.escapeHtml(e17.conclusionSummary || "")}</p>
    ${renderRiskGroupChart(e17.riskGroupsE, ui)}
    <table class="table-compact"><thead><tr><th>Variante</th><th class="num">ROC-AUC</th><th class="num">Brier</th><th class="num">Média prevista</th><th class="num">Prevalência teste</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="sub">Mês de diagnóstico: ${ui.escapeHtml(e17.evaluationMonth || "—")} — exploratório (jun/jul/2026 já usados em etapas anteriores).</p>
  </section>`;
}

function sourcesBanner(sources, ui) {
  if (!sources) return "";
  const rows = Object.entries(sources)
    .map(
      ([k, s]) =>
        `<tr><td>${ui.escapeHtml(k)}</td><td>${s.ok ? "OK" : "ausente"}</td><td><code>${ui.escapeHtml(s.path || "")}</code></td></tr>`,
    )
    .join("");
  return `<details class="research-sources-fold"><summary>Artefatos carregados (versionados)</summary>
    <table><thead><tr><th>Estudo</th><th>Status</th><th>Arquivo</th></tr></thead><tbody>${rows}</tbody></table></details>`;
}

export function renderResearchLabModel(pack, ui) {
  const data = pack?.labPack || pack?.labReference || null;

  if (pack?.loading) {
    return `<section class="card"><h2>Modelo de referência</h2><p class="note">Carregando resultados das Etapas 4, 15 e 16…</p></section>`;
  }

  const ref = data?.referenceModel;
  if (!ref) {
    const err = data?.error || pack?.error || "Não foi possível montar o pacote de modelagem.";
    return `<section class="card error-state"><h2>Modelo de referência</h2><p>${ui.escapeHtml(err)}</p>
      ${sourcesBanner(data?.sources, ui)}
      <p class="sub">Verifique <code>/api/predictive-lab-reference</code> com o servidor <code>npm run dev</code>.</p></section>`;
  }

  const sel = data.selection || {};
  const e15 = data.etapa15;
  const e16 = data.etapa16;
  const e17 = data.etapa17;
  const numFeat = (ref.features?.numeric || []).join(", ");
  const catFeat = (ref.features?.categorical || []).join(", ");

  const altRows = (data.etapa4Ranking || pack?.panorama?.models || [])
    .map(
      (x) =>
        `<tr><td>${ui.escapeHtml(x.id)}</td><td>${ui.escapeHtml(x.label || "")}</td><td class="num">${fmtMetric(ui, x.rocAuc)}</td><td class="num">${fmtMetric(ui, x.prAuc)}</td><td class="num">${x.brier != null ? fmtMetric(ui, x.brier) : "—"}</td><td>${ui.escapeHtml(x.period || "jun/2026")}</td></tr>`,
    )
    .join("");

  const v16Rows = (e16?.modelsCompared || [])
    .map(
      (c) =>
        `<tr><td>${ui.escapeHtml(c.id)}</td><td>${ui.escapeHtml(c.family || "")}</td><td class="num">${fmtMetric(ui, c.rocAuc)}</td><td class="num">${fmtMetric(ui, c.brier)}</td><td>${ui.escapeHtml(c.period || e16.holdout || "—")}</td></tr>`,
    )
    .join("");

  const roadmap = (data.improvementRoadmap || [])
    .map((r) => `<li><strong>${ui.escapeHtml(r.step)}:</strong> ${ui.escapeHtml(r.text)}</li>`)
    .join("");

  const staticLim = [
    { limitation: "Histórico temporal curto", evidence: "Poucos meses com rótulo 90d maduro", impact: "Instabilidade entre hold-outs" },
    { limitation: "Repetição cliente-mês", evidence: "Mesmo cliente em vários meses", impact: "Intervalos de confiança otimistas se tratados como independentes" },
    { limitation: "Implantação vs pós-implantação", evidence: "Taxas observadas distintas por fase", impact: "Modelo global heterogêneo" },
    { limitation: "Mecanismos e reuniões", evidence: "Cobertura parcial no passado", impact: "E e M subestimados ou ausentes" },
    { limitation: "Migração cadastral", evidence: "Datas de ciclo vs created_at", impact: "Painel e tenure distorcidos" },
    { limitation: "Calibração", evidence: "Brier elevado vs prevalência", impact: "Probabilidades não calibradas para produção" },
    { limitation: "Validação prospectiva", evidence: "Sem freeze forward aprovado", impact: "Generalização não confirmada" },
  ];

  const v16Lim = e16?.status === "ok" ? e16.limitations : null;

  let v15Block = "";
  if (e15?.status === "ok") {
    const p = e15.pairedAucDiff || {};
    v15Block = `<section class="card">
      <h2 class="research-section-title">Etapa 15 — comparação alinhada</h2>
      <p>${ui.escapeHtml(e15.summary)}</p>
      <table><thead><tr><th>Modelo</th><th class="num">ROC-AUC</th><th class="num">Brier</th></tr></thead><tbody>
        <tr><td>E refit</td><td class="num">${fmtMetric(ui, e15.eRefit?.roc_auc)}</td><td class="num">${fmtMetric(ui, e15.eRefit?.brier)}</td></tr>
        <tr><td>V2 refit</td><td class="num">${fmtMetric(ui, e15.v2Refit?.roc_auc)}</td><td class="num">${fmtMetric(ui, e15.v2Refit?.brier)}</td></tr>
      </tbody></table>
      <p class="note">V2 − E (AUC): ${fmtMetric(ui, p.diff_mean, 4)} · IC95% [${fmtMetric(ui, p.ci_low, 4)}, ${fmtMetric(ui, p.ci_high, 4)}]</p>
    </section>`;
  } else {
    v15Block = `<section class="card"><h2 class="research-section-title">Etapa 15</h2><p class="note">${ui.escapeHtml(e15?.summary || "Indisponível.")}</p></section>`;
  }

  let v16Block = "";
  if (e16?.status === "ok") {
    v16Block = `<section class="card">
      <h2 class="research-section-title">Etapa 16 — validação (${ui.escapeHtml(e16.holdout || "—")})</h2>
      <p>${ui.escapeHtml(e16.recommendation?.rationale || sel.rationale || "")}</p>
      <p class="sub">${ui.escapeHtml(e16.splitNote || "")}</p>
      <table><thead><tr><th>Modelo</th><th>Família</th><th class="num">ROC</th><th class="num">Brier</th><th>Período</th></tr></thead><tbody>${v16Rows}</tbody></table>
    </section>`;
  } else {
    v16Block = `<section class="card"><h2 class="research-section-title">Etapa 16</h2><p class="note">${ui.escapeHtml(e16?.summary || "Pendente.")}</p></section>`;
  }

  return `
    ${sourcesBanner(data.sources, ui)}
    <section class="research-hero card research-hero-compact">
      <p class="research-hero-eyebrow">Referência experimental · horizonte ${ref.horizonDays ?? 90} dias</p>
      <h1 class="research-hero-title">Modelo ${ui.escapeHtml(ref.id)} — ${ui.escapeHtml(sel.chosenId === "E" ? "mantido pelas evidências" : "candidato em revisão")}</h1>
      <p class="research-hero-lead">${ui.escapeHtml(ref.statusPlain)}</p>
    </section>
    <section class="card">
      <h2 class="research-section-title">Modelo de referência</h2>
      <p><strong>Tipo:</strong> ${ui.escapeHtml(ref.algorithm)}</p>
      <p class="formula-block">${ui.escapeHtml(ref.formula)}</p>
      <p><strong>Variáveis:</strong> ${ui.escapeHtml(numFeat)}${catFeat ? ` · ${ui.escapeHtml(catFeat)}` : ""}</p>
      <div class="grid cards-2">
        <article><h3 class="section-heading-sm">Métricas — jun/2026 (Etapa 4)</h3>${metricsTable(ui, ref.metrics?.june2026Exploratory)}</article>
        <article><h3 class="section-heading-sm">Métricas — hold-out Etapa 16</h3>${metricsTable(ui, ref.metrics?.v16Holdout)}</article>
      </div>
    </section>
    <section class="card">
      <h2 class="research-section-title">Por que esse modelo foi escolhido?</h2>
      <p>${ui.escapeHtml(data.whyChosenPlain || "")}</p>
    </section>
    <section class="card">
      <h2 class="research-section-title">Comparação Etapa 4 (A–E, mesmo hold-out)</h2>
      <table><thead><tr><th>ID</th><th>Descrição</th><th class="num">ROC</th><th class="num">PR</th><th class="num">Brier</th><th>Período</th></tr></thead><tbody>${altRows || "<tr><td colspan='6'>—</td></tr>"}</tbody></table>
    </section>
    ${v15Block}
    ${v16Block}
    ${renderCalibrationTrustSection(e17, ui)}
    <section class="card research-limitations-card">
      <h2 class="research-section-title">Limitações</h2>
      <ul class="plain-list">${limitationList(v16Lim?.limitations_demonstrated || staticLim, ui)}</ul>
    </section>
    <section class="card">
      <h2 class="research-section-title">O que falta para o modelo ser confiável?</h2>
      <ul class="plain-list">${roadmap}</ul>
      <p>${ui.escapeHtml(v16Lim?.executive_conclusion || "HS operacional V1 50/50 permanece; churn preditivo só agregado em pesquisa.")}</p>
    </section>`;
}
