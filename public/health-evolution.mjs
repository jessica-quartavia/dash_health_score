/** Saúde e Evolução — painel gerencial (distinto da Carteira). */

import { HEALTH_LEVEL_ORDER, evolutionInsufficientMessage } from "../lib/frontend/health-evolution-analytics.mjs";

const HEALTH_COLORS = {
  Saudável: "var(--healthy)",
  Atenção: "var(--attention-bar)",
  Crítico: "var(--critical)",
  "Em implantação": "#94a3b8",
  "Sem registro": "#cbd5e1",
};

function hBarRow(label, value, max, { suffix = "", color = "var(--accent)", title = "" } = {}) {
  const w = max ? Math.max(2, (value / max) * 100) : 0;
  return `<div class="hbar-row" title="${title}">
    <span class="hbar-label">${label}</span>
    <span class="hbar-track"><i style="width:${w}%;background:${color}"></i></span>
    <span class="hbar-val">${suffix || value}</span>
  </div>`;
}

export function healthDistributionBar(items, helpers) {
  const { fmt, pctFmt, escapeHtml } = helpers;
  const map = new Map((items || []).map((i) => [i.label, i]));
  const ordered = HEALTH_LEVEL_ORDER.map((label) => map.get(label) || { label, count: 0, percent: 0 }).filter((i) => i.count > 0);
  const total = ordered.reduce((s, i) => s + i.count, 0);
  if (!total) return `<p class="empty">Sem clientes no recorte.</p>`;
  const bar = ordered
    .map((item) => {
      const w = (item.count / total) * 100;
      const bg = HEALTH_COLORS[item.label] || "#cbd5e1";
      return `<div class="stack-seg" style="width:${w}%;background:${bg}" title="${escapeHtml(item.label)}: ${fmt.format(item.count)}"></div>`;
    })
    .join("");
  const legend = ordered
    .map((item) => {
      const bg = HEALTH_COLORS[item.label] || "#cbd5e1";
      return `<span class="stack-legend-item"><i style="background:${bg}"></i>${escapeHtml(item.label)} <strong>${fmt.format(item.count)}</strong> (${pctFmt.format(item.percent ?? (item.count / total) * 100)}%)</span>`;
    })
    .join("");
  return `<div class="stack-chart health-dist-chart health-dist-chart-lg"><div class="stack-bar">${bar}</div><div class="stack-legend">${legend}</div></div>`;
}

function compositionSection(composition, helpers) {
  const { fmt, formatNum, escapeHtml, tipIcon } = helpers;
  const maxE = Math.max(1, ...composition.levels.map((l) => l.avgE || 0));
  const maxM = Math.max(1, ...composition.levels.map((l) => l.avgM || 0));
  const eRows = composition.levels
    .map((l) =>
      hBarRow(escapeHtml(l.label), l.avgE ?? 0, maxE, {
        suffix: formatNum(l.avgE, 0),
        color: HEALTH_COLORS[l.label] || "#64748b",
        title: `${l.n} clientes`,
      }),
    )
    .join("");
  const mRows = composition.levels
    .map((l) =>
      hBarRow(escapeHtml(l.label), l.avgM ?? 0, maxM, {
        suffix: formatNum(l.avgM, 0),
        color: HEALTH_COLORS[l.label] || "#64748b",
      }),
    )
    .join("");
  const cov = composition.coverage;
  return `
    <section class="card health-section">
      <h3 class="section-heading-sm">O que compõe a saúde? ${tipIcon("engajamento")}</h3>
      <p class="sub">Médias de E e M por nível de saúde no recorte — leitura descritiva, não causal.</p>
      <div class="health-two-col">
        <div>
          <h4 class="health-subhead">Engajamento médio (E) por nível</h4>
          <div class="hbar-chart">${eRows || "<p class='empty'>—</p>"}</div>
        </div>
        <div>
          <h4 class="health-subhead">Mecanismos médios (M) por nível</h4>
          <div class="hbar-chart">${mRows || "<p class='empty'>—</p>"}</div>
        </div>
      </div>
      <div class="health-signal-grid">
        <div class="signal-card">
          <span class="signal-k">Sem reuniões registradas</span>
          <strong>${fmt.format(cov.semReuniaoObservada.count)}</strong>
          <span class="sub">${cov.semReuniaoObservada.percent}% do recorte</span>
        </div>
        <div class="signal-card">
          <span class="signal-k">Sem mecanismos implantados</span>
          <strong>${fmt.format(cov.semMecanismoImplantado.count)}</strong>
          <span class="sub">${cov.semMecanismoImplantado.percent}% do recorte</span>
        </div>
      </div>
      <p class="note">${escapeHtml(cov.nota)}</p>
    </section>`;
}

