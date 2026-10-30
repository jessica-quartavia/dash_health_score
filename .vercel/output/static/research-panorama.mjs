/** Laboratório Preditivo — visão executiva (Panorama). */

import { formatCount, formatPercentFromRate, finiteNumber } from "../lib/frontend/display-format.mjs";
import {
  EXECUTIVE_INTRO,
  executiveChips,
  buildExecutiveConclusion,
  insightHsBands,
  insightSimpleBands,
  insightProfiles,
  insightModels,
  LIMITATIONS_PLAIN,
} from "./research-executive.mjs";

export function churnBandBars(bands, ui, { valueKey = "churnRate" } = {}) {
  if (!bands?.length) return `<p class="empty">Sem faixas no recorte.</p>`;
  const rows = bands
    .filter((b) => b.band !== "insuficiente")
    .map((b) => {
      const rate = finiteNumber(b[valueKey]);
      const pct = rate != null ? rate * 100 : null;
      const lo = finiteNumber(b.ciLow);
      const hi = finiteNumber(b.ciHigh);
      const ci = lo != null && hi != null ? ` IC ${ui.pctFmt.format(lo * 100)}–${ui.pctFmt.format(hi * 100)}%` : "";
      const meta = b.lowSample
        ? `n=${formatCount(ui.fmt, b.n)} · amostra pequena`
        : `${formatCount(ui.fmt, b.n)} obs · ${formatCount(ui.fmt, b.uniqueClients)} clientes · ${pct != null ? formatPercentFromRate(ui.pctFmt, rate) : "—"} churn${ci}`;
      return {
        label: b.band,
        count: b.n,
        percent: pct ?? 0,
        meta,
        tone: pct != null && pct >= 30 ? "critical" : pct != null && pct >= 15 ? "attention" : "healthy",
      };
    });
  return ui.bars(rows, "percent");
}