function programSection(programStats, helpers) {
  const { fmt, formatNum, escapeHtml } = helpers;
  if (!programStats.length) return "";
  const maxHs = Math.max(1, ...programStats.map((p) => p.hsMedio || 0));
  const rows = programStats
    .slice(0, 8)
    .map((p) => {
      const warn = p.smallSample ? `<span class="tag tag-neutral">n pequeno (${p.n})</span>` : "";
      return `<div class="health-program-row">
        ${hBarRow(`${escapeHtml(p.program)} ${warn}`, p.hsMedio ?? 0, maxHs, { suffix: formatNum(p.hsMedio, 1) })}
        <div class="mini-stack">${miniClassStack(p.distribution)}</div>
      </div>`;
    })
    .join("");
  return `
    <section class="card health-section">
      <h3 class="section-heading-sm">Saúde por programa</h3>
      <p class="sub">HS médio e mix de classificações — grupos com menos de 3 clientes sinalizados.</p>
      <div class="hbar-chart health-program-chart">${rows}</div>
    </section>`;
}

function miniClassStack(distribution) {
  const total = distribution.reduce((s, d) => s + d.count, 0) || 1;
  return `<div class="stack-bar stack-bar-thin">${distribution
    .map((d) => {
      const w = (d.count / total) * 100;
      const bg = HEALTH_COLORS[d.label] || "#e2e8f0";
      return `<div class="stack-seg" style="width:${w}%;background:${bg}" title="${d.label}"></div>`;
    })
    .join("")}</div>`;
}

function epSection(epStats, helpers) {
  const { formatNum, escapeHtml } = helpers;
  if (!epStats.length) return "";
  const maxHs = Math.max(1, ...epStats.map((p) => p.hsMedio || 0));
  const rows = epStats
    .slice(0, 10)
    .map((p) => {
      const warn = p.smallSample ? `<span class="tag tag-neutral">n=${p.n}</span>` : "";
      return hBarRow(`${escapeHtml(p.engineer)} ${warn}`, p.hsMedio ?? 0, maxHs, {
        suffix: `${formatNum(p.hsMedio, 1)} · ${formatNum(p.shareAtencaoCritico, 1)}% atenção/crítico`,
      });
    })
    .join("");
  return `
    <section class="card health-section">
      <h3 class="section-heading-sm">Saúde por Engenheiro Patrimonial</h3>
      <p class="sub">Comparativo descritivo — não é ranking de desempenho individual.</p>
      <div class="hbar-chart">${rows}</div>
    </section>`;
}

function evolutionSection(evolution, helpers) {
  const { fmt, formatNum, escapeHtml } = helpers;
  if (!evolution) return "";
  if (evolution.loading) {
    return `
      <section class="card health-section health-evolution-block">
        <h3 class="section-heading-sm">Evolução observada</h3>
        <p class="sub">Consultando histórico persistido…</p>
      </section>`;
  }
  if (!evolution.comparable) {
    const msg = evolution.message || evolutionInsufficientMessage(evolution.snapshotCount);
    return `
      <section class="card health-section health-evolution-block">
        <h3 class="section-heading-sm">Evolução observada</h3>
        <p class="health-evolution-msg">${escapeHtml(msg)}</p>
      </section>`;
  }
  return `
    <section class="card health-section health-evolution-block">
      <h3 class="section-heading-sm">Evolução observada</h3>
      <p class="sub">Comparação ${escapeHtml(evolution.prevDay)} → ${escapeHtml(evolution.nextDay)} · ${escapeHtml(evolution.formulaNote || "")}</p>
      <div class="health-evolution-kpis">
        <div><span>HS médio</span><strong>${formatNum(evolution.avgHsPrev, 1)} → ${formatNum(evolution.avgHsNext, 1)}</strong><em>Δ ${formatNum(evolution.avgHsDelta, 1)}</em></div>
        <div><span>Melhoraram</span><strong>${fmt.format(evolution.improved)}</strong></div>
        <div><span>Pioraram</span><strong>${fmt.format(evolution.worsened)}</strong></div>
        <div><span>Estáveis</span><strong>${fmt.format(evolution.stable)}</strong></div>
        <div><span>Δ E médio</span><strong>${formatNum(evolution.avgEDelta, 1)}</strong></div>
        <div><span>Δ M médio</span><strong>${formatNum(evolution.avgMDelta, 1)}</strong></div>
      </div>
      <div class="health-two-col">
        <div><h4 class="health-subhead">Distribuição anterior</h4>${healthDistributionBar(evolution.distributionPrev, helpers)}</div>
        <div><h4 class="health-subhead">Distribuição recente</h4>${healthDistributionBar(evolution.distributionNext, helpers)}</div>
      </div>
    </section>`;
}

function accompanimentFiltersHtml({ escapeHtml }, filters, options) {
  const sel = (name, key, value, opts) =>
    `<label class="evo-filter"><span>${name}</span><select data-evo-filter="${key}">${opts
      .map((o) => `<option value="${escapeHtml(o.value)}"${o.value === value ? " selected" : ""}>${escapeHtml(o.label)}</option>`)
      .join("")}</select></label>`;
  return `<div class="evo-filter-bar">
    <label class="evo-filter evo-filter-search"><span>Busca</span><input type="search" data-evo-filter="search" placeholder="Nome, EP, fator…" value="${escapeHtml(filters.search || "")}"/></label>
    ${sel("Nível", "healthLevel", filters.healthLevel, options.healthLevels)}
    ${sel("Programa", "program", filters.program, options.programs)}
    ${sel("EP", "ep", filters.ep, options.eps)}
    ${sel("Qualidade", "quality", filters.quality, options.qualities)}
    ${sel("Engajamento", "engagement", filters.engagement, options.engagementBands)}
    ${sel("Mecanismos", "mechanism", filters.mechanism, options.mechanismBands)}
  </div>`;
}