export function renderEmHeatmap(matrix, ui) {
  if (!matrix?.length) return `<p class="empty">Matriz indisponível — gere dataset_preditivo_validado.csv</p>`;
  const eVals = [...new Set(matrix.map((c) => c.e))].sort((a, b) => a - b);
  const mVals = [...new Set(matrix.map((c) => c.m))].sort((a, b) => a - b);
  const lookup = new Map(matrix.map((c) => [`${c.e}|${c.m}`, c]));
  let maxRate = 0;
  for (const c of matrix) {
    const r = finiteNumber(c.churnRate);
    if (!c.suppressed && r != null) maxRate = Math.max(maxRate, r);
  }
  if (!maxRate) maxRate = 0.4;
  const head = `<tr><th>E \\ M</th>${mVals.map((m) => `<th class="num">M=${m}</th>`).join("")}</tr>`;
  const body = eVals
    .map((e) => {
      const cells = mVals
        .map((m) => {
          const c = lookup.get(`${e}|${m}`) || { n: 0, suppressed: true };
          if (!c.n) return `<td class="heat-cell empty" title="Sem observações">—</td>`;
          if (c.suppressed) {
            return `<td class="heat-cell low-n" title="n=${c.n} — amostra insuficiente">${formatCount(ui.fmt, c.n)} obs</td>`;
          }
          const rate = finiteNumber(c.churnRate) ?? 0;
          const intensity = Math.min(1, rate / maxRate);
          const bg = `rgba(232, 93, 58, ${0.12 + intensity * 0.55})`;
          const tip = `E=${e} M=${m} · n=${c.n} · ${formatPercentFromRate(ui.pctFmt, rate)} churn · ${formatCount(ui.fmt, c.uniqueClients)} clientes`;
          return `<td class="heat-cell" style="background:${bg}" title="${ui.escapeHtml(tip)}"><span class="heat-val">${formatPercentFromRate(ui.pctFmt, rate)}</span><span class="heat-n">${formatCount(ui.fmt, c.n)}</span></td>`;
        })
        .join("");
      return `<tr><th>E=${e}</th>${cells}</tr>`;
    })
    .join("");
  return `<div class="table-wrap table-flat heat-matrix-wrap"><table class="heat-matrix"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function chartCard(title, subtitle, chartHtml, insight, ui) {
  return `<article class="card research-chart-card">
    <h2>${ui.escapeHtml(title)}</h2>
    <p class="sub">${ui.escapeHtml(subtitle)}</p>
    ${chartHtml}
    <p class="chart-insight">${ui.escapeHtml(insight)}</p>
  </article>`;
}

function artifactListHtml(panorama, ui) {
  const missing = panorama.artifacts?.missing || panorama.descriptiveAvailability?.missingArtifacts || [];
  if (!missing.length) return "";
  const items = missing.slice(0, 8).map((p) => `<li><code>${ui.escapeHtml(p)}</code></li>`).join("");
  return `<p class="sub">Arquivos ausentes:</p><ul class="plain-list">${items}</ul>`;
}

function availabilityBanner(panorama, ui) {
  const av = panorama.descriptiveAvailability || {};
  if (av.ok === true) return "";
  if (av.ok === "partial" && panorama.descriptive?.partialNote) {
    const cmd = av.regenerateCommand ? `<p class="sub">Comando: <code>${ui.escapeHtml(av.regenerateCommand)}</code></p>` : "";
    return `<section class="alert alert-warning" role="status"><p class="alert-title">Dataset parcial</p><p>${ui.escapeHtml(panorama.descriptive.partialNote)}</p>${cmd}${artifactListHtml(panorama, ui)}</section>`;
  }
  if (!panorama.descriptive) {
    const msg = av.message || av.hint || "Artefatos históricos indisponíveis neste ambiente.";
    const reason = av.reason ? `${av.reason}` : "unknown";
    const cmd = av.regenerateCommand ? `<p class="sub">Regenerar: <code>${ui.escapeHtml(av.regenerateCommand)}</code></p>` : "";
    const models = panorama.modelsAvailable
      ? `<p class="note">Detalhes do modelo de referência: aba <strong>Modelo escolhido e limitações</strong>.</p>`
      : "";
    return `<section class="alert alert-critical" role="status"><p class="alert-title">Agregados indisponíveis</p><p>${ui.escapeHtml(msg)}</p><p class="sub">Motivo: <code>${ui.escapeHtml(reason)}</code></p>${cmd}${artifactListHtml(panorama, ui)}${models}</section>`;
  }
  return "";
}

function executiveHero(k, ui) {
  const chips = executiveChips(finiteNumber(k.horizonDays) ?? 90)
    .map(
      (c) =>
        `<span class="research-chip${c.tone === "warn" ? " research-chip-warn" : ""}"><span class="research-chip-label">${ui.escapeHtml(c.label)}</span><span class="research-chip-value">${ui.escapeHtml(c.value)}</span></span>`,
    )
    .join("");
  return `<section class="research-hero card">
    <div class="research-hero-top">
      <div>
        <p class="research-hero-eyebrow">Laboratório Preditivo · pesquisa histórica</p>
        <h1 class="research-hero-title">Relacionamento e cancelamento nos 90 dias seguintes</h1>
        <p class="research-hero-lead">${ui.escapeHtml(EXECUTIVE_INTRO)}</p>
      </div>
      <button type="button" class="btn btn-report btn-lg" id="btnPanoramaReport" title="Gera HTML para salvar como PDF (Imprimir → Salvar como PDF)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3v12m0 0l4-4m-4 4l-4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>
        Baixar relatório executivo
      </button>
    </div>
    <div class="research-chips" role="list">${chips}</div>
    <p class="sub research-frozen-note">Agregados históricos calculados com HS 50/50 congelado na exportação — independente dos pesos operacionais ajustados no topo do painel.</p>
  </section>`;
}

function renderChurnRateAuditSection(audit, ui) {
  if (!audit?.ok) {
    return `<section class="card research-audit-card"><h2 class="research-section-title">Auditoria da taxa histórica</h2><p class="note">Artefato pre_audit.json necessário para comparar denominadores.</p></section>`;
  }
  const m = audit.measures || {};
  const fmtPct = (r) => (r == null ? "—" : ui.pctFmt.format(r * 100) + "%");
  const rows = [
    ["Por observação cliente-mês (rotulada 90d)", fmtPct(m.rateByObservationClientMonth), `${m.positiveRows ?? "—"} / ${m.labeledRows ?? "—"} linhas`],
    ["Por cliente único (≥1 mês positivo no estudo)", fmtPct(m.rateByUniqueClientWithOutcome), `${m.uniqueClientsChurnOutcome ?? "—"} / ${m.uniqueClientsLabeled90d ?? "—"} clientes`],
    ["Sensibilidade sem conflitos de data", fmtPct(m.rateSensitivityExcludeDateConflicts), "Mesma ordem de grandeza se conflitos forem poucos"],
    ["Prevalência hold-out treino (congelado)", fmtPct(m.prevalenceTrainHoldout), "Desenho temporal — não é carteira atual"],
    ["Prevalência hold-out teste jun/2026", fmtPct(m.prevalenceTestHoldout), "Usado nos modelos A–E — não reutilizar como confirmação"],
  ];
  const table = `<table class="table-compact"><thead><tr><th>Medida</th><th class="num">Taxa</th><th>Leitura</th></tr></thead><tbody>${rows
    .map(([a, b, c]) => `<tr><td>${ui.escapeHtml(a)}</td><td class="num">${ui.escapeHtml(b)}</td><td class="sub">${ui.escapeHtml(c)}</td></tr>`)
    .join("")}</tbody></table>`;
  const confirmed = (audit.confirmed || []).map((t) => `<li>${ui.escapeHtml(t)}</li>`).join("");
  const exploratory = (audit.exploratory || []).map((t) => `<li>${ui.escapeHtml(t)}</li>`).join("");
  return `<section class="card research-audit-card">
    <h2 class="research-section-title">Auditoria econométrica — por que ~30,6%?</h2>
    <p class="sub">Separamos <strong>churn observado no passado</strong> (taxas agregadas) de <strong>discriminação</strong> (modelos) e de <strong>probabilidade calibrada</strong> (ainda não operacional).</p>
    ${table}
    <div class="grid cards-2" style="margin-top:12px">
      <article><h3 class="section-heading-sm">Confirmado nos artefatos</h3><ul class="plain-list">${confirmed || "<li>—</li>"}</ul></article>
      <article><h3 class="section-heading-sm">Exploratório / interpretação</h3><ul class="plain-list">${exploratory || "<li>—</li>"}</ul></article>
    </div>
    <p class="note">${ui.escapeHtml(audit.calibrationNote || "")}</p>
  </section>`;
}

function renderDatasetReconciliationSection(recon, ui) {
  if (!recon?.ok) return "";
  const rows = (recon.rows || [])
    .map(
      (r) =>
        `<tr><td>${ui.escapeHtml(r.label)}</td><td class="num">${r.observations != null ? ui.fmt.format(r.observations) : "—"}</td><td class="num">${r.rate != null ? ui.pctFmt.format(r.rate * 100) + "%" : "—"}</td><td>${ui.escapeHtml(r.population)}</td></tr>`,
    )
    .join("");
  const notes = (recon.notes || []).map((n) => `<li>${ui.escapeHtml(n)}</li>`).join("");
  return `<section class="card">
    <h2 class="research-section-title">Versões dos dados (reconciliação)</h2>
    <p class="sub">Cada número abaixo usa denominador explícito — não misturar 12.596 rotuladas com 14.609 do frame Etapa 16 ou ~18.638 linhas HS.</p>
    <table><thead><tr><th>Fonte</th><th class="num">Obs.</th><th class="num">Taxa</th><th>População</th></tr></thead><tbody>${rows}</tbody></table>
    <ul class="plain-list">${notes}</ul>
  </section>`;
}

function executiveKpiStrip(k, panorama, ui) {
  const fmtN = (n) => formatCount(ui.fmt, n);
  const fmtPct = (rate) => formatPercentFromRate(ui.pctFmt, rate);
  const refLabel = k.referenceModelId
    ? `Modelo ${k.referenceModelId} — ${k.referenceModelLabel || "experimental"}`
    : "Modelo E — baseline experimental";
  const conclusion = buildExecutiveConclusion(panorama);
  return `<section class="research-exec-summary card">
    <h2 class="research-section-title">Resumo executivo</h2>
    <div class="grid kpis kpis-3 research-exec-kpis">
      ${ui.kpi("Clientes analisados", fmtN(k.uniqueClientsResearch), "Únicos no export validado")}
      ${ui.kpi("Com churn observado", fmtN(k.uniqueClientsChurnConfirmed), "Desfecho confirmado no estudo")}
      ${ui.kpi("Observações rotuladas 90d", fmtN(k.observationsLabeled90d), `pre_audit · ${fmtN(k.censored90d)} censuradas (≈18,6 mil linhas HS totais)`)}
      ${ui.kpi("Taxa histórica observada", fmtPct(k.observedChurnRate90d), "Por linha cliente-mês rotulada")}
      ${ui.kpi("Referência de pesquisa", ui.escapeHtml(refLabel), "Não operacional · hold-out jun/2026 exploratório")}
      ${ui.kpi("Horizonte da análise", `${fmtN(k.horizonDays)} dias`, "Cancelamento dentro da janela")}
    </div>
    <div class="research-exec-conclusion">
      <h3>Conclusão em linguagem simples</h3>
      <p>${ui.escapeHtml(conclusion)}</p>
    </div>
  </section>`;
}

/** Detalhes técnicos — aba Metodologia avançada. */
export function renderPanoramaTechnicalAppendix(panorama, ui) {
  if (!panorama?.descriptive) return `<p class="note">Carregue a visão executiva primeiro ou aguarde os agregados.</p>`;
  const d = panorama.descriptive;
  const k = panorama.kpis || {};
  const fmtN = (n) => formatCount(ui.fmt, n);
  const weightBars = (panorama.weightGrid || [])
    .filter((g) => finiteNumber(g.rocAucTest) != null)
    .map((g) => ({
      label: `${g.engagementPercent}/${g.mechanismPercent}${g.official ? " ★ oficial" : ""}`,
      value: g.rocAucTest,
      meta: `PR ${ui.formatNum(g.prAucTest, 3)}`,
    }));
  const limitations = (panorama.limitations || []).map((l) => `<li>${ui.escapeHtml(l)}</li>`).join("");
  return `
    ${ui.card("Matriz E × M (detalhe)", "Células pequenas suprimem taxa", renderEmHeatmap(d.emMatrix, ui))}
    ${ui.card("Ponderações E/M vs desempenho", "Exploratório — ★ = 50/50 oficial V1", weightBars.length ? ui.hBarMetrics(weightBars, { format: (v) => ui.formatNum(v, 3) }) : `<p class="note">hs_weight_study.json</p>`)}
    ${ui.card("Notas metodológicas (artefatos)", "Censura, hold-out, elegibilidade", `<p class="sub">${ui.escapeHtml(panorama.methodologyNote || "")}</p><ul class="plain-list">${limitations}</ul><p class="note">${fmtN(k.observationsHistorical)} linhas históricas · ${fmtN(k.observationsLabeled90d)} rotuladas 90d · ${fmtN(k.churnEvents90d)} eventos positivos (linhas).</p>`)}
  `;
}

export function renderResearchPanorama(panorama, ui, { onReport } = {}) {
  if (!panorama) {
    return {
      html: `<section class="research-hero card"><h1 class="research-hero-title">Laboratório Preditivo</h1><p class="note">Carregando resultados do estudo…</p></section>`,
      bind: () => {},
    };
  }
  if (panorama.error) {
    const av = panorama.descriptiveAvailability || {};
    return {
      html: `<section class="card error-state"><h2>Estudo indisponível</h2><p>${ui.escapeHtml(panorama.error)}</p><p class="sub">${ui.escapeHtml(av.message || "")}</p>${availabilityBanner(panorama, ui)}</section>`,
      bind: () => {},
    };
  }

  const k = panorama.kpis || {};
  const d = panorama.descriptive || {};
  const fmtN = (n) => formatCount(ui.fmt, n);

  const profileBars = (panorama.profiles || []).slice(0, 6).map((p) => {
    const rate = finiteNumber(p.churnRate) ?? 0;
    return {
      label: p.id.replace(/_/g, " "),
      count: p.observations,
      percent: rate * 100,
      meta: `${fmtN(p.observations)} obs · ${formatPercentFromRate(ui.pctFmt, rate)} churn`,
    };
  });

  const limitsHtml = LIMITATIONS_PLAIN.map((line) => `<li>${ui.escapeHtml(line)}</li>`).join("");

  const html = `
    ${executiveHero(k, ui)}
    ${availabilityBanner(panorama, ui)}
    ${executiveKpiStrip(k, panorama, ui)}
    <p class="sub research-frozen-caption">Gráficos abaixo: base histórica congelada (export validado) — não refletem filtros da carteira operacional de hoje.</p>
    <section class="research-section-head"><h2 class="research-section-title">Churn observado no passado</h2><p class="sub">${fmtN(d.observations)} observações · ${ui.escapeHtml(d.filterLabel || "amostra rotulada 90d")}</p></section>
    <section class="grid cards-2 research-charts-grid">
      ${chartCard("Health Score e churn observado", "Quanto menor a faixa de HS, maior tendeu a ser o cancelamento nos 90 dias seguintes.", churnBandBars(d.hsBands, ui), insightHsBands(d.hsBands), ui)}
      ${chartCard("Engajamento (E) e churn observado", "Reuniões e presença histórica resumidas na nota E.", churnBandBars(d.eBands, ui), insightSimpleBands(d.eBands, "E"), ui)}
    </section>
    <section class="grid cards-2 research-charts-grid">
      ${chartCard("Mecanismos (M) e churn observado", "Mecanismos implantados no ponto histórico — distingue ausência de vínculo.", churnBandBars(d.mBands, ui), insightSimpleBands(d.mBands, "M"), ui)}
      ${chartCard("Perfis com maior churn observado", "Combinações de fase e qualidade de dados (exploratório).", profileBars.length ? ui.bars(profileBars, "percent") : `<p class="empty">Sem perfis neste ambiente.</p>`, insightProfiles(panorama.profiles), ui)}
    </section>
    <details class="card research-audit-fold"><summary>Reconciliação de denominadores e auditoria (detalhe)</summary>
      ${renderDatasetReconciliationSection(panorama.datasetReconciliation, ui)}
      ${renderChurnRateAuditSection(panorama.churnRateAudit, ui)}
    </details>
    <section class="card research-limits-card">
      <h2 class="research-section-title">O que isso não significa</h2>
      <ul class="plain-list research-limits-list">${limitsHtml}</ul>
      <p class="sub">Modelo de referência, métricas e limitações detalhadas: aba <strong>Modelo escolhido e limitações</strong>.</p>
    </section>`;

  return {
    html,
    bind(root) {
      root.querySelector("#btnPanoramaReport")?.addEventListener("click", async () => {
        const btn = root.querySelector("#btnPanoramaReport");
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        btn.classList.add("is-loading");
        try {
          const result = await Promise.resolve(onReport?.());
          if (result && typeof result.ok === "boolean" && typeof window !== "undefined") {
            const ev = new CustomEvent("ha:report-result", { detail: result });
            window.dispatchEvent(ev);
          }
        } finally {
          btn.disabled = false;
          btn.classList.remove("is-loading");
        }
      });
    },
  };
}