export function renderHealthEvolutionPage(ctx) {
  const {
    summary,
    healthDistribution,
    composition,
    programStats,
    epStats,
    evolution,
    weights,
    metaGeneratedAt,
    helpers,
    tableHtml,
    pagerHtml,
    filterOptions,
    localFilters,
  } = ctx;
  const { escapeHtml, formatNum, fmt, pctFmt, kpi, tipIcon } = helpers;
  const updated = metaGeneratedAt ? new Date(metaGeneratedAt).toLocaleString("pt-BR") : "—";
  const wLabel = weights?.formula || "50/50";

  return `
    <section class="health-page-header">
      <div class="page-lead-row">
        <div>
          <h2 class="page-lead-title">Saúde e Evolução</h2>
          <p class="page-lead-text">Entenda como está a carteira, compare grupos e acompanhe mudanças reais quando houver histórico.</p>
          <p class="sub health-meta-line">Última atualização: <strong>${escapeHtml(updated)}</strong> · ${escapeHtml(wLabel)}</p>
        </div>
        <div class="page-lead-actions">
          <button type="button" class="btn btn-outline btn-sm" id="btnEvolutionRefresh">Atualizar</button>
          <button type="button" class="btn btn-report btn-sm" id="btnEvolutionReport">Baixar relatório</button>
        </div>
      </div>
    </section>

    <section class="health-section-label"><h3>A · Como está a saúde da carteira?</h3></section>
    <section class="grid kpis kpis-3 health-summary-kpis">
      ${kpi("Clientes", fmt.format(summary.totalClients || 0), "Recorte filtrado")}
      ${kpi("HS médio", formatNum(summary.averageScore), weights?.label || "")}
      ${kpi("Saudáveis", fmt.format(summary.healthy || 0), `${pctFmt.format(summary.healthyPercent || 0)}%`)}
      ${kpi("Atenção", fmt.format(summary.attention || 0), `${pctFmt.format(summary.attentionPercent || 0)}%`)}
      ${kpi("Críticos", fmt.format(summary.critical || 0), `${pctFmt.format(summary.criticalPercent || 0)}%`)}
      ${kpi("Implantação / sem registro", fmt.format((summary.implanting || 0) + (summary.noRecord || 0)), `${pctFmt.format((summary.implantingPercent || 0) + (summary.noRecordPercent || 0))}%`)}
    </section>
    <section class="card health-dist-card">
      <h3 class="section-heading-sm">Distribuição de saúde ${tipIcon("hs_medio")}</h3>
      ${healthDistributionBar(healthDistribution, { fmt, pctFmt, escapeHtml })}
    </section>

    <section class="health-section-label"><h3>B · O que compõe a saúde?</h3></section>
    ${compositionSection(composition, helpers)}

    <section class="health-section-label"><h3>C · Saúde por programa e EP</h3></section>
    <div class="health-compare-grid">
      ${programSection(programStats, helpers)}
      ${epSection(epStats, helpers)}
    </div>

    <section class="health-section-label"><h3>D · Clientes que precisam de acompanhamento</h3></section>
    <section class="card health-table-card accompaniment-table">
      <p class="sub">Lista gerencial — prioriza atenção e críticos. Filtros abaixo refinam só esta tabela; o recorte global permanece nos filtros superiores.</p>
      ${accompanimentFiltersHtml({ escapeHtml }, localFilters, filterOptions)}
      ${tableHtml}
      ${pagerHtml}
    </section>

    <section class="health-section-label"><h3>E · Evolução observada</h3></section>
    ${evolutionSection(evolution, helpers)}

    <section class="card health-how-to">
      <h3 class="section-heading-sm">Como interpretar ${tipIcon("hs_formula")}</h3>
      <dl class="def-list def-list-compact">
        <dt>Health Score (HS)</dt><dd>Nota 0–100: combina E e M com os pesos do topo. Dois clientes com HS 0 podem ser <strong>Sem registro</strong> (sem base) ou <strong>Crítico</strong> (com histórico, score baixo).</dd>
        <dt>E — Engajamento</dt><dd>Reuniões válidas registradas — mede hábito de contato, não intenção futura.</dd>
        <dt>M — Mecanismos</dt><dd>Mecanismos implantados (em andamento não entra na nota).</dd>
        <dt>Cores</dt><dd>Verde saudável · âmbar atenção · coral crítico · cinza implantação · cinza claro sem registro.</dd>
        <dt>Dados insuficientes</dt><dd>Classificação protege o cliente (implantação/sem registro) — distinto de score baixo com histórico observável.</dd>
      </dl>
      <p class="note">Crítico não equivale a probabilidade individual de cancelamento.</p>
    </section>`;
}

export function bindHealthEvolutionPage(root, handlers) {
  const { onRefresh, onReport, onRowClick, onPager, onSort, onLocalFilter } = handlers;
  root.querySelector("#btnEvolutionRefresh")?.addEventListener("click", () => onRefresh?.());
  root.querySelector("#btnEvolutionReport")?.addEventListener("click", () => onReport?.());
  root.querySelectorAll("[data-client]").forEach((row) => row.addEventListener("click", () => onRowClick?.(row.dataset.client)));
  onPager?.(root);
  root.querySelectorAll("[data-sort]").forEach((h) => h.addEventListener("click", () => onSort?.(h.dataset.sort)));
  root.querySelectorAll("[data-evo-filter]").forEach((el) => {
    const key = el.dataset.evoFilter;
    const ev = el.tagName === "INPUT" ? "input" : "change";
    el.addEventListener(ev, () => onLocalFilter?.(key, el.value));
  });
}
