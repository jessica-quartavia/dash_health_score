import { mountPeriodPicker } from "./period-picker.mjs";
import { paginate, pagerHtml, bindPager, DEFAULT_PAGE_SIZE } from "./table-ui.mjs";
import { tipIcon, bindTipTriggers } from "./tooltips.mjs";
import { applyWeightsToPayload } from "/lib/frontend/weight-recompute.mjs";

const VIEWS = {
  overview: ["Painel executivo", "Visão Geral"],
  health: ["Score experimental", "Health Score"],
  engagement: ["Relacionamento", "Engajamento"],
  mechanisms: ["Cobertura", "Mecanismos"],
  nps: ["Associação, não causalidade", "NPS e Correlações"],
  base: ["Explorador", "Base Analítica"],
  research: ["Pesquisa histórica", "Pesquisa Preditiva"],
  quality: ["Qualidade informacional", "Qualidade e Monitoramento"],
};

const ICONS = {
  grid: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  pulse: '<svg viewBox="0 0 24 24"><path d="M3 12h4l2-5 4 10 2-5h6"/></svg>',
  users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3"/><path d="M4 19c1-3 3-4.5 5-4.5S13 16 14 19"/><circle cx="17" cy="9" r="2.2"/><path d="M16 14.6c2 .3 3.4 1.6 4.2 4.4"/></svg>',
  layers: '<svg viewBox="0 0 24 24"><path d="M12 4 4 8l8 4 8-4-8-4Z"/><path d="m4 12 8 4 8-4"/><path d="m4 16 8 4 8-4"/></svg>',
  relate: '<svg viewBox="0 0 24 24"><circle cx="7" cy="8" r="2.2"/><circle cx="17" cy="16" r="2.2"/><path d="M9 9.5 15 14.5"/></svg>',
  table: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16M10 10v9"/></svg>',
  study: '<svg viewBox="0 0 24 24"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-4"/><path d="M12 16V8"/><path d="M16 16v-6"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V6l-8-3Z"/></svg>',
};

const PIN_KEY = "healthScorePinnedFilters";
const WEIGHT_KEY = "healthScoreWeights";
const SIDEBAR_KEY = "healthScoreSidebar";
const fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const pctFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

const state = {
  view: "overview",
  payload: null,
  requestId: 0,
  debounce: null,
  weights: { engagement: 50, mechanism: 50 },
  pinned: true,
  filters: { search: "", from: "", to: "", program: "all", ep: "all", finalClass: "all", cluster: "ativos" },
  sort: { key: "healthScore", dir: "asc" },
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  qualityPage: 1,
  qualityDiagSearch: "",
  qualityDiagnostics: [],
  monitoringHistory: null,
  monitoringHistoryFetched: false,
  selectedId: null,
  researchTab: "study",
  researchPopulation: "total",
  predictiveReadiness: null,
  readinessLoaded: false,
  modelingResults: null,
  modelingLoaded: false,
  robustnessResults: null,
  robustnessLoaded: false,
  etapa6Results: null,
  etapa6Loaded: false,
  etapa7Results: null,
  etapa7Loaded: false,
  hs2aLabSnapshot: null,
  monitoringSummary: null,
  monitoringLoaded: false,
  monitoringCacheKey: null,
  researchBundle: null,
  researchBundleLoaded: false,
  loadStatus: "idle",
  loadError: null,
};

let periodPicker = null;

const API_TIMEOUT_MS = 120_000;

const el = {
  shell: document.getElementById("shell"),
  view: document.getElementById("view"),
  title: document.getElementById("viewTitle"),
  eyebrow: document.getElementById("viewEyebrow"),
  meta: document.getElementById("metaLine"),
  error: document.getElementById("errorBanner"),
  search: document.getElementById("fSearch"),
  from: document.getElementById("fFrom"),
  to: document.getElementById("fTo"),
  program: document.getElementById("fProgram"),
  ep: document.getElementById("fEp"),
  final: document.getElementById("fFinal"),
  cluster: document.getElementById("fCluster"),
  pin: document.getElementById("fPin"),
  dialog: document.getElementById("detailDialog"),
  scoreSlot: document.getElementById("scoreSlot"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tone(label) {
  const text = String(label || "");
  if (["Em implantação", "Sem registro", "Sem reunião", "Sem NPS", "Menos de 2 reuniões", "Nenhum implantado"].includes(text)) return "neutral";
  if (text.includes("Crítico") || text === "Mais de 90 dias" || text === "Mais de 60 dias" || text === "Detratores") return "critical";
  if (text.startsWith("Saudável") || text === "Até 30 dias" || text === "Até 15 dias" || text === "3 ou mais" || text === "Promotores") return "healthy";
  if (text.startsWith("Atenção") || text.includes("31 a") || text.includes("61 a") || text === "1 ou 2" || text === "16 a 30 dias" || text === "Neutros") return "attention";
  return "";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFmt.format(date);
}

function formatNum(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits === 0 ? 0 : undefined });
}

function mean(rows, key) {
  const values = rows.map((row) => Number(row[key])).filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function unknownLast(a, b) {
  const aUnknown = a === "Não informado";
  const bUnknown = b === "Não informado";
  if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
  return String(a).localeCompare(String(b), "pt-BR");
}

function clients() {
  return state.payload?.clients || [];
}

function readStoredWeights() {
  try {
    const stored = JSON.parse(localStorage.getItem(WEIGHT_KEY) || "{}");
    const engagement = Math.max(0, Math.min(100, Math.round(Number(stored.engagement))));
    const mechanism = Math.max(0, Math.min(100, Math.round(Number(stored.mechanism))));
    if (engagement + mechanism === 100) state.weights = { engagement, mechanism };
  } catch { /* pesos padrão */ }
}

function readPin() {
  try {
    const stored = JSON.parse(localStorage.getItem(PIN_KEY) || "null");
    if (!stored) return;
    state.pinned = stored.pinned !== false;
    if (state.pinned && stored.filters) state.filters = { ...state.filters, ...stored.filters };
  } catch { /* filtros padrão */ }
}

function savePin() {
  localStorage.setItem(PIN_KEY, JSON.stringify({ pinned: state.pinned, filters: state.pinned ? state.filters : null }));
}

function syncFilterInputs() {
  el.search.value = state.filters.search || "";
  el.from.value = state.filters.from || "";
  el.to.value = state.filters.to || "";
  el.pin.checked = state.pinned;
  periodPicker?.refresh();
}

function captureFilters() {
  state.filters = {
    search: el.search.value.trim(),
    from: el.from.value,
    to: el.to.value,
    program: el.program.value || "all",
    ep: el.ep.value || "all",
    finalClass: el.final.value || "all",
    cluster: el.cluster.value || "ativos",
  };
  if (state.pinned) savePin();
}

function effectiveCluster() {
  if (state.view === "research") return state.researchPopulation || "total";
  return state.filters.cluster || "ativos";
}

function updateFilterNote() {
  const node = document.getElementById("filterNote");
  if (!node) return;
  if (state.view === "research") {
    node.textContent =
      "Pesquisa Preditiva: a população do estudo é escolhida na própria página (padrão Total). O filtro Status acima não se aplica aqui. Demais filtros (programa, EP, busca) continuam válidos.";
    if (el.cluster) el.cluster.closest(".field")?.classList.add("muted-field");
  } else {
    node.textContent =
      "O período filtra clientes pela data de entrada. Os scores de cada cliente continuam calculados com o histórico completo. O recorte inicial é de clientes ativos.";
    if (el.cluster) el.cluster.closest(".field")?.classList.remove("muted-field");
  }
}

function queryParams({ refresh = false } = {}) {
  const params = new URLSearchParams({
    cluster: effectiveCluster(),
    ep: state.filters.ep || "all",
    program: state.filters.program || "all",
    finalClass: state.filters.finalClass || "all",
    engagementWeight: String(state.weights.engagement),
    mechanismWeight: String(state.weights.mechanism),
  });
  if (state.filters.search) params.set("search", state.filters.search);
  if (state.filters.from) params.set("from", state.filters.from);
  if (state.filters.to) params.set("to", state.filters.to);
  if (refresh) params.set("refresh", "1");
  return params;
}

function fillSelect(select, options, selected) {
  select.innerHTML = (options || []).map((option) => {
    const value = option.value ?? option;
    const label = option.label ?? option;
    const sel = String(value) === String(selected) ? " selected" : "";
    return `<option value="${escapeHtml(value)}"${sel}>${escapeHtml(label)}</option>`;
  }).join("");
}

function showError(message) {
  el.error.textContent = message;
  el.error.classList.remove("hidden");
}

function hideError() {
  el.error.classList.add("hidden");
  el.error.textContent = "";
}

function skeleton() {
  return `<div class="skeleton-grid">${"<div class='skeleton'></div>".repeat(4)}</div>`;
}

function kpi(label, value, hint, toneName = "", tipKey = "") {
  return `<article class="card kpi ${toneName ? `kpi-${toneName}` : ""}"><p class="label">${escapeHtml(label)}${tipIcon(tipKey)}</p><p class="value">${escapeHtml(value)}</p><p class="hint">${escapeHtml(hint || "")}</p></article>`;
}

function alertBox(kind, title, htmlBody) {
  return `<div class="alert alert-${kind}" role="status"><p class="alert-title">${escapeHtml(title)}</p><div class="alert-body">${htmlBody}</div></div>`;
}

function stackShareChart(items, { valueKey = "count", labelKey = "label" } = {}) {
  const list = (items || []).filter((i) => (i[valueKey] ?? i.count ?? 0) > 0);
  const total = list.reduce((s, i) => s + (Number(i[valueKey] ?? i.count) || 0), 0);
  if (!total) return `<p class="empty">Sem dados no recorte.</p>`;
  const colors = ["var(--healthy)", "var(--attention-bar)", "var(--critical)", "#5B7C99", "#94a3b8", "#cbd5e1"];
  const bar = list
    .map((item, index) => {
      const v = Number(item[valueKey] ?? item.count) || 0;
      const w = (v / total) * 100;
      return `<div class="stack-seg" style="width:${w}%;background:${colors[index % colors.length]}" title="${escapeHtml(item[labelKey] ?? item.label)}: ${fmt.format(v)}"></div>`;
    })
    .join("");
  const legend = list
    .map(
      (item, index) =>
        `<span class="stack-legend-item"><i style="background:${colors[index % colors.length]}"></i>${escapeHtml(item[labelKey] ?? item.label)} <strong>${fmt.format(item[valueKey] ?? item.count)}</strong> (${pctFmt.format(((item[valueKey] ?? item.count) / total) * 100)}%)</span>`,
    )
    .join("");
  return `<div class="stack-chart"><div class="stack-bar">${bar}</div><div class="stack-legend">${legend}</div></div>`;
}

function hBarMetrics(rows, { labelKey = "label", valueKey = "value", max: maxIn, format = (v) => formatNum(v, 3) }) {
  if (!rows?.length) return `<p class="empty">Sem métricas.</p>`;
  const max = maxIn ?? Math.max(...rows.map((r) => Number(r[valueKey]) || 0), 0.001);
  return `<div class="h-metrics">${rows
    .map((row) => {
      const v = Number(row[valueKey]) || 0;
      const w = Math.max(4, (v / max) * 100);
      return `<div class="h-metric-row"><span class="h-metric-label">${escapeHtml(row[labelKey])}</span><div class="track"><div class="fill accent" style="width:${w}%"></div></div><span class="h-metric-val">${format(v)}</span></div>`;
    })
    .join("")}</div>`;
}

function card(title, subtitle, body) {
  return `<article class="card"><h2>${escapeHtml(title)}</h2><p class="sub">${escapeHtml(subtitle || "")}</p>${body}</article>`;
}

function bars(rows, valueKey = "percent") {
  const list = rows || [];
  if (!list.length) return `<p class="empty">Sem dados no recorte.</p>`;
  const max = Math.max(...list.map((row) => Number(row[valueKey]) || 0), 1);
  return `<div class="bars">${list.map((row) => {
    const width = Math.max(0, Math.min(100, ((Number(row[valueKey]) || 0) / max) * 100));
    const meta = row.meta ?? `${fmt.format(row.count || 0)} · ${pctFmt.format(row.percent || 0)}%`;
    const klass = row.tone || tone(row.label) || (row.accent ? "accent" : "support");
    return `<div class="bar-row" title="${escapeHtml(row.label)}: ${escapeHtml(meta)}"><span>${escapeHtml(row.label)}</span><div class="track"><div class="fill ${klass}" style="width:${width}%"></div></div><span class="bar-meta">${escapeHtml(meta)}</span></div>`;
  }).join("")}</div>`;
}

function columnChart(points, color = "#5B7C99") {
  if (!points.length) return `<p class="empty">Sem série temporal suficiente.</p>`;
  const width = Math.max(520, points.length * 36);
  const height = 180;
  const max = Math.max(...points.map((point) => point.value), 1);
  const gap = 8;
  const barWidth = (width - 36) / points.length - gap;
  const marks = points.map((point, index) => {
    const barHeight = Math.max(2, (point.value / max) * 130);
    const x = 28 + index * (barWidth + gap);
    const y = 150 - barHeight;
    const label = points.length > 16 && index % 2 ? "" : point.label.slice(2);
    return `<g><rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="3" fill="${color}" opacity="0.9"><title>${escapeHtml(point.label)}: ${escapeHtml(formatNum(point.value, 0))}</title></rect><text x="${x + barWidth / 2}" y="168" text-anchor="middle">${escapeHtml(label)}</text></g>`;
  }).join("");
  return `<div class="chart-scroll"><svg class="chart" viewBox="0 0 ${width} ${height}" role="img">${marks}</svg></div>`;
}

function scatter(points) {
  const valid = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (valid.length < 3) return `<p class="empty">Amostra insuficiente para dispersão.</p>`;
  const width = 520;
  const height = 200;
  const minX = Math.min(...valid.map((point) => point.x));
  const maxX = Math.max(...valid.map((point) => point.x));
  const minY = Math.min(...valid.map((point) => point.y));
  const maxY = Math.max(...valid.map((point) => point.y));
  const sx = (value) => 36 + ((value - minX) / (maxX - minX || 1)) * 460;
  const sy = (value) => 160 - ((value - minY) / (maxY - minY || 1)) * 130;
  const dots = valid.map((point) => `<circle cx="${sx(point.x)}" cy="${sy(point.y)}" r="3.2" fill="#E85D3A" opacity="0.75"><title>${escapeHtml(point.label || "")}</title></circle>`).join("");
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img"><line x1="36" y1="160" x2="500" y2="160" stroke="#E5E7EB"/><line x1="36" y1="20" x2="36" y2="160" stroke="#E5E7EB"/>${dots}</svg>`;
}

function groupStats(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const label = row[key] || "Não informado";
    const current = map.get(label) || { label, count: 0, score: 0, engagement: 0, withMechanism: 0 };
    current.count += 1;
    current.score += Number(row.healthScore) || 0;
    current.engagement += Number(row.avgMeetingsPerMonth) || 0;
    if ((row.implementedCount || 0) > 0) current.withMechanism += 1;
    map.set(label, current);
  }
  return [...map.values()]
    .map((item) => ({
      label: item.label,
      count: item.count,
      percent: rows.length ? (item.count / rows.length) * 100 : 0,
      avgScore: item.count ? item.score / item.count : 0,
      avgEngagement: item.count ? item.engagement / item.count : 0,
      coverage: item.count ? (item.withMechanism / item.count) * 100 : 0,
    }))
    .sort((a, b) => unknownLast(a.label, b.label));
}

function attentionRows(rows) {
  return rows
    .map((row) => {
      let reason = "";
      if (row.finalClass === "Crítico") reason = "Classificação Crítico";
      else if (row.finalClass === "Atenção") reason = "Classificação Atenção";
      else if (row.finalClass === "Sem registro") reason = "Sem reuniões e sem mecanismos";
      return reason ? { ...row, reason } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.healthScore - b.healthScore);
}

function badge(label) {
  return `<span class="badge ${tone(label)}">${escapeHtml(label || "—")}</span>`;
}

function table(headers, rowsHtml, { compact = false, sticky = false } = {}) {
  const cls = ["table-wrap", compact ? "table-compact" : "", sticky ? "table-sticky" : ""].filter(Boolean).join(" ");
  return `<div class="${cls}"><table><thead><tr>${headers}</tr></thead><tbody>${rowsHtml || `<tr><td colspan="12"><span class="empty">Sem dados no recorte.</span></td></tr>`}</tbody></table></div>`;
}

function distribution(payload, key) {
  if (key === "health") return payload.healthDistribution || [];
  return payload.distributions?.[key] || [];
}

function meetingSeries(rows) {
  const map = new Map();
  for (const row of rows) {
    for (const [month, count] of Object.entries(row.meetingMonthCounts || {})) {
      map.set(month, (map.get(month) || 0) + Number(count || 0));
    }
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-18).map(([label, value]) => ({ label, value }));
}

function cohortSeries(rows) {
  const map = new Map();
  for (const row of rows) {
    const month = String(row.entryDate || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const current = map.get(month) || { count: 0, score: 0 };
    current.count += 1;
    current.score += Number(row.healthScore) || 0;
    map.set(month, current);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, item]) => ({
    label,
    value: item.count,
    avg: item.count ? item.score / item.count : 0,
  }));
}

function buckets(rows, picker) {
  const map = new Map();
  for (const row of rows) {
    const label = picker(row);
    map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map.entries()].map(([label, count]) => ({
    label,
    count,
    percent: rows.length ? (count / rows.length) * 100 : 0,
    meta: `${fmt.format(count)} · ${pctFmt.format(rows.length ? (count / rows.length) * 100 : 0)}%`,
  }));
}

function recency(row) {
  if (row.daysSinceLastMeeting == null) return "Sem reunião";
  if (row.daysSinceLastMeeting <= 30) return "Até 30 dias";
  if (row.daysSinceLastMeeting <= 60) return "31 a 60 dias";
  if (row.daysSinceLastMeeting <= 90) return "61 a 90 dias";
  return "Mais de 90 dias";
}

function intervalBand(row) {
  if (row.medianIntervalDays == null) return "Menos de 2 reuniões";
  if (row.medianIntervalDays <= 15) return "Até 15 dias";
  if (row.medianIntervalDays <= 30) return "16 a 30 dias";
  if (row.medianIntervalDays <= 60) return "31 a 60 dias";
  return "Mais de 60 dias";
}

function histogram(rows) {
  const bins = Array.from({ length: 10 }, (_, index) => ({
    label: index === 9 ? "90–100" : `${index * 10}–${index * 10 + 9}`,
    count: 0,
  }));
  for (const row of rows) {
    const score = Math.max(0, Math.min(100, Number(row.healthScore) || 0));
    const index = score >= 100 ? 9 : Math.floor(score / 10);
    bins[index].count += 1;
  }
  return bins.map((bin, index) => ({
    ...bin,
    percent: rows.length ? (bin.count / rows.length) * 100 : 0,
    tone: index >= 7 ? "healthy" : index >= 2 ? "attention" : "critical",
    meta: `${fmt.format(bin.count)}`,
  }));
}

function crossTab(rows) {
  const eOrder = ["Saudável", "Atenção", "Crítico"];
  const mOrder = ["Saudável", "Atenção", "Crítico"];
  const body = eOrder.map((engagement) => {
    const cells = mOrder.map((mechanism) => {
      const count = rows.filter((row) => row.engagementLabel === engagement && row.mechanismLabel === mechanism).length;
      return `<td class="num">${fmt.format(count)}</td>`;
    }).join("");
    return `<tr><td>${escapeHtml(engagement)}</td>${cells}</tr>`;
  }).join("");
  return table(`<th>E \\ M</th>${mOrder.map((label) => `<th class="num">${label}</th>`).join("")}`, body);
}

function typeCounts(rows) {
  const map = new Map();
  for (const row of rows) {
    for (const type of row.mechanismTypes || []) {
      map.set(type, (map.get(type) || 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count, percent: rows.length ? (count / rows.length) * 100 : 0, tone: "support", meta: `${fmt.format(count)} clientes` }))
    .sort((a, b) => unknownLast(a.label, b.label) || b.count - a.count)
    .slice(0, 12);
}

function npsLabel(key) {
  if (key === "promoter") return "Promotores";
  if (key === "passive") return "Neutros";
  if (key === "detractor") return "Detratores";
  return "Sem NPS";
}

function evidence(sample, value) {
  if (sample < 3 || value == null) return "Insuficiente — menos de 3 pares.";
  if (sample < 30) return "Exploratória — amostra abaixo de 30.";
  return "Associativa — não indica causa.";
}

function comparisonTable(stats) {
  const body = stats.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td class="num">${fmt.format(item.count)}</td><td class="num">${formatNum(item.avgScore)}</td><td class="num">${formatNum(item.avgEngagement, 2)}</td><td class="num">${pctFmt.format(item.coverage)}%</td></tr>`).join("");
  return table("<th>Grupo</th><th class='num'>Clientes</th><th class='num'>Score médio</th><th class='num'>Reuniões/mês</th><th class='num'>Cobertura M</th>", body);
}

function renderOverview(payload) {
  const rows = clients();
  const summary = payload.summary || {};
  const mgr = payload.hs2aManagerial || {};
  const avgEngagement = mean(rows, "avgMeetingsPerMonth");
  const withMechanism = rows.filter((row) => (row.implementedCount || 0) > 0).length;
  const coverage = rows.length ? (withMechanism / rows.length) * 100 : 0;
  const attention = attentionRows(rows).slice(0, 8);
  const cohorts = cohortSeries(rows);
  const attentionBody = attention.map((row) => `<tr><td>${escapeHtml(row.clientName)}</td><td>${escapeHtml(row.engineer)}</td><td>${badge(row.finalClass)}</td><td class="num">${formatNum(row.healthScore, 0)}</td><td>${escapeHtml(row.reason)}</td></tr>`).join("");
  const topClients = [...rows].sort((a, b) => (a.healthScore ?? 0) - (b.healthScore ?? 0)).slice(0, 12);
  const topBody = topClients
    .map(
      (row) =>
        `<tr class="click-row" data-client="${escapeHtml(row.clientId)}"><td>${escapeHtml(row.clientName)}</td><td>${escapeHtml(row.program)}</td><td class="num">${formatNum(row.healthScore, 0)}</td><td>${escapeHtml(row.hs2a?.perfilLabel || "—")}</td><td>${badge(row.finalClass)}</td></tr>`,
    )
    .join("");
  el.view.innerHTML = `
    <section class="grid kpis kpis-5">
      ${kpi("Clientes no recorte", fmt.format(rows.length), summary.totalClients ? `de ${fmt.format(summary.totalClients)} após filtros` : "Recorte atual")}
      ${kpi("HS médio (V1)", formatNum(summary.averageScore), payload.weights?.formula || "50/50 experimental", "", "hs_medio")}
      ${kpi("Engajamento", avgEngagement == null ? "—" : formatNum(avgEngagement, 2), "Reuniões/mês · histórico completo", "", "engajamento")}
      ${kpi("Cobertura M", `${pctFmt.format(coverage)}%`, `${fmt.format(withMechanism)} com implantado`, "", "mecanismos")}
      ${kpi("Atenção + crítico", fmt.format((summary.attention || 0) + (summary.critical || 0)), "Fora de implantação", "attention", "hs_faixa")}
    </section>
    <section class="grid cards-2">
      ${card("Distribuição HS (V1)", "Classificação operacional — leitura rápida", stackShareChart(distribution(payload, "health")) + bars(distribution(payload, "health")))}
      ${card("Histograma HS", "Faixas de 10 pontos", bars(histogram(rows), "count"))}
    </section>
    <section class="grid cards-2">
      ${card("Engajamento (E)", "Nota por faixa", bars(distribution(payload, "engagement")))}
      ${card("Mecanismos (M)", "Nota por faixa", bars(distribution(payload, "mechanism")))}
    </section>
    <section class="grid cards-2">
      ${card("Perfis 2.0A", "Interpretação — não é risco automático", managerialBars(mgr.perfisExclusivos, "label"))}
      ${card("Qualidade informacional", "Separada do HS numérico", managerialBars(mgr.qualidadeInformacional, "categoria"))}
    </section>
    <section class="grid cards-2">
      ${card("Por programa", "Score, cadência e cobertura M", comparisonTable(groupStats(rows, "program")))}
      ${card("Por EP", "Composição de carteira pode variar", comparisonTable(groupStats(rows, "engineer")))}
    </section>
    <section class="grid cards-2">
      ${card("Entrada na carteira", cohorts.length > 1 ? "Clientes por mês de entrada (filtro de período)" : "Poucos meses no recorte", cohorts.length > 1 ? columnChart(cohorts) : `<p class="empty">Sem série mensal de entradas.</p>`)}
      ${card("Prioridade de revisão", "Crítico, Atenção ou Sem registro", table("<th>Cliente</th><th>EP</th><th>Classe</th><th class='num'>HS</th><th>Critério</th>", attentionBody || "<tr><td colspan='5'>Nenhum cliente nestas faixas.</td></tr>"))}
    </section>
    ${card("Clientes no recorte", "Clique para detalhe · ordenado por HS crescente", table("<th>Cliente</th><th>Programa</th><th class='num'>HS</th><th>Perfil 2.0A</th><th>Classe</th>", topBody || "<tr><td colspan='5'>Sem clientes.</td></tr>"))}
  `;
  el.view.querySelectorAll("[data-client]").forEach((row) => row.addEventListener("click", () => openDetail(row.dataset.client)));
}

function weightLabel(value) {
  return (value / 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function formulaText() {
  return `HS = (E × ${weightLabel(state.weights.engagement)}) + (M × ${weightLabel(state.weights.mechanism)})`;
}

function scorePanel() {
  const presets = [
    [50, "Equilibrado"],
    [70, "Mais engajamento"],
    [30, "Mais mecanismos"],
  ];
  return `
    <section class="score-panel" aria-label="Configuração do Health Score">
      <div class="score-head">
        <div>
          <h2>Configuração do Health Score</h2>
          <p class="sub">Ajuste o peso dos componentes para recalcular o score experimental. Os pesos sempre somam 100%.</p>
        </div>
        <span class="score-badge alert-experimental-tag">Score experimental — não é previsão validada de churn</span>
      </div>
      <p class="formula" id="scoreFormula">${escapeHtml(formulaText())}</p>
      <div class="weights">
        <label>Engajamento <span id="engLabel">${state.weights.engagement}%</span>
          <input id="wEngagement" type="range" min="0" max="100" step="5" value="${state.weights.engagement}" aria-label="Peso de engajamento" />
        </label>
        <label>Mecanismos <span id="mecLabel">${state.weights.mechanism}%</span>
          <input id="wMechanism" type="range" min="0" max="100" step="5" value="${state.weights.mechanism}" aria-label="Peso de mecanismos" />
        </label>
      </div>
      <div class="presets">
        ${presets.map(([value, label]) => `<button type="button" class="preset ${state.weights.engagement === value ? "active" : ""}" data-preset="${value}">${escapeHtml(label)}</button>`).join("")}
      </div>
    </section>`;
}

function scoreStrip() {
  return `
    <button type="button" class="score-strip" data-goto="health">
      <span><strong>${escapeHtml(formulaText())}</strong><br><span class="sub">Score experimental. Abra Health Score para ajustar os pesos.</span></span>
      <span class="score-badge">Ajustar pesos</span>
    </button>`;
}

function paintScorePanel() {
  const formula = document.getElementById("scoreFormula");
  const eng = document.getElementById("engLabel");
  const mec = document.getElementById("mecLabel");
  const engRange = document.getElementById("wEngagement");
  const mecRange = document.getElementById("wMechanism");
  if (formula) formula.textContent = formulaText();
  if (eng) eng.textContent = `${state.weights.engagement}%`;
  if (mec) mec.textContent = `${state.weights.mechanism}%`;
  if (engRange && document.activeElement !== engRange) engRange.value = String(state.weights.engagement);
  if (mecRange && document.activeElement !== mecRange) mecRange.value = String(state.weights.mechanism);
  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.preset) === state.weights.engagement);
  });
}

function bindScoreControls(root) {
  root.querySelector("#wEngagement")?.addEventListener("input", (event) => setWeights("engagement", event.target.value));
  root.querySelector("#wMechanism")?.addEventListener("input", (event) => setWeights("mechanism", event.target.value));
  root.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => setWeights("engagement", button.dataset.preset));
  });
  root.querySelector("[data-goto]")?.addEventListener("click", () => {
    const button = document.querySelector('.nav-btn[data-view="health"]');
    button?.click();
  });
}

function renderScoreSlot() {
  if (!el.scoreSlot) return;
  if (!state.payload || (state.view !== "health" && state.view !== "overview")) {
    el.scoreSlot.innerHTML = "";
    el.scoreSlot.hidden = true;
    return;
  }
  el.scoreSlot.hidden = false;
  el.scoreSlot.innerHTML = state.view === "health" ? scorePanel() : scoreStrip();
  bindScoreControls(el.scoreSlot);
}

function managerialBars(items, labelKey = "label") {
  if (!items?.length) return `<p class="empty">Sem dados no recorte.</p>`;
  return bars(
    items.map((item) => ({
      label: item[labelKey] || item.code || item.faixa,
      count: item.count || item.n,
      percent: item.percent ?? (item.share != null ? item.share * 100 : 0),
      meta: `${fmt.format(item.count || item.n)} · ${pctFmt.format(item.percent ?? (item.share != null ? item.share * 100 : 0))}%`,
    })),
    "count",
  );
}

function renderHealth(payload) {
  const rows = clients();
  const summary = payload.summary || {};
  const mgr = payload.hs2aManagerial || {};
  const cmp = payload.hs2aComparisons || {};
  const ranking = [...rows].sort((a, b) => b.healthScore - a.healthScore).slice(0, 12);
  const tableBody = ranking
    .map(
      (row) =>
        `<tr data-client="${escapeHtml(row.clientId)}" class="click-row"><td>${escapeHtml(row.clientName)}</td><td>${escapeHtml(row.program)}</td><td class="num">${formatNum(row.healthScore, 0)}</td><td>${escapeHtml(row.hs2a?.perfilLabel || "—")}</td><td>${escapeHtml(row.hs2a?.qualidadeLabel || "—")}</td><td>${badge(row.finalClass)}</td></tr>`,
    )
    .join("");
  const attrRows = (mgr.atributosCoexistem || [])
    .map((a) => `<tr><td>${escapeHtml(a.id.replace(/_/g, " "))}</td><td class="num">${fmt.format(a.count)}</td><td class="num">${pctFmt.format(a.percent || 0)}%</td></tr>`)
    .join("");
  el.view.innerHTML = `
    ${alertBox("experimental", "Health Score interativo", `<p>Os sliders acima recalculam E/M nesta página (média, faixas, ranking). Fórmula oficial documentada permanece 50/50 — isto é exploração, não modelo de churn.</p>`)}
    <section class="grid kpis kpis-6">
      ${kpi("Clientes analisados", fmt.format(summary.totalClients || 0), "Mesmos filtros abaixo")}
      ${kpi("Score médio V1", formatNum(summary.averageScore), payload.weights?.formula || "50/50", "", "hs_medio")}
      ${kpi("Saudáveis", fmt.format(summary.healthy || 0), `${pctFmt.format(summary.healthyPercent || 0)}%`, "healthy", "hs_faixa")}
      ${kpi("Atenção", fmt.format(summary.attention || 0), `${pctFmt.format(summary.attentionPercent || 0)}%`, "attention", "hs_faixa")}
      ${kpi("Críticos", fmt.format(summary.critical || 0), `${pctFmt.format(summary.criticalPercent || 0)}%`, "critical", "hs_faixa")}
      ${kpi("Em implantação", fmt.format(summary.implanting || 0), `${pctFmt.format(summary.implantingPercent || 0)}%`, "neutral")}
    </section>
    <section class="managerial-section">
      <h2 class="section-title">Visão Gerencial <span class="tag-experimental">HS 2.0A</span></h2>
      <p class="sub" title="Perfis primários não se sobrepõem; atributos podem coexistir.">${escapeHtml(mgr.notaDuplicidade || "")}</p>
      <section class="grid cards-2">
        ${card("Por faixa de HS (V1)", "Distribuição do score numérico", managerialBars(mgr.faixasHs, "faixa"))}
        ${card("Perfis exclusivos", "Interpretação — não é risco automático", managerialBars(mgr.perfisExclusivos, "label"))}
      </section>
      <section class="grid cards-2">
        ${card("Fase de relacionamento", "Implantação vs pós-implantação", managerialBars(mgr.fases, "fase"))}
        ${card("Qualidade informacional", "Separada do HS numérico", managerialBars(mgr.qualidadeInformacional, "categoria"))}
      </section>
      ${card("Atributos (podem coexistir)", "Contagens não exclusivas", table("<th>Atributo</th><th class='num'>Clientes</th><th class='num'>%</th>", attrRows))}
    </section>
    <section class="grid cards-2">
      ${card("Classificação V1", "Regras operacionais — responde aos pesos", stackShareChart(distribution(payload, "health")))}
      ${card("Histograma HS", "Faixas de 10 pontos", bars(histogram(rows), "count"))}
    </section>
    <section class="grid cards-2">
      ${card("Comparativo — programa", "Mediana e n; cautela em amostras pequenas", hs2aCompareTable(cmp.programa))}
      ${card("Comparativo — fase 2.0A", "Comportamento por fase interpretativa", hs2aCompareTable(cmp.fase))}
    </section>
    <section class="grid cards-2">
      ${card("Comparativo — qualidade", "Cobertura informacional", hs2aCompareTable(cmp.qualidade))}
      ${card("Comparativo — faixa HS", "Descritivo no recorte", hs2aCompareTable(cmp.faixaHs))}
    </section>
    ${card("Por EP (referência)", "Sem ranking de desempenho — diferenças de carteira", comparisonTable(groupStats(rows, "engineer")))}
    <section class="grid cards-2">
      ${card("Ranking interpretado", "Clique para detalhe 2.0A", table("<th>Cliente</th><th>Programa</th><th class='num'>HS</th><th>Perfil</th><th>Qualidade</th><th>Classe</th>", tableBody))}
      <div class="card">
        <h3>Exportação</h3>
        <p class="sub">CSV gerencial inclui campos 2.0A no recorte filtrado.</p>
        <button type="button" class="btn" id="btnGerencialCsv">Exportar visão gerencial</button>
      </div>
    </section>
  `;
  el.view.querySelectorAll("[data-client]").forEach((row) => row.addEventListener("click", () => openDetail(row.dataset.client)));
  document.getElementById("btnGerencialCsv")?.addEventListener("click", downloadGerencialCsv);
}

async function fetchMonitoringSummary() {
  const params = queryParams();
  const cacheKey = params.toString();
  if (state.monitoringLoaded && state.monitoringSummary && state.monitoringCacheKey === cacheKey) {
    return state.monitoringSummary;
  }
  const response = await fetch(`/api/monitoring-summary?${params.toString()}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body.error || "Falha ao carregar qualidade.");
    err.code = body.code;
    throw err;
  }
  state.monitoringSummary = body;
  state.monitoringLoaded = true;
  state.monitoringCacheKey = cacheKey;
  return body;
}

function qualityErrorMessage(err) {
  if (err?.code === "DATA_CONNECTION") {
    return err.message || "Falha de conexão com a BASE QV (somente leitura).";
  }
  return err?.message || "Falha ao carregar qualidade e monitoramento.";
}

function downloadQualityProblemsCsv() {
  window.location.href = `/api/monitoring-problems.csv?${queryParams().toString()}`;
}

function filterQualityDiagnostics(rows, filterText = "") {
  const q = filterText.trim().toLowerCase();
  return (rows || []).filter((r) => {
    if (!q) return true;
    return [r.clientName, r.clientCode, r.programa, r.ep, r.categoria, r.tipo, r.evidencia, r.acaoRecomendada].some((v) =>
      String(v || "").toLowerCase().includes(q),
    );
  });
}

function renderQualityTableRows(rows) {
  return rows
    .map(
      (r) =>
        `<tr class="click-row" data-client="${escapeHtml(r.clientId)}"><td class="cell-primary">${escapeHtml(r.clientName || "—")}</td><td class="muted-code">${escapeHtml(r.clientCode)}</td><td>${escapeHtml(r.programa)}</td><td>${escapeHtml(r.ep)}</td><td>${escapeHtml(r.categoria)}</td><td>${escapeHtml(r.tipo)}</td><td>${escapeHtml(r.prioridade)}</td><td class="cell-wrap">${escapeHtml(r.evidencia)}</td><td class="cell-wrap">${escapeHtml(r.acaoRecomendada)}</td></tr>`,
    )
    .join("");
}

function paintQualityDiagnosticsTable(root, diagnostics) {
  const filtered = filterQualityDiagnostics(diagnostics, state.qualityDiagSearch);
  const pg = paginate(filtered, state.qualityPage, DEFAULT_PAGE_SIZE);
  state.qualityPage = pg.page;
  const tbody = root.querySelector("#qualityDiagSection tbody");
  const pagerNode = root.querySelector("#qualityPager");
  if (tbody) {
    tbody.innerHTML =
      renderQualityTableRows(pg.slice) ||
      `<tr><td colspan="9"><span class="empty">${filtered.length ? "Página vazia." : "Nenhum diagnóstico no recorte."}</span></td></tr>`;
  }
  if (pagerNode) {
    pagerNode.innerHTML = pagerHtml({ ...pg, idPrefix: "quality" });
    bindPager(pagerNode, "quality", {
      getPage: () => state.qualityPage,
      setPage: (p) => {
        state.qualityPage = p;
      },
      onChange: () => paintQualityDiagnosticsTable(root, diagnostics),
    });
  }
  root.querySelectorAll("#qualityDiagSection [data-client]").forEach((row) =>
    row.addEventListener("click", () => openDetail(row.dataset.client)),
  );
}

async function loadMonitoringHistory() {
  try {
    const res = await fetch("/api/monitoring-history");
    const body = await res.json().catch(() => ({}));
    state.monitoringHistory = res.ok
      ? body
      : { ok: false, error: body.error || res.statusText || "Business Data indisponível", ...body };
    return state.monitoringHistory;
  } catch {
    state.monitoringHistory = { ok: false, error: "Falha ao consultar Business Data." };
    return state.monitoringHistory;
  }
}

function renderQuality() {
  el.view.innerHTML = skeleton();
  Promise.all([loadMonitoringHistory(), fetchMonitoringSummary()])
    .then(([, mon]) => {
      try {
      const live = mon.live || {};
      const meta = mon.meta || {};
      const exec = mon.executive || {};
      const q = live.indicadores || [];
      const denom = live.denominador || { n: 0, label: "—" };
      const problems = live.principais_problemas || [];
      const byCat = live.issuesByCategory || [];
      const diagnostics = live.diagnosticsPreview || [];
      const byProgram = live.byProgram || [];
      const byEp = live.byEp || [];
      const trend = live.trend || [];
      const temporal = live.temporal || {};
      const runs = live.runLog || [];
      const env = live.environment || {};
      const pers = live.persistence || exec.persistencia || {};

      const kpiRows = q
        .map(
          (item) =>
            `<article class="kpi"><p class="kpi-label">${escapeHtml(String(item.id || "").replace(/_/g, " "))}</p><p class="kpi-value">${pctFmt.format(item.percentual ?? 0)}%</p><p class="kpi-meta">${fmt.format(item.numerador ?? 0)} / ${fmt.format(denom.n)} · ${escapeHtml(denom.label)}</p></article>`,
        )
        .join("");

      const stateLabel = pers.estados?.labels?.[pers.estados?.persistenceState] || pers.estados?.persistenceState || "—";
      const autoLabel = pers.estados?.labels?.[pers.estados?.automationState] || pers.estados?.automationState || "—";
      const destParts = [];
      if (env.durableDestination?.localPrimary) destParts.push("local");
      if (env.durableDestination?.filesystemMirror) destParts.push("mirror");
      if (env.durableDestination?.supabase) destParts.push(`Storage (${escapeHtml(env.durableDestination.supabase.bucket || "bucket")})`);

      state.qualityDiagnostics = diagnostics;
      state.qualityPage = 1;

      const temporalWait =
        live.temporal?.reason ||
        meta.temporalMessage ||
        (meta.snapshotCount === 1 ? "Aguardando novos snapshots para comparação temporal." : null);

      const execHtml = `
        <section class="grid cards-2 quality-status-grid">
          ${alertBox("info", "Qualidade dos dados (live)", `<p>${fmt.format(exec.clientes || denom.n)} clientes auditados · ${fmt.format(exec.diagnosticos || 0)} diagnósticos no recorte.</p><p>Indicadores abaixo medem confiabilidade informacional — não confundir com HS nem churn.</p>`)}
          ${alertBox(
            meta.snapshotCount < 2 ? "warning" : "info",
            "Monitoramento e snapshots",
            `<p>${fmt.format(pers.quantidadeSnapshots || meta.snapshotCount || 0)} snapshots · último ${escapeHtml(pers.ultimoSnapshotDia || exec.ultimoSnapshot || "—")}</p><p>${escapeHtml(temporalWait || "Comparação temporal quando houver 2+ dias distintos.")}</p>`,
          )}
          ${alertBox(
            pers.automacaoAtivaDeclarada ? "info" : "warning",
            "Armazenamento e automação",
            `<p>Persistência: ${escapeHtml(stateLabel)} · Automação: ${escapeHtml(autoLabel)}</p><p>Destino: ${destParts.length ? destParts.join(" + ") : "somente sessão local"} · última execução ${pers.ultimaExecucao ? new Date(pers.ultimaExecucao).toLocaleString("pt-BR") : "—"}</p>`,
          )}
          ${(env.warnings || []).length ? alertBox("warning", "Avisos do ambiente", env.warnings.map((w) => `<p>${escapeHtml(w)}</p>`).join("")) : ""}
          ${(pers.falhasRecentes || []).length ? alertBox("critical", "Falhas recentes do pipeline", `<p>${pers.falhasRecentes.map((f) => escapeHtml(f.referenceDay)).join(", ")}</p>`) : ""}
        </section>`;

      const problemRows = problems
        .map((p) => `<tr><td>${escapeHtml(p.tipo)}</td><td class="num">${fmt.format(p.count)}</td><td class="num">${pctFmt.format(p.percentual)}%</td></tr>`)
        .join("");
      const catRows = byCat.map((c) => `<tr><td>${escapeHtml(c.categoria)}</td><td class="num">${fmt.format(c.count)}</td></tr>`).join("");

      const segPct = (seg, key) => pctFmt.format(seg?.[key]?.percentual ?? 0);
      const segRow = (s) =>
        `<tr><td>${escapeHtml(s?.label ?? "—")}</td><td class="num">${fmt.format(s?.n ?? 0)}</td><td class="num">${segPct(s, "historico_suficiente")}%</td><td class="num">${segPct(s, "mecanismos_confiaveis")}%</td><td class="num">${segPct(s, "inconsistencias")}%</td><td>${s?.alertaComposicao ? "⚠ amostra pequena" : "—"}</td></tr>`;

      let trendForChart = trend;
      if (trend.length <= 1 && state.monitoringHistory?.trend?.length) {
        trendForChart = state.monitoringHistory.trend;
      }
      const trendBody =
        trendForChart.length > 1
          ? trendForChart.map((t) => `<tr><td>${escapeHtml(t.dia)}</td><td class="num">${fmt.format(t.clientes)}</td><td class="muted-code">${t.source === "business_data" ? "BD" : ""}</td></tr>`).join("")
          : `<tr><td colspan='3'>${escapeHtml(temporalWait || "Execute npm run monitoring:pipeline em dias distintos para série temporal.")}</td></tr>`;

      let temporalNote = escapeHtml(temporal.reason || temporal.warning || "Sem comparação temporal confiável.");
      if (temporal.comparable) {
        const m = temporal.mudancas || {};
        temporalNote = `De ${temporal.de} → ${temporal.para} · ${fmt.format(temporal.clientesComparados)} clientes. Classificação: ${m.classificacao ?? "—"} · ΔE −5: ${m.queda_e} / +5: ${m.melhora_e} · perfil: ${m.perfil} · qualidade +: ${m.qualidade_melhor} / −: ${m.qualidade_pior} · novos problemas: ${m.inconsistencias_novas} · resolvidos: ${m.inconsistencias_resolvidas}. ${escapeHtml(temporal.nota || "")}`;
      }
      if (temporal.methodologyChange) temporalNote = `[Metodologia] ${temporalNote}`;

      const hist = state.monitoringHistory;
      const bdRunSource = hist?.ok && hist.runs?.length ? hist.runs : null;
      const runRows = (bdRunSource || runs)
        .map((r) => {
          const day = r.reference_date || r.referenceDay;
          const finished = r.finished_at || r.finishedAt || r.startedAt || "";
          const clients = r.client_count ?? r.clientCount;
          const src = bdRunSource ? "BD" : "local";
          return `<tr><td>${escapeHtml(day)}</td><td>${escapeHtml(r.status)}</td><td class="num">${clients != null ? fmt.format(clients) : "—"}</td><td>${escapeHtml(String(finished))}</td><td class="muted-code">${src}</td></tr>`;
        })
        .join("");
      const gha = hist?.githubActions || meta.githubActions;
      const lastBd = hist?.lastValidRun || gha?.lastValidRun;
      const ghaHtml = gha
        ? alertBox(
            gha.schedule?.active ? "info" : "warning",
            "Executor: GitHub Actions",
            `<p><code>${escapeHtml(gha.workflow?.repository || "—")}</code> · ${escapeHtml(gha.workflow?.workflowFile || "monitoring-pipeline.yml")}</p><p>${escapeHtml(gha.message || "")}</p><p>Próximo planejado: ${escapeHtml(gha.schedule?.labelLocal || "—")} · cron UTC <code>${escapeHtml(gha.schedule?.cronUtc || "—")}</code> ${gha.schedule?.active ? "(ativo)" : "(cron ainda comentado no YAML)"}</p>${lastBd ? `<p>Última run válida BD: ${escapeHtml(lastBd.referenceDate || lastBd.reference_date)} · ${fmt.format(lastBd.snapshotRows ?? lastBd.snapshot_rows ?? 0)} snapshots · ${escapeHtml(lastBd.status)}</p>` : "<p>Sem run success no Business Data ainda.</p>"}${(gha.recentFailures || []).length ? `<p class="sub">Falhas BD: ${gha.recentFailures.map((f) => escapeHtml(`${f.reference_date} (${f.status})`)).join(", ")}</p>` : ""}`,
          )
        : "";
      const orch = hist?.orchestration || meta.orchestration;
      const n8nScheduleHtml = orch
        ? alertBox(
            "info",
            "Orquestração n8n (opcional)",
            `<p>Workflow <code>${escapeHtml(orch.workflowId || "—")}</code> — pode disparar GHA via API; HTTP direto exige URL pública.</p>`,
          )
        : "";
      const bdHistAlert =
        hist && !hist.ok
          ? alertBox("warning", "Histórico Business Data", `<p>${escapeHtml(hist.error || "Indisponível — configure BUSINESS_SUPABASE_* no servidor.")}</p>`)
          : hist?.ok
            ? alertBox(
                "info",
                "Histórico Business Data",
                `<p>${fmt.format(hist.runs?.length || 0)} execuções válidas · ${fmt.format(hist.freezes?.length || 0)} freezes · última consulta ${escapeHtml(hist.checkedAt || "—")}</p>${(hist.recentFailures || []).length ? `<p class="sub">Falhas recentes: ${hist.recentFailures.map((f) => escapeHtml(`${f.reference_date} (${f.status})`)).join(", ")}</p>` : ""}`,
              )
            : "";

      el.view.innerHTML = `
        <p class="note">${escapeHtml(mon.separacao || "Qualidade informacional ≠ saúde do cliente (HS). Prioridade de dados ≠ risco de churn.")}</p>
        <p class="sub">${escapeHtml(meta.notBaseQvNote || "Ausência de snapshots locais não indica falha na BASE QV.")}</p>
        ${execHtml}
        ${ghaHtml}
        ${n8nScheduleHtml}
        ${bdHistAlert}
        <section class="grid kpis">${kpiRows}</section>
        <section class="grid cards-2">
          ${card("Problemas por tipo", `Denominador: ${fmt.format(denom.n)} clientes`, stackShareChart(problems.map((p) => ({ label: p.tipo, count: p.count }))) + table("<th>Tipo</th><th class='num'>Ocorr.</th><th class='num'>%</th>", problemRows || "<tr><td colspan='3'>—</td></tr>"))}
          ${card("Por categoria", "Gestão de inconsistências", bars(byCat.map((c) => ({ label: c.categoria, count: c.count, percent: denom.n ? (c.count / denom.n) * 100 : 0 })), "count"))}
        </section>
        <section class="grid cards-2">
          ${card("Qualidade por programa", "n e % com denominador por grupo", table("<th>Programa</th><th class='num'>n</th><th class='num'>Hist.</th><th class='num'>Mec.</th><th class='num'>Incons.</th><th>Alerta</th>", byProgram.slice(0, 8).map(segRow).join("") || "<tr><td colspan='6'>—</td></tr>"))}
          ${card("Qualidade por EP", "Composição de carteira pode diferir", table("<th>EP</th><th class='num'>n</th><th class='num'>Hist.</th><th class='num'>Mec.</th><th class='num'>Incons.</th><th>Alerta</th>", byEp.slice(0, 8).map(segRow).join("") || "<tr><td colspan='6'>—</td></tr>"))}
        </section>
        <section class="grid cards-2">
          ${card("Evolução por snapshot", "Local ou Business Data (_dash_health_score)", table("<th>Dia ref.</th><th class='num'>Clientes</th><th>Fonte</th>", trendBody))}
          ${card("Comparação temporal", "Sem variação artificial no mesmo dia", `<p class="sub">${temporalNote}</p>`)}
        </section>
        ${card("Execuções do pipeline", "Preferência Business Data quando configurado", table("<th>Ref.</th><th>Status</th><th class='num'>Clientes</th><th>Término</th><th>Fonte</th>", runRows || "<tr><td colspan='5'>Nenhuma execução registrada.</td></tr>"))}
        <section class="card" id="qualityDiagSection">
          <h3>Diagnósticos por cliente</h3>
          <p class="sub">Busca local · paginação 20 · clique abre detalhe · não altera BASE QV</p>
          <input type="search" id="qualityTableSearch" class="input" placeholder="Buscar nome, código, programa, EP, tipo…" value="${escapeHtml(state.qualityDiagSearch)}" />
          ${table("<th>Cliente</th><th>Código</th><th>Programa</th><th>EP</th><th>Categoria</th><th>Tipo</th><th>Pri.</th><th>Evidência</th><th>Ação</th>", "", { compact: true, sticky: true })}
          <div id="qualityPager"></div>
        </section>
        <div class="card">
          <h3>Exportação autorizada</h3>
          <p class="sub">CSV gerencial para revisão na origem dos dados.</p>
          <button type="button" class="btn" id="btnQualityCsv">Exportar diagnósticos</button>
        </div>
      `;
      document.getElementById("btnQualityCsv")?.addEventListener("click", downloadQualityProblemsCsv);
      paintQualityDiagnosticsTable(el.view, diagnostics);
      const search = document.getElementById("qualityTableSearch");
      search?.addEventListener("input", () => {
        state.qualityDiagSearch = search.value;
        state.qualityPage = 1;
        paintQualityDiagnosticsTable(el.view, diagnostics);
      });
      bindTipTriggers(el.view);
      } catch (innerErr) {
        console.error("[quality render]", innerErr);
        el.view.innerHTML = `<section class="card error-state"><h2>Erro ao montar a página</h2><p>${escapeHtml(innerErr.message || "Dados incompletos.")}</p><button type="button" class="btn" id="retryQuality">Tentar novamente</button></section>`;
        document.getElementById("retryQuality")?.addEventListener("click", () => {
          state.monitoringLoaded = false;
          renderQuality();
        });
      }
    })
    .catch((err) => {
      el.view.innerHTML = `<section class="card error-state"><h2>Qualidade e Monitoramento</h2><p>${escapeHtml(qualityErrorMessage(err))}</p><button type="button" class="btn" id="retryQuality">Tentar novamente</button></section>`;
      document.getElementById("retryQuality")?.addEventListener("click", () => {
        state.monitoringLoaded = false;
        renderQuality();
      });
    });
}

function hs2aCompareTable(stats) {
  const body = (stats || [])
    .slice(0, 10)
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.label)}</td><td class="num">${fmt.format(item.n)}</td><td class="num">${formatNum(item.hsMediana, 0)}</td><td class="num">${formatNum(item.hsMedio, 1)}</td><td class="num">${pctFmt.format(item.coberturaReuniao || 0)}%</td></tr>`,
    )
    .join("");
  return table("<th>Grupo</th><th class='num'>n</th><th class='num'>HS med.</th><th class='num'>HS médio</th><th class='num'>c/ reunião</th>", body || "<tr><td colspan='5'>Sem grupos.</td></tr>");
}

function renderEngagement() {
  const rows = clients();
  const meetings = rows.reduce((sum, row) => sum + (row.totalMeetings || 0), 0);
  const tracked = rows.reduce((sum, row) => sum + (row.attendanceTracked || 0), 0);
  const rateValues = rows.map((row) => row.attendanceRate).filter((value) => value != null);
  const avgRate = rateValues.length ? rateValues.reduce((sum, value) => sum + value, 0) / rateValues.length : null;
  const series = meetingSeries(rows);
  el.view.innerHTML = `
    <section class="grid kpis">
      ${kpi("Reuniões", fmt.format(meetings), "Válidas no histórico")}
      ${kpi("Média por cliente", formatNum(mean(rows, "totalMeetings"), 1), "Contagem acumulada")}
      ${kpi("Cadência média", formatNum(mean(rows, "avgMeetingsPerMonth"), 2), "Reuniões por mês")}
      ${kpi("Recência mediana", formatNum(medianOf(rows.map((row) => row.daysSinceLastMeeting)), 0), "Dias desde a última")}
      ${kpi("Presença conhecida", avgRate == null ? "—" : `${pctFmt.format(avgRate)}%`, `${fmt.format(tracked)} registros de presença`)}
    </section>
    <section class="grid cards-2">
      ${card("Recência", "Queda de atividade aparece nas faixas mais longas.", bars(buckets(rows, recency)))}
      ${card("Intervalo mediano", "Dias entre reuniões consecutivas.", bars(buckets(rows, intervalBand)))}
    </section>
    <section class="grid cards-2">
      ${card("Por programa", "Cadência média de reuniões por mês", bars(groupStats(rows, "program").map((item) => ({ ...item, meta: formatNum(item.avgEngagement, 2), percent: item.avgEngagement }))))}
      ${card("Por EP", "Não informado por último", bars(groupStats(rows, "engineer").map((item) => ({ ...item, meta: formatNum(item.avgEngagement, 2), percent: item.avgEngagement }))))}
    </section>
    ${card("Evolução histórica", series.length > 1 ? "Volume mensal de reuniões válidas, até 18 meses." : "Ainda não há meses suficientes.", series.length > 1 ? columnChart(series) : `<p class="empty">Sem histórico mensal neste recorte.</p>`)}
  `;
}

function medianOf(values) {
  const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function renderMechanisms() {
  const rows = clients();
  const withAny = rows.filter((row) => (row.implementedCount || 0) + (row.inProgressCount || 0) > 0).length;
  const implemented = rows.reduce((sum, row) => sum + (row.implementedCount || 0), 0);
  const progress = rows.reduce((sum, row) => sum + (row.inProgressCount || 0), 0);
  const bands = buckets(rows, (row) => {
    const count = row.implementedCount || 0;
    if (count >= 3) return "3 ou mais";
    if (count >= 1) return "1 ou 2";
    return "Nenhum implantado";
  });
  el.view.innerHTML = `
    <section class="grid kpis">
      ${kpi("Com mecanismos", fmt.format(withAny), "Implantado ou em andamento")}
      ${kpi("Implantados", fmt.format(implemented), "Entram na nota M")}
      ${kpi("Em andamento", fmt.format(progress), "Não entram na nota M")}
      ${kpi("Cobertura", `${pctFmt.format(rows.length ? (rows.filter((row) => row.implementedCount > 0).length / rows.length) * 100 : 0)}%`, "Ao menos um implantado")}
      ${kpi("Score médio", formatNum(mean(rows, "healthScore")), "No recorte")}
    </section>
    <section class="grid cards-2">
      ${card("Composição", "Quantidade implantada", bars(bands))}
      ${card("Tipos utilizados", "Somente mecanismos já implantados", bars(typeCounts(rows), "count"))}
    </section>
    <section class="grid cards-2">
      ${card("Por programa", "Cobertura e score", comparisonTable(groupStats(rows, "program")))}
      ${card("Por EP", "Não informado por último", comparisonTable(groupStats(rows, "engineer")))}
    </section>
    ${card("Associação com engajamento e score", "Médias do recorte. Associação não é causa.", table("<th>Implantados</th><th class='num'>Clientes</th><th class='num'>Score médio</th><th class='num'>Reuniões/mês</th><th class='num'>Nota E</th>", [
      ["Nenhum implantado", (row) => !row.implementedCount],
      ["1 ou 2", (row) => row.implementedCount >= 1 && row.implementedCount <= 2],
      ["3 ou mais", (row) => row.implementedCount >= 3],
    ].map(([label, test]) => {
      const subset = rows.filter(test);
      return `<tr><td>${label}</td><td class="num">${fmt.format(subset.length)}</td><td class="num">${formatNum(mean(subset, "healthScore"))}</td><td class="num">${formatNum(mean(subset, "avgMeetingsPerMonth"), 2)}</td><td class="num">${formatNum(mean(subset, "engagementScore"), 0)}</td></tr>`;
    }).join("")))}
  `;
}

function renderNps(payload) {
  const nps = payload.nps || {};
  const rows = clients().filter((row) => Number.isFinite(row.npsScore));
  const classRows = buckets(clients(), (row) => npsLabel(row.npsClass));
  const byScore = ["Saudável", "Atenção", "Crítico", "Em implantação", "Sem registro"].map((label) => {
    const subset = clients().filter((row) => row.finalClass === label && Number.isFinite(row.npsScore));
    const promoters = subset.filter((row) => row.npsClass === "promoter").length;
    const detractors = subset.filter((row) => row.npsClass === "detractor").length;
    const index = subset.length ? ((promoters - detractors) / subset.length) * 100 : null;
    return { label, count: subset.length, percent: index || 0, meta: index == null ? "sem resposta" : `NPS ${formatNum(index, 0)} · n=${subset.length}` };
  });
  const correlations = nps.correlations || [];
  const correlationCards = correlations.map((item) => card(
    item.label,
    evidence(item.sampleSize || 0, item.pearson),
    `<div class="cols"><span>Pearson</span><strong>${item.pearson == null ? "—" : formatNum(item.pearson, 3)}</strong><span>Spearman</span><strong>${item.spearman == null ? "—" : formatNum(item.spearman, 3)}</strong><span>Amostra</span><strong>${fmt.format(item.sampleSize || 0)}</strong></div>`,
  )).join("");
  const renewal = (nps.renewalByClass || []).map((row) => `<tr><td>${escapeHtml(row.label)}</td><td class="num">${fmt.format(row.respondents || 0)}</td><td class="num">${fmt.format(row.renewed || 0)}</td><td class="num">${row.renewalRate == null ? "—" : `${pctFmt.format(row.renewalRate)}%`}</td></tr>`).join("");
  el.view.innerHTML = `
    ${alertBox("info", "NPS e correlações", "<p>Associação descritiva no recorte atual — não indica causalidade nem risco individual.</p>")}
    <section class="grid kpis">
      ${kpi("Respondentes", fmt.format(nps.respondents || 0), `${pctFmt.format(nps.coveragePercent || 0)}% do recorte`)}
      ${kpi("Clientes no recorte", fmt.format(nps.totalClients || 0), "Base do filtro atual")}
      ${kpi("Pares E × NPS", fmt.format(correlations[0]?.sampleSize || 0), "Última resposta válida")}
      ${kpi("Pares M × NPS", fmt.format(correlations[1]?.sampleSize || 0), "Última resposta válida")}
    </section>
    <section class="grid cards-2">
      ${card("Distribuição das respostas", "Última nota válida de cada cliente", bars(classRows))}
      ${card("NPS por faixa de score", "Promotores menos detratores, dividido pelos respondentes da faixa", bars(byScore, "count"))}
    </section>
    <section class="grid cards-2">${correlationCards}</section>
    <section class="grid cards-2">
      ${card("Engajamento × NPS", `n = ${fmt.format(rows.length)}. Correlação não é causa.`, scatter(rows.map((row) => ({ x: row.npsScore, y: row.engagementScore, label: row.clientCode }))))}
      ${card("Mecanismos × NPS", "Nota M contra a última nota NPS.", scatter(rows.map((row) => ({ x: row.npsScore, y: row.mechanismScore, label: row.clientCode }))))}
    </section>
    ${card("Renovação por classe NPS", "Clientes com resposta válida. Renovação observa o ciclo, não prevê o futuro.", table("<th>Classe</th><th class='num'>Respondentes</th><th class='num'>Renovados</th><th class='num'>Taxa</th>", renewal))}
    <p class="note">Os coeficientes descrevem associação no recorte. Amostra pequena, respostas ausentes e o fato de o NPS ser posterior a parte da jornada limitam qualquer leitura preditiva.</p>
  `;
}

function filled(rows, test) {
  const count = rows.filter(test).length;
  return { count, percent: rows.length ? (count / rows.length) * 100 : 0 };
}

function describeGroup(rows, test) {
  const subset = rows.filter(test);
  return {
    n: subset.length,
    hs: mean(subset, "healthScore"),
    e: mean(subset, "engagementScore"),
    m: mean(subset, "mechanismScore"),
    meetings: mean(subset, "avgMeetingsPerMonth"),
  };
}

function groupLine(label, stats) {
  if (!stats.n) return `<tr><td>${escapeHtml(label)}</td><td class="num">0</td><td colspan="4">Sem clientes neste grupo no recorte.</td></tr>`;
  return `<tr><td>${escapeHtml(label)}</td><td class="num">${fmt.format(stats.n)}</td><td class="num">${formatNum(stats.hs)}</td><td class="num">${formatNum(stats.e, 0)}</td><td class="num">${formatNum(stats.m, 0)}</td><td class="num">${formatNum(stats.meetings, 2)}</td></tr>`;
}

const RESEARCH_TABS = [
  { id: "study", label: "Visão do Estudo" },
  { id: "audit", label: "Auditoria de Dados" },
  { id: "validation", label: "Validação do HS" },
  { id: "modeling", label: "Modelagem" },
];

const RESEARCH_POPULATIONS = [
  { value: "total", label: "Total histórico" },
  { value: "ativos", label: "Ativos (operacional)" },
  { value: "cancelados", label: "Com evidência de cancelamento" },
  { value: "renovados", label: "Ciclo > 1 (proxy)" },
];

function researchTabButtons() {
  return RESEARCH_TABS.map(
    (tab) =>
      `<button type="button" class="tab-btn${state.researchTab === tab.id ? " active" : ""}" data-research-tab="${tab.id}">${escapeHtml(tab.label)}</button>`,
  ).join("");
}

function bindResearchTabs() {
  el.view.querySelectorAll("[data-research-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.researchTab = button.dataset.researchTab;
      renderResearch();
    });
  });
  document.getElementById("researchPopulation")?.addEventListener("change", (event) => {
    state.researchPopulation = event.target.value || "total";
    loadData();
  });
  document.getElementById("btnStudyCsv")?.addEventListener("click", downloadCsv);
}

function researchStateBanner() {
  const b = state.researchBundle;
  if (!state.researchBundleLoaded) {
    return `<p class="note">Carregando artefatos de pesquisa (independente do Health Score)…</p>`;
  }
  const label = b?.researchStateLabel || "Resultados de pesquisa indisponíveis neste ambiente. Regere os artefatos.";
  const cmds = (b?.regenerateCommands || []).slice(0, 5).map((c) => `<code>${escapeHtml(c)}</code>`).join(" · ");
  const modelAt = b?.data?.modelingResults?.generatedAt;
  const src = state.predictiveReadiness?.source === "modeling_results.json"
    ? " · churn/audit parcial via modeling_results (preferir build:predictive-validated)"
    : "";
  if (b?.researchState === "artifacts_missing") {
    return alertBox("warning", label, `<p>${cmds}</p><p>Sem probabilidade individual de churn publicada.</p>`);
  }
  return alertBox(
    "experimental",
    label,
    `<p>Operacional: snapshot BASE QV · Pesquisa: datasets congelados${modelAt ? ` · modelagem ${escapeHtml(modelAt)}` : ""}${escapeHtml(src)}</p><p>Modelos A–E são experimentais — não aprovados para operação.</p>`,
  );
}

function readinessBlock() {
  const r = state.predictiveReadiness;
  if (!r) {
    return `<p class="note">Pesquisa (Etapa 3): <strong>exports/predictive-study/predictive_readiness.json</strong> ausente. Regere com <strong>npm run build:predictive-validated</strong>. Métricas A–E podem ainda aparecer na aba Modelagem se <code>modeling_results.json</code> existir.</p>`;
  }
  const cs = r.churnStats || {};
  const a = r.audit || {};
  const churnTitle = r.source === "modeling_results.json" ? "Churn (síntese)" : "Churn confirmado";
  const churnSub = r.source === "modeling_results.json" ? "Episódios — preferir export validado" : "Consolidado (episódios, não clientes únicos do snapshot)";
  return `
    <section class="grid cards-3">
      ${card(churnTitle, churnSub, `<p class="formula">${fmt.format(cs.episodesConfirmed ?? cs.positives ?? 0)}</p><p class="sub">${fmt.format(cs.episodesWithoutDate || 0)} sem data · ${fmt.format(cs.dateConflicts || 0)} conflitos</p>`)}
      ${card("HS histórico", "Reconstrução mensal (pesquisa)", `<p class="formula">${fmt.format(a.hsIntegral || 0)}</p><p class="sub">integral · ${fmt.format(a.hsParcial || 0)} parcial · ${fmt.format(a.hsNaoReconstruivel || 0)} não reconstruível</p>`)}
      ${card("Elegíveis 90d", "Horizonte congelado", `<p class="formula">${fmt.format(a.rowsEligible90 || 0)}</p><p class="sub">positivos ${fmt.format(a.positives90 || 0)} · censura ${fmt.format(a.censored90 || 0)}</p>`)}
    </section>`;
}

function renderResearchStudy(rows, audit) {
  const pop = audit?.population || {};
  const counts = state.payload?.metadata?.counts || {};
  const trained = state.modelingResults?.status === "ok";
  const objective = trained
    ? `<p>Experimentos A–E treinados sobre dataset histórico validado. Métricas na aba <strong>Modelagem</strong> — não usar operacionalmente.</p>`
    : `<p>Auditoria e extração para estimar churn e testar E, M e HS experimental. Treine com <strong>npm run model:all</strong> após base validada.</p>`;
  return `
    ${researchStateBanner()}
    ${readinessBlock()}
    <section class="grid cards-2">
      ${card("Objetivo", audit?.studyPhase || "Pesquisa preditiva", objective)}
      ${card("Desfechos (candidatos)", "Definições na BASE QV (operacional)", `<ul class="plain-list"><li><strong>Churn:</strong> ${escapeHtml(audit?.definitions?.churnDashboard || "—")}</li><li><strong>Renovação:</strong> ${escapeHtml(audit?.definitions?.renewalDashboard || "—")}</li></ul>`)}
    </section>
    <section class="grid cards-3">
      ${card("População carregada", "Operacional — snapshot", `<p class="formula">${fmt.format(pop.clientsLoaded || counts.clients || 0)}</p><p class="sub">clientes na BASE QV</p>`)}
      ${card("No recorte do estudo", "Filtros exploratórios (programa/EP/período)", `<p class="formula">${fmt.format(rows.length)}</p><p class="sub">cluster ${escapeHtml(pop.appliedCluster || effectiveCluster())}</p>`)}
      ${card("Evidência de cancelamento", "Snapshot — não substitui churn consolidado", `<p class="formula">${fmt.format(pop.cancelEvidence || 0)}</p><p class="sub">${fmt.format(pop.cancelWithDate || 0)} com data · ver cartões de pesquisa acima</p>`)}
    </section>
    ${card("Camadas de dados", "Não somar populações incompatíveis", `<div class="chips"><span class="chip">Operacional: E, M, HS atuais</span><span class="chip">Pesquisa: churn episódios</span><span class="chip">Modelos A–E congelados</span></div><p class="note">Financeiro e suporte detalhados: exports/predictive-study (npm run export:predictive).</p>`)}
    ${prospectiveFreezesCard()}
  `;
}

function prospectiveFreezesCard() {
  const hist = state.monitoringHistory;
  if (!hist?.ok) {
    return alertBox(
      "warning",
      "Freezes prospectivos (Business Data)",
      `<p>${escapeHtml(hist?.error || "Configure Business Data para consultar congelamentos mensais persistidos.")}</p>`,
    );
  }
  const rows = (hist.freezes || [])
    .map(
      (f) =>
        `<tr><td>${escapeHtml(f.reference_month || f.reference_date)}</td><td>${escapeHtml(f.population || "—")}</td><td class="num">${fmt.format(f.row_count ?? 0)}</td><td class="num">${f.horizon_days ?? "—"}d</td><td>${escapeHtml(f.maturation_date || "—")}</td><td class="muted-code">${escapeHtml((f.integrity_hash || "").slice(0, 12))}…</td></tr>`,
    )
    .join("");
  return card(
    "Freezes prospectivos persistidos",
    "Schema _dash_health_score · não recalculados retroativamente",
    table(
      "<th>Mês ref.</th><th>Pop.</th><th class='num'>Linhas</th><th class='num'>Horizonte</th><th>Maturação</th><th>Hash</th>",
      rows || "<tr><td colspan='6'>Nenhum freeze gravado ainda — pipeline mensal após validação.</td></tr>",
    ),
  );
}

function renderResearchAudit(rows, audit) {
  const coverage = audit?.coverage || {};
  const nps = coverage.nps || {};
  const sources = (audit?.sources || [])
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.table)}</td><td>${escapeHtml(item.role)}</td><td class="num">${item.rowsInDashboardLoad == null ? "—" : fmt.format(item.rowsInDashboardLoad)}</td></tr>`,
    )
    .join("");
  const localCoverage = [
    ["Programa", filled(rows, (row) => row.program && row.program !== "Não informado")],
    ["Engenheiro", filled(rows, (row) => row.engineer && row.engineer !== "Não informado")],
    ["Data de entrada", filled(rows, (row) => row.entryDate)],
    ["Reuniões", filled(rows, (row) => row.totalMeetings > 0)],
    ["Mecanismos implantados", filled(rows, (row) => row.implementedCount > 0)],
    ["NPS", filled(rows, (row) => row.npsScore != null)],
    ["Evidência de cancelamento", filled(rows, (row) => row.hasCancellationEvidence)],
    ["Renovação (ciclo > 1)", filled(rows, (row) => row.hasRenewed)],
  ];
  const coverageBody = localCoverage
    .map(([label, item]) => `<tr><td>${escapeHtml(label)}</td><td class="num">${fmt.format(item.count)}</td><td class="num">${pctFmt.format(item.percent)}%</td></tr>`)
    .join("");
  const cancelTbl = audit?.cancellationsTable || {};
  return `
    ${card("Fontes identificadas", "Inventário lógico — contagens do carregamento do dashboard", table("<th>Tabela</th><th>Papel</th><th class='num'>Linhas</th>", sources))}
    <section class="grid cards-2">
      ${card("Cancelamentos (tabela)", "Arquivados vs ativos", `<div class="cols"><span>Total lidos</span><strong>${fmt.format(cancelTbl.totalRows || 0)}</strong><span>Não arquivados</span><strong>${fmt.format(cancelTbl.nonArchivedRows || 0)}</strong><span>Arquivados</span><strong>${fmt.format(cancelTbl.archivedRows || 0)}</strong></div>`)}
      ${card("Cobertura temporal", "Resumo cadastral e reuniões", `<div class="cols"><span>Entrada clientes</span><strong>${escapeHtml(coverage.clientEntry?.min?.slice(0, 10) || "—")} → ${escapeHtml(coverage.clientEntry?.max?.slice(0, 10) || "—")}</strong><span>Reuniões</span><strong>${escapeHtml(coverage.meetings?.min?.slice(0, 10) || "—")} → ${escapeHtml(coverage.meetings?.max?.slice(0, 10) || "—")}</strong><span>NPS ausente (carteira)</span><strong>${formatNum(nps.missingPercent, 1)}%</strong></div>`)}
    </section>
    ${card("Qualidade no recorte atual", "Ausências na população selecionada", table("<th>Variável</th><th class='num'>Preenchidos</th><th class='num'>Cobertura</th>", coverageBody))}
    ${card("Dataset temporal", audit?.temporalDataset?.status || "parcial", `<p><strong>Unidade:</strong> ${escapeHtml(audit?.temporalDataset?.unit || "—")}</p><p>${escapeHtml(audit?.temporalDataset?.note || "")}</p><p class="note">Riscos: ${(audit?.temporalDataset?.leakageRisks || []).map(escapeHtml).join(" · ")}</p>`)}
    ${card("Extração reproduzível", "Pasta exports/predictive-study", `<p>Etapa 2: export:predictive · Etapa 3: build:predictive-validated (churn_consolidado, hs_historico_mensal, dataset_preditivo_validado, predictive_readiness.json).</p>`)}
    ${readinessBlock()}
  `;
}

function renderMiniRoc(curves) {
  const pts = curves?.roc || [];
  if (!pts.length) return "<p class=\"note\">Curva ROC indisponível.</p>";
  const poly = pts.map((p) => `${(p.fpr * 140).toFixed(1)},${(140 - p.tpr * 140).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 150 150" class="mini-chart" aria-hidden="true"><polyline fill="none" stroke="var(--line)" points="0,140 140,140"/><polyline fill="none" stroke="var(--accent)" stroke-width="2" points="${poly}"/></svg>`;
}

function renderHs2LabSection(m) {
  if (!m?.version) {
    return `<p class="note">Laboratório HS 2.0: execute <strong>npm run model:etapa7</strong>.</p>`;
  }
  const h = m.highlights || {};
  const perfis = h.perfis || {};
  const perfilRows = Object.entries(perfis)
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td class="num">${fmt.format(v)}</td></tr>`)
    .join("");
  const comp = m.comparison_cache || { hs_v1: m.comparison_summary };
  const distHist = comp?.hs_v1?.distribuicao_faixas || m.comparison_summary?.hs_v1_distribuicao || [];
  const distAtual = state.hs2aLabSnapshot?.carteiraAtual?.hsDistribuicao || [];
  const perfHist = m.highlights?.perfis || {};
  const perfAtual = Object.fromEntries((state.hs2aLabSnapshot?.carteiraAtual?.perfis || []).map((p) => [p.code, p.n]));
  const compareDistRows = distHist
    .map((b) => {
      const cur = distAtual.find((x) => x.faixa === b.faixa);
      return `<tr><td>${escapeHtml(b.faixa)}</td><td class="num">${pctFmt.format((b.share || 0) * 100)}%</td><td class="num">${cur ? pctFmt.format(cur.share * 100) : "—"}%</td></tr>`;
    })
    .join("");
  const comparePerfRows = Object.keys({ ...perfHist, ...perfAtual })
    .slice(0, 8)
    .map((code) => `<tr><td>${escapeHtml(code)}</td><td class="num">${fmt.format(perfHist[code] || 0)}</td><td class="num">${fmt.format(perfAtual[code] || 0)}</td></tr>`)
    .join("");
  return `
    <section class="research-hs2-lab">
      <h2 class="section-title">Laboratório HS 2.0 <span class="tag-experimental">experimental</span></h2>
      <p class="note">Não altera HS operacional nem publica risco individual. HS 2.0A = mesmo score V1 + contexto; 2.0B = dimensões sem peso definitivo.</p>
      ${card("V1 × 2.0A", "Score idêntico; interpretação ampliada", `<div class="cols"><span>Cobertura HS V1</span><strong>${pctFmt.format((h.hs_v1_cobertura || 0) * 100)}%</strong><span>Val confirmatória</span><strong>${m.highlights?.confirmatoria_viavel ? "Candidatos disponíveis" : "Prospectiva"}</strong></div>`)}
      ${compareDistRows ? card("HS V1 — histórico (pesquisa) × carteira atual", "Recortes podem diferir — descritivo", table("<th>Faixa</th><th class='num'>Hist %</th><th class='num'>Atual %</th>", compareDistRows)) : ""}
      ${comparePerfRows ? card("Perfis — histórico × atual (obs)", "Carregue Health Score para atualizar coluna atual", table("<th>Perfil</th><th class='num'>Hist obs</th><th class='num'>Atual clientes</th>", comparePerfRows)) : ""}
      ${perfilRows ? card("Perfis de relacionamento (2.0A)", "Não são risco automático", table("<th>Perfil</th><th class='num'>Obs</th>", perfilRows)) : ""}
      ${card("Limitações", "Laboratório", `<ul class="plain-list"><li>Jun/2026: comparações exploratórias apenas.</li><li>NPS/suporte: cobertura insuficiente para 2.0B completo.</li><li>Qualidade informacional separada do HS numérico.</li></ul><p class="sub">Artefatos: HS_2_0_PROTOTYPE.md · prospective_validation_plan.md</p>`)}
    </section>`;
}

function renderHsEvolutionSection(m) {
  if (!m?.version) {
    return `<p class="note">Evolução do HS: execute <strong>npm run model:etapa6</strong> (após Etapa 5).</p>`;
  }
  const h = m.highlights || {};
  const crit = m.success_criteria?.markdown_bullets || "";
  const bullets = crit.split("\n").filter(Boolean).slice(0, 6);
  const timing = (h.timing_buckets || [])
    .map((b) => `<tr><td>${escapeHtml(b.faixa_dias_pos_ref)}</td><td class="num">${fmt.format(b.eventos)}</td><td class="num">${pctFmt.format((b.share_positivos || 0) * 100)}%</td></tr>`)
    .join("");
  return `
    <section class="research-evolution">
      <h2 class="section-title">Evolução do Health Score</h2>
      <p class="note">HS V1 operacional inalterado. Abaixo: evidência (Etapa 6), hipóteses e proposta HS 2.0.</p>
      ${card("HS atual (V1)", "50/50 E/M · pesquisa histórica", `<p>Formulação experimental documentada; faixa 0–20 é <strong>heterogênea</strong> (implantação, sem reunião, M=0).</p>`)}
      ${card("Cancelamento já na referência", "Obrigatório — antecipação vs efetivação", `<div class="cols"><span>Obs. com solicitação formal ≤ ref</span><strong>${fmt.format(h.solicitacao_antes_ref_obs || 0)}</strong><span>Share positivos c/ solicitação prévia</span><strong>${pctFmt.format((h.positivos_com_solicitacao_previa_share || 0) * 100)}%</strong></div><p class="sub">Estudo principal = antecipação (sem sinal formal até a ref).</p>`)}
      ${timing ? card("Timing do churn (positivos)", "Dias após data de referência", table("<th>Faixa</th><th class='num'>Eventos</th><th class='num'>% positivos</th>", timing)) : ""}
      ${card("Implantação", "Churn observado 90d (IC no relatório)", `<p class="sub">Taxa agregada ~${pctFmt.format((h.implantacao_churn_rate || 0) * 100)}% — ver causas em RELATORIO_ETAPA6.md</p>`)}
      ${card("Critérios de sucesso (síntese)", "Comprovado vs proposta", `<ul class="plain-list">${bullets.map((line) => `<li>${escapeHtml(line.replace(/^\d+\.\s*/, ""))}</li>`).join("")}</ul><p class="sub">Especificação: <code>HS_2_0_SPEC.md</code> · Perfis: <code>hs_profiles_analysis.json</code></p>`)}
    </section>`;
}

function renderRobustnessHsSection(r) {
  if (!r?.hs_bands?.bands?.length) {
    return `<p class="note">Robustez do HS: execute <strong>npm run model:robustness</strong> (após Etapa 3/4).</p>`;
  }
  const bandRows = r.hs_bands.bands
    .map(
      (b) =>
        `<tr><td>${escapeHtml(b.hs_faixa)}</td><td class="num">${fmt.format(b.observacoes)}</td><td class="num">${fmt.format(b.clientes_unicos)}</td><td class="num">${fmt.format(b.clientes_com_churn)}</td><td class="num">${pctFmt.format((b.taxa_por_observacao || 0) * 100)}%</td><td class="num">${pctFmt.format((b.taxa_ci_low || 0) * 100)}–${pctFmt.format((b.taxa_ci_high || 0) * 100)}%</td><td class="num">${fmt.format(b.sem_reuniao || 0)}</td></tr>`,
    )
    .join("");
  const ctrl = (r.hs_bands.controlled_reuniao || [])
    .map(
      (c) =>
        `<tr><td>${escapeHtml(c.hs_faixa)}</td><td>${c.com_reuniao ? "Com reunião" : "Sem reunião"}</td><td class="num">${fmt.format(c.n)}</td><td class="num">${pctFmt.format((c.taxa || 0) * 100)}%</td><td class="num">${pctFmt.format((c.ci_low || 0) * 100)}–${pctFmt.format((c.ci_high || 0) * 100)}%</td></tr>`,
    )
    .join("");
  const ctx = (r.zero_hs_context?.distribuicao || [])
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.contexto_hs_baixo)}</td><td class="num">${fmt.format(row.n)}</td><td class="num">${fmt.format(row.clientes)}</td><td class="num">${pctFmt.format((row.churn_rate || 0) * 100)}%</td></tr>`,
    )
    .join("");
  const rec = r.recencia?.estatisticas || {};
  const recChurn = r.recencia?.churn_rate_recencia_ausente || {};
  return `
    <section class="research-robustness">
      <h2 class="section-title">Robustez do HS</h2>
      <p class="note">Intervalos por reamostragem de clientes (Etapa 5). Descritivo — não substitui teste preditivo.</p>
      ${card("Faixas de HS (90d)", "Observação × cliente · IC cluster", table("<th>Faixa</th><th class='num'>Obs</th><th class='num'>Clientes</th><th class='num'>c/ churn</th><th class='num'>Taxa</th><th class='num'>IC 95%</th><th class='num'>Sem reunião</th>", bandRows))}
      ${card("Controle: reuniões", "Dentro de cada faixa HS", table("<th>Faixa</th><th>Recorte</th><th class='num'>n</th><th class='num'>Taxa</th><th class='num'>IC</th>", ctrl || "<tr><td colspan='5'>Amostras pequenas em alguns recortes.</td></tr>"))}
      ${card("HS 0–20: contexto auxiliar", "Não altera fórmula V1", table("<th>Contexto</th><th class='num'>Obs</th><th class='num'>Clientes</th><th class='num'>Churn 90d</th>", ctx))}
      ${card("Recência", escapeHtml(r.recencia?.motivo_principal || ""), `<div class="cols"><span>Ausente</span><strong>${pctFmt.format((rec.ausente_pct || 0) * 100)}%</strong><span>Churn se recência ausente</span><strong>${pctFmt.format((recChurn.rate || 0) * 100)}% (${pctFmt.format((recChurn.ci_low || 0) * 100)}–${pctFmt.format((recChurn.ci_high || 0) * 100)}%)</span></div><p class="sub">${escapeHtml(r.recencia?.interpretacao_ausencia || "")}</p>`)}
      ${card("Recomendações HS 2.0", "Pesquisa", `<ul class="plain-list">${(r.hs20_recommendations || []).map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`)}
    </section>`;
}

function renderHsBandTable(hsEda) {
  const rows = hsEda?.hs_churn_rate_by_band || [];
  if (!rows.length) return "";
  const body = rows
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.hs_faixa)}</td><td class="num">${fmt.format(r.n)}</td><td class="num">${pctFmt.format((r.churn_rate_90d || 0) * 100)}%</td></tr>`,
    )
    .join("");
  return card(
    "Churn observado 90d por faixa de HS",
    "Descritivo no dataset validado (Etapa 4) — não é performance preditiva",
    table("<th>Faixa HS</th><th class='num'>n</th><th class='num'>Taxa churn 90d</th>", body),
  );
}

function renderResearchValidation(rows) {
  const m = state.modelingResults;
  const r = state.robustnessResults;
  const descBlock = m?.status === "ok"
    ? renderHsBandTable(m.hs_eda)
    : `<p class="note">Execute <strong>npm run model:all</strong> para estatísticas do dataset validado.</p>`;
  const robustBlock = renderRobustnessHsSection(r);
  const evolutionBlock = renderHsEvolutionSection(state.etapa6Results);
  const labBlock = renderHs2LabSection(state.etapa7Results);
  const churn = describeGroup(rows, (row) => row.hasCancellationEvidence);
  const active = describeGroup(rows, (row) => !row.hasCancellationEvidence);
  const renewed = describeGroup(rows, (row) => row.hasRenewed);
  const notRenewed = describeGroup(rows, (row) => !row.hasRenewed);
  const engaged = describeGroup(rows, (row) => row.engagementLabel === "Saudável");
  const silent = describeGroup(rows, (row) => !row.totalMeetings);
  return `
    ${robustBlock}
    ${evolutionBlock}
    ${labBlock}
    ${descBlock}
    <p class="note">Comparação <strong>descritiva</strong> no recorte operacional atual (snapshot). Métricas preditivas estão na aba Modelagem.</p>
    ${card("HS, E e M por grupo", "Inclua cancelados na população do estudo para ler churn", table("<th>Grupo</th><th class='num'>n</th><th class='num'>HS</th><th class='num'>E</th><th class='num'>M</th><th class='num'>Reuniões/mês</th>", [
      groupLine("Com evidência de cancelamento", churn),
      groupLine("Sem evidência de cancelamento", active),
      groupLine("Renovados (ciclo > 1)", renewed),
      groupLine("Não renovados", notRenewed),
      groupLine("Engajamento saudável", engaged),
      groupLine("Sem reuniões", silent),
    ].join("")))}
    ${card("Confusão e limites", "Leitura cautelosa", `<ul class="plain-list"><li>Status e ciclo atuais podem refletir o desfecho — não usar como preditor histórico.</li><li>NPS ausente em grande parte da carteira.</li><li>Renovação por ciclo ≠ evento em renewal_cycles.</li><li>Scores calculados com histórico completo de reuniões/mecanismos, não recortados à data de referência.</li></ul>`)}
  `;
}

function renderResearchModeling(audit) {
  const exp = state.modelingResults;
  if (!exp || exp.status !== "ok") {
    return `${card("Experimentos", "Pesquisa — não operacional", `<p class="note">Execute <strong>npm run model:all</strong> após <strong>build:predictive-validated</strong>.</p><p>${escapeHtml(exp?.reason || "")}</p>`)}`;
  }
  const split = exp.split || {};
  const ranking = (exp.ranking_test || [])
    .map(
      (row) => {
        const body = exp.models?.[row.model_id]?.test || {};
        const boot = body.bootstrap_roc_auc || {};
        const ci = boot.ci_low != null ? `${formatNum(boot.ci_low, 3)}–${formatNum(boot.ci_high, 3)}` : "—";
        return `<tr><td>${escapeHtml(row.model_id)}</td><td>${escapeHtml(row.label)}</td><td class="num">${formatNum(body.roc_auc, 3)}</td><td class="num">${formatNum(body.pr_auc, 3)}</td><td class="num">${ci}</td></tr>`;
      },
    )
    .join("");
  const best = exp.ranking_test?.[0];
  const bestTest = best ? exp.models[best.model_id]?.test : null;
  const limits = (exp.limitations || []).map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  const rob = state.robustnessResults;
  const mSens = rob?.m_sensitivity || {};
  const sensRows = Object.entries(mSens)
    .map(([key, val]) => {
      const test = val.test?.roc_auc ?? val.test_subset?.roc_auc ?? val.skipped;
      return `<tr><td>${escapeHtml(key)}</td><td class="num">${typeof test === "number" ? formatNum(test, 3) : escapeHtml(String(test ?? "—"))}</td></tr>`;
    })
    .join("");
  const recVar = rob?.recencia_models || {};
  const recRows = Object.entries(recVar)
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td class="num">${formatNum(v?.roc_auc, 3)}</td><td class="num">${formatNum(v?.pr_auc, 3)}</td></tr>`)
    .join("");
  const paired = rob?.paired_model_diffs_test?.E_minus_C_auc || {};
  const conf = rob?.conflict_sensitivity || {};
  const aucBars = (exp.ranking_test || []).map((row) => ({
    label: `${row.model_id} · ${row.label}`,
    value: exp.models?.[row.model_id]?.test?.roc_auc ?? 0,
  }));
  const prBars = (exp.ranking_test || []).map((row) => ({
    label: `${row.model_id}`,
    value: exp.models?.[row.model_id]?.test?.pr_auc ?? 0,
  }));
  return `
    ${alertBox("experimental", "Modelagem preditiva (histórica)", "<p>Resultados congelados do experimento — filtros do dashboard não recalculam métricas.</p>")}
    ${card("Confiança metodológica", `OOS: ${escapeHtml(exp.oos_confidence || "—")}`, `<p class="note">${escapeHtml(split.note || "")} ${tipIcon("roc_auc")}${tipIcon("pr_auc")}</p><p class="sub">Treino ${fmt.format(exp.sample?.train || 0)} obs · Teste ${fmt.format(exp.sample?.test || 0)} · Sobreposição clientes treino/teste: ${fmt.format(split.client_overlap?.train_test || 0)}</p>`)}
    <section class="grid cards-2">
      ${card("ROC-AUC — modelos A–E", "Teste hold-out", hBarMetrics(aucBars, { valueKey: "value", format: (v) => formatNum(v, 3) }))}
      ${card("PR-AUC — modelos A–E", "Churn raro — leitura complementar", hBarMetrics(prBars, { valueKey: "value", format: (v) => formatNum(v, 3) }))}
    </section>
    ${card("Comparação modelos A–E (teste hold-out)", "Regressão logística regularizada — pesquisa", table("<th>ID</th><th>Modelo</th><th class='num'>ROC-AUC</th><th class='num'>PR-AUC</th><th class='num'>IC AUC (cliente)</th>", ranking, { compact: true }))}
    <section class="grid cards-2">
      ${card("ROC (melhor PR-AUC)", escapeHtml(best?.label || "—"), renderMiniRoc(bestTest?.curves))}
      ${card("Calibração (bins)", "Teste — frequência vs probabilidade", table("<th class='num'>Previsto</th><th class='num'>Observado</th><th class='num'>n</th>", (bestTest?.calibration || []).slice(0, 6).map((b) => `<tr><td class="num">${formatNum((b.bin_lo + b.bin_hi) / 2, 2)}</td><td class="num">${formatNum(b.observed, 2)}</td><td class="num">${fmt.format(b.n)}</td></tr>`).join("")))}
    </section>
    ${rob ? card("Sensibilidade M (exploratório, mesma partição)", "Jun/2026 teste final — Etapa 5", table("<th>Config</th><th class='num'>ROC-AUC teste</th>", sensRows || "<tr><td colspan='2'>—</td></tr>")) : ""}
    ${rob && recRows ? card("Variantes recência (modelo A-like)", "Comparar sem leakage futuro", table("<th>Abordagem</th><th class='num'>ROC-AUC</th><th class='num'>PR-AUC</th>", recRows)) : ""}
    ${rob ? card("Incerteza E vs C", "Bootstrap pareado por cliente (teste)", `<p class="sub">Δ AUC (E−C): ${formatNum(paired.diff_mean, 3)} · IC ${formatNum(paired.ci_low, 3)} – ${formatNum(paired.ci_high, 3)}</p>`) : ""}
    ${rob ? card("Conflitos de data (66)", "Modelo E — ROC-AUC teste", `<div class="cols"><span>Excluir conflitos</span><strong>${formatNum(conf.excluir_66?.test_roc_auc, 3)}</strong><span>Incluir todos</span><strong>${formatNum(conf.incluir_todos?.test_roc_auc, 3)}</strong></div>`) : ""}
    ${rob ? card("Prontidão calibração", "Etapa 5", `<p class="note">Sem conjunto de validação independente — calibração Platt/isotonic adiada. Etapa 4 permanece em <code>modeling_results_etapa4.json</code>.</p>`) : ""}
    ${card("Limitações", "Não usar para decisão operacional", `<ul class="plain-list">${limits}</ul>`)}
    ${card("Export recorte operacional", "Não contém scores individuais de risco", `<button type="button" class="btn" id="btnStudyCsv">Exportar CSV do recorte</button>`)}
  `;
}

async function ensureResearchBundle(force = false) {
  if (state.researchBundleLoaded && !force) return state.researchBundle;
  try {
    const response = await fetch("/api/research-bundle");
    state.researchBundle = response.ok ? await response.json() : null;
    const data = state.researchBundle?.data || {};
    state.predictiveReadiness = data.predictiveReadiness ?? null;
    state.modelingResults = data.modelingResults ?? null;
    state.robustnessResults = data.robustnessResults ?? null;
    state.etapa6Results = data.etapa6Results ?? null;
    state.etapa7Results = data.etapa7Results ?? null;
  } catch {
    state.researchBundle = null;
  }
  state.researchBundleLoaded = true;
  state.readinessLoaded = true;
  state.modelingLoaded = true;
  state.robustnessLoaded = true;
  state.etapa6Loaded = true;
  state.etapa7Loaded = true;
  return state.researchBundle;
}

function renderResearch({ skipReadinessFetch = false } = {}) {
  if (!state.monitoringHistoryFetched) {
    state.monitoringHistoryFetched = true;
    loadMonitoringHistory().then(() => {
      if (state.view === "research") renderResearch({ skipReadinessFetch: true });
    });
  }
  const rows = clients();
  const audit = state.payload?.metadata?.researchAudit;
  const popOptions = RESEARCH_POPULATIONS.map(
    (option) =>
      `<option value="${escapeHtml(option.value)}"${option.value === state.researchPopulation ? " selected" : ""}>${escapeHtml(option.label)}</option>`,
  ).join("");
  const banner = `
    <div class="research-banner">
      <strong>Pesquisa Preditiva</strong> — população metodológica separada do recorte operacional (ativos).
      <div class="field-inline">
        <label class="field" style="margin:0">
          <span>População do estudo</span>
          <select id="researchPopulation">${popOptions}</select>
        </label>
      </div>
    </div>`;
  const tabs = `<div class="tabs-inline research-tabs" role="tablist">${researchTabButtons()}</div>`;
  const modelingOnly = state.researchTab === "modeling" && state.modelingResults?.status === "ok";
  if (!rows.length && !modelingOnly) {
    const loading = state.loadStatus === "loading" || state.loadStatus === "idle";
    el.view.innerHTML = `${banner}${tabs}${researchStateBanner()}<p class="empty">${loading ? "Carregando snapshot operacional…" : "Nenhum cliente no recorte. Amplie a população do estudo ou relaxe filtros."}</p>`;
    bindResearchTabs();
    if (!state.researchBundleLoaded && !skipReadinessFetch) {
      ensureResearchBundle().then(() => {
        if (state.view === "research") renderResearch({ skipReadinessFetch: true });
      });
    }
    return;
  }
  let body = "";
  if (state.researchTab === "audit") body = renderResearchAudit(rows, audit);
  else if (state.researchTab === "validation") body = renderResearchValidation(rows);
  else if (state.researchTab === "modeling") body = renderResearchModeling(audit);
  else body = renderResearchStudy(rows, audit);
  el.view.innerHTML = `${banner}${tabs}${body}`;
  bindResearchTabs();
  if (!skipReadinessFetch && !state.researchBundleLoaded) {
    ensureResearchBundle().then(() => {
      if (state.view === "research") renderResearch({ skipReadinessFetch: true });
    });
  }
}

const BASE_COLUMNS = [
  ["clientName", "Cliente"],
  ["clientCode", "Código"],
  ["program", "Programa"],
  ["engineer", "EP"],
  ["analyticalStatus", "Status"],
  ["finalClass", "Classe"],
  ["healthScore", "Score"],
  ["engagementScore", "E"],
  ["mechanismScore", "M"],
  ["totalMeetings", "Reuniões"],
  ["avgMeetingsPerMonth", "Média/mês"],
  ["implementedCount", "Mecanismos"],
  ["inProgressCount", "Em andamento"],
  ["npsScore", "NPS"],
  ["daysSinceEntry", "Dias de casa"],
  ["daysSinceLastMeeting", "Recência"],
];

function renderBase(payload) {
  const rows = [...clients()];
  const { key, dir } = state.sort;
  rows.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const an = Number(av);
    const bn = Number(bv);
    let cmp = 0;
    if (Number.isFinite(an) && Number.isFinite(bn)) cmp = an - bn;
    else cmp = String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR");
    if (String(av) === "Não informado") cmp = 1;
    if (String(bv) === "Não informado") cmp = -1;
    return dir === "asc" ? cmp : -cmp;
  });
  const pg = paginate(rows, state.page, state.pageSize);
  state.page = pg.page;
  const pageRows = pg.slice;
  const head = BASE_COLUMNS.map(([column, label]) => `<th class="sortable" data-sort="${column}">${escapeHtml(label)}${state.sort.key === column ? (state.sort.dir === "asc" ? " ↑" : " ↓") : ""}</th>`).join("");
  const body = pageRows.map((row) => `<tr class="click-row" data-client="${escapeHtml(row.clientId)}">${BASE_COLUMNS.map(([column]) => {
    const value = row[column];
    let text;
    if (column === "finalClass") text = badge(value);
    else if (column === "clientName") text = `<span class="cell-primary">${escapeHtml(value ?? "—")}</span>`;
    else if (column === "clientCode") text = `<span class="muted-code">${escapeHtml(value ?? "—")}</span>`;
    else if (typeof value === "number") text = `<span class="num">${formatNum(value, column.includes("avg") ? 2 : 0)}</span>`;
    else text = escapeHtml(value ?? "—");
    return `<td>${text}</td>`;
  }).join("")}</tr>`).join("");
  const counts = payload.metadata?.counts || {};
  const missingEntry = rows.filter((row) => !row.entryDate).length;
  const missingNps = rows.filter((row) => row.npsScore == null).length;
  const missingEp = rows.filter((row) => row.engineer === "Não informado").length;
  el.view.innerHTML = `
    ${card("Tabela consolidada", `${fmt.format(rows.length)} clientes · clique na linha para detalhe · CSV exporta o recorte completo`, `
      ${table(head, body, { compact: true, sticky: true })}
      ${pagerHtml({ ...pg, idPrefix: "base" })}
    `)}
    <section class="grid cards-2" style="margin-top:12px">
      ${card("Qualidade no recorte", "Ausências e cobertura na tabela atual.", `<div class="cols"><span>Sem data de entrada</span><strong>${fmt.format(missingEntry)} · ${pctFmt.format(rows.length ? (missingEntry / rows.length) * 100 : 0)}%</strong><span>Sem NPS</span><strong>${fmt.format(missingNps)} · ${pctFmt.format(rows.length ? (missingNps / rows.length) * 100 : 0)}%</strong><span>EP não informado</span><strong>${fmt.format(missingEp)}</strong><span>Sem reunião</span><strong>${fmt.format(rows.filter((row) => !row.totalMeetings).length)}</strong><span>Sem mecanismo implantado</span><strong>${fmt.format(rows.filter((row) => !row.implementedCount).length)}</strong></div>`)}
      ${card("Volume carregado da BASE QV", "Antes dos filtros de tela. O dashboard ainda exclui casos isolados locais.", `<div class="cols"><span>Clientes</span><strong>${fmt.format(counts.clients || 0)}</strong><span>Reuniões</span><strong>${fmt.format(counts.clientMeetings || 0)}</strong><span>Reuniões manuais</span><strong>${fmt.format(counts.manualMeetings || 0)}</strong><span>Mecanismos</span><strong>${fmt.format(counts.clientMecanismos || 0)}</strong><span>NPS</span><strong>${fmt.format(counts.npsResponses || 0)}</strong><span>Cancelamentos</span><strong>${fmt.format(counts.cancellations || 0)}</strong></div>`)}
    </section>
    ${card("Dicionário", "Indicadores já calculados e o uso possível no estudo. Nada disso treina um modelo.", table("<th>Indicador</th><th>Leitura</th><th>Uso no estudo</th>", [
      ["Health Score", "E e M ponderados. Padrão 50/50. Experimental.", "Candidato a preditor de churn e renovação"],
      ["E", "Média de reuniões válidas por mês do ciclo.", "Engajamento e queda de atividade"],
      ["M", "Mecanismos implantados. Em andamento não pontua.", "Adoção e permanência"],
      ["Em implantação", "Menos de 90 dias, M = 0 e ciclo 1.", "Tenure curto"],
      ["Sem registro", "Zero reuniões e zero mecanismos.", "Desengajamento"],
      ["Recência", "Dias desde a última reunião válida.", "Deterioração do relacionamento"],
      ["NPS", "Última resposta válida, de 0 a 10.", "Satisfação, quando houver resposta"],
      ["Renovado", "Ciclo maior que 1.", "Alvo de renovação, não o funil completo"],
      ["Cancelamento", "Evidência analítica já usada no dashboard.", "Alvo de churn neste recorte"],
    ].map(([name, text, use]) => `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(text)}</td><td>${escapeHtml(use)}</td></tr>`).join("")))}
  `;
  el.view.querySelectorAll("[data-sort]").forEach((header) => header.addEventListener("click", () => {
    const column = header.dataset.sort;
    state.sort = { key: column, dir: state.sort.key === column && state.sort.dir === "asc" ? "desc" : "asc" };
    render();
  }));
  bindPager(el.view, "base", {
    getPage: () => state.page,
    setPage: (p) => {
      state.page = p;
    },
    onChange: () => render(),
  });
  el.view.querySelectorAll("[data-client]").forEach((row) => row.addEventListener("click", () => openDetail(row.dataset.client)));
}

async function openDetail(clientId) {
  const row = clients().find((item) => item.clientId === clientId);
  if (!row) return;
  const h = row.hs2a || {};
  const fatores = (h.fatores || []).map((f) => `<li>${escapeHtml(f.label)}</li>`).join("");
  const hints = (h.verificacaoHumana || []).map((t) => `<li>${escapeHtml(t)}</li>`).join("");
  el.dialog.innerHTML = `
    <h2>${escapeHtml(row.clientName)}</h2>
    <p class="sub">${escapeHtml(row.clientCode)} · ${escapeHtml(row.program)} · ${escapeHtml(row.engineer)}</p>
    <h3 class="detail-section">Identificação</h3>
    <div class="cols">
      <span>Fase (2.0A)</span><strong>${escapeHtml(h.faseLabel || "—")}</strong>
      <span>Status analítico</span><strong>${escapeHtml(row.analyticalStatus)}</strong>
    </div>
    <h3 class="detail-section">Health Score (V1)</h3>
    <div class="cols">
      <span>HS</span><strong>${formatNum(row.healthScore, 0)}</strong>
      <span>E / M</span><strong>${formatNum(row.engagementScore, 0)} / ${formatNum(row.mechanismScore, 0)}</strong>
      <span>Fórmula</span><strong title="Pesos da tela não alteram versão oficial persistida">${escapeHtml(h.formulaAplicada || "50/50")}</strong>
      <span>Classificação</span><strong>${escapeHtml(row.finalClass)}</strong>
    </div>
    <h3 class="detail-section">Contexto 2.0A</h3>
    <div class="cols">
      <span>Qualidade informacional</span><strong>${escapeHtml(h.qualidadeLabel || "—")}</strong>
      <span>Perfil interpretativo</span><strong>${escapeHtml(h.perfilLabel || "—")}</strong>
      <span>Reuniões</span><strong>${fmt.format(row.totalMeetings || 0)} · ${escapeHtml(h.coberturaReunioes || "")}</strong>
      <span>Última reunião</span><strong>${escapeHtml(formatDate(row.lastMeetingAt))}</strong>
      <span>Mecanismos</span><strong>${fmt.format(row.implementedCount || 0)} · ${escapeHtml(h.coberturaMecanismos || "")}</strong>
      <span>Relacionamento</span><strong>${h.entradaConfiavel ? `${fmt.format(h.diasRelacionamento)} dias` : "Tempo incerto"}</strong>
    </div>
    <h3 class="detail-section">Interpretação</h3>
    <ul class="plain-list">${fatores || "<li>Sem fatores destacados.</li>"}</ul>
    ${hints ? `<p class="sub">Verificação sugerida:</p><ul class="plain-list">${hints}</ul>` : ""}
    <div id="hsHistoryBlock"><p class="note">Carregando histórico observável…</p></div>
    <button type="button" class="btn ghost" id="closeDetail" style="margin-top:12px">Fechar</button>
  `;
  document.getElementById("closeDetail").addEventListener("click", () => el.dialog.close());
  el.dialog.showModal();
  try {
    const block = document.getElementById("hsHistoryBlock");
    if (!block) return;
    const snapRes = await fetch(`/api/client-snapshot-history?clientId=${encodeURIComponent(clientId)}`);
    const snapHist = snapRes.ok ? await snapRes.json() : null;
    if (snapHist?.ok && snapHist.points?.length) {
      const histRows = snapHist.points
        .map(
          (p) =>
            `<tr><td>${escapeHtml(p.dia)}</td><td class="num">${p.hs == null ? "—" : formatNum(p.hs, 0)}</td><td class="num">${p.e == null ? "—" : formatNum(p.e, 0)}</td><td class="num">${p.m == null ? "—" : formatNum(p.m, 0)}</td><td>${escapeHtml(p.classe || "")}</td></tr>`,
        )
        .join("");
      block.innerHTML = `${card("Evolução (snapshots Business Data)", "Pseudonimizado · HS V1 congelado por execução", table("<th>Ref.</th><th class='num'>HS</th><th class='num'>E</th><th class='num'>M</th><th>Classe</th>", histRows))}`;
      return;
    }
    const res = await fetch(`/api/client-hs-history?clientId=${encodeURIComponent(clientId)}`);
    const hist = res.ok ? await res.json() : null;
    if (!hist?.available || !hist.points?.length) {
      block.innerHTML = `<p class="note">${escapeHtml(snapHist?.error || hist?.nota || hist?.reason || "Histórico indisponível — configure Business Data ou use Engajamento.")}</p>`;
      return;
    }
    const histRows = hist.points
      .slice(-8)
      .map(
        (p) =>
          `<tr><td>${escapeHtml(p.mes)}</td><td class="num">${p.hs == null ? "—" : formatNum(p.hs, 0)}</td><td class="num">${p.e == null ? "—" : formatNum(p.e, 0)}</td><td class="num">${p.m == null ? "—" : formatNum(p.m, 0)}</td><td class="num">${p.reunioes ?? "—"}</td><td>${escapeHtml(p.confiabilidade || "")}</td></tr>`,
      )
      .join("");
    block.innerHTML = `${card("Evolução (pesquisa point-in-time)", escapeHtml(hist.nota || ""), table("<th>Mês</th><th class='num'>HS</th><th class='num'>E</th><th class='num'>M</th><th class='num'>Reuniões</th><th>Reconstr.</th>", histRows))}`;
  } catch {
    const block = document.getElementById("hsHistoryBlock");
    if (block) block.innerHTML = `<p class="note">Não foi possível carregar histórico.</p>`;
  }
}

function renderFatalView(message, { retry = true } = {}) {
  el.view.innerHTML = `
    <section class="card error-state">
      <h2>Não foi possível exibir o painel</h2>
      <p class="sub">${escapeHtml(message || "Erro desconhecido.")}</p>
      ${retry ? `<button type="button" class="btn" id="btnRetryLoad">Tentar novamente</button>` : ""}
    </section>`;
  document.getElementById("btnRetryLoad")?.addEventListener("click", () => loadData({ refresh: true }));
}

function safeRender() {
  const payload = state.payload;
  if (!payload) {
    el.view.innerHTML = skeleton();
    if (el.scoreSlot) { el.scoreSlot.innerHTML = ""; el.scoreSlot.hidden = true; }
    return;
  }
  try {
    const [eyebrow, title] = VIEWS[state.view] || VIEWS.overview;
    el.eyebrow.textContent = eyebrow;
    el.title.textContent = title;
    renderScoreSlot();
    updateFilterNote();
    if (state.view === "overview") renderOverview(payload);
    else if (state.view === "health") renderHealth(payload);
    else if (state.view === "engagement") renderEngagement();
    else if (state.view === "mechanisms") renderMechanisms();
    else if (state.view === "nps") renderNps(payload);
    else if (state.view === "research") renderResearch();
    else if (state.view === "quality") renderQuality();
    else renderBase(payload);
    bindTipTriggers(el.view);
    bindTipTriggers(el.scoreSlot);
  } catch (error) {
    console.error("[dashboard render]", error);
    renderFatalView(error?.message || "Erro ao montar a visualização.");
  }
}

function render() {
  safeRender();
}

async function fetchJson(url, { timeoutMs = API_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.json().catch(() => ({ error: "Resposta inválida da API." }));
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

function applyOptions(payload) {
  const options = payload.filters?.options || {};
  const applied = payload.filters?.applied || {};
  fillSelect(el.cluster, options.cluster, state.filters.cluster || applied.cluster || "ativos");
  fillSelect(el.ep, options.ep, state.filters.ep || applied.ep || "all");
  fillSelect(el.program, options.program, state.filters.program || applied.program || "all");
  fillSelect(el.final, options.finalClass, state.filters.finalClass || applied.finalClass || "all");
}

async function loadData({ refresh = false } = {}) {
  const requestId = ++state.requestId;
  state.loadStatus = "loading";
  state.loadError = null;
  if (!state.payload) el.view.innerHTML = skeleton();
  el.meta.textContent = "Carregando…";
  const started = performance.now();
  try {
    const { response, body } = await fetchJson(`/api/health-score?${queryParams({ refresh }).toString()}`);
    if (!response.ok) throw new Error(body.error || "Falha na API principal.");
    if (!Array.isArray(body.clients)) throw new Error("Payload sem lista de clientes.");
    if (requestId !== state.requestId) return;
    state.payload = body;
    state.hs2aLabSnapshot = body.metadata?.hs2aLab || null;
    state.page = 1;
    applyOptions(body);
    const meta = body.metadata || {};
    const ms = Math.round(performance.now() - started);
    el.meta.textContent = meta.generatedAt
      ? `Atualizado ${new Date(meta.generatedAt).toLocaleString("pt-BR")} · ${fmt.format(body.clients.length)} clientes · ${ms} ms`
      : `Atualizado · ${ms} ms`;
    state.loadStatus = "ready";
    hideError();
    safeRender();
  } catch (error) {
    if (requestId !== state.requestId) return;
    const message = error.name === "AbortError" ? "Tempo esgotado ao carregar dados. Tente novamente." : (error.message || "Falha ao carregar o dashboard.");
    state.loadError = message;
    state.loadStatus = state.payload ? "partial_error" : "critical_error";
    showError(message);
    el.meta.textContent = state.payload ? "Dados parciais (erro na atualização)" : "Erro ao carregar";
    if (!state.payload) renderFatalView(message);
    else safeRender();
  }
}

function scheduleLoad() {
  clearTimeout(state.debounce);
  state.debounce = setTimeout(() => loadData(), 280);
}

function setWeights(changed, value) {
  const primary = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const secondary = 100 - primary;
  state.weights = changed === "mechanism"
    ? { engagement: secondary, mechanism: primary }
    : { engagement: primary, mechanism: secondary };
  localStorage.setItem(WEIGHT_KEY, JSON.stringify(state.weights));
  paintScorePanel();
  if (state.payload?.clients?.length) {
    state.payload = applyWeightsToPayload(state.payload, state.weights);
    if (state.view === "health" || state.view === "overview") safeRender();
  }
  scheduleLoad();
}

function downloadCsv() {
  window.location.href = `/api/health-score.csv?${queryParams().toString()}`;
}

function downloadGerencialCsv() {
  const params = queryParams();
  params.set("export", "gerencial");
  window.location.href = `/api/health-score.csv?${params.toString()}`;
}

function bind() {
  document.querySelectorAll(".nav-icon").forEach((node) => { node.innerHTML = ICONS[node.dataset.icon] || ""; });
  document.querySelectorAll(".nav-btn").forEach((button) => button.addEventListener("click", () => {
    const next = button.dataset.view;
    const wasResearch = state.view === "research";
    state.view = next;
    document.querySelectorAll(".nav-btn").forEach((item) => item.classList.toggle("active", item === button));
    el.shell.classList.remove("nav-open");
    if (next === "research" && !wasResearch) {
      if (!state.researchBundleLoaded) ensureResearchBundle();
      loadData();
    } else if (next === "quality") {
      state.monitoringLoaded = false;
      render();
    } else if (wasResearch && next !== "research") loadData();
    else render();
  }));
  document.getElementById("btnCollapse").addEventListener("click", () => {
    const collapsed = el.shell.classList.toggle("collapsed");
    document.getElementById("btnCollapse").setAttribute("aria-expanded", String(!collapsed));
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
  });
  document.getElementById("btnNav").addEventListener("click", () => el.shell.classList.toggle("nav-open"));
  document.getElementById("backdrop").addEventListener("click", () => el.shell.classList.remove("nav-open"));
  [el.ep, el.program, el.final, el.cluster].forEach((node) => node.addEventListener("change", () => {
    captureFilters();
    state.monitoringLoaded = false;
    loadData();
  }));
  el.search.addEventListener("input", () => { captureFilters(); scheduleLoad(); });
  el.pin.addEventListener("change", () => { state.pinned = el.pin.checked; captureFilters(); savePin(); });
  document.getElementById("btnReset").addEventListener("click", () => {
    state.filters = { search: "", from: "", to: "", program: "all", ep: "all", finalClass: "all", cluster: "ativos" };
    syncFilterInputs();
    if (state.pinned) savePin();
    state.monitoringLoaded = false;
    loadData();
  });
  document.getElementById("btnRefresh").addEventListener("click", () => {
    state.monitoringLoaded = false;
    state.researchBundleLoaded = false;
    loadData({ refresh: true });
    ensureResearchBundle(true);
  });
  document.getElementById("btnCsv").addEventListener("click", downloadCsv);
  document.getElementById("btnGuide").addEventListener("click", () => window.open("/guia-health-score-ceo.html", "_blank", "noopener"));
  if (localStorage.getItem(SIDEBAR_KEY) === "1") {
    el.shell.classList.add("collapsed");
    document.getElementById("btnCollapse").setAttribute("aria-expanded", "false");
  }
}

function boot() {
  if (!el.view || !el.meta) {
    console.error("[dashboard] DOM incompleto — verifique index.html");
    return;
  }
  readStoredWeights();
  readPin();
  periodPicker = mountPeriodPicker({
    root: document.getElementById("periodRoot"),
    fromInput: el.from,
    toInput: el.to,
    getFilters: () => state.filters,
    setFilters: (patch) => {
      state.filters = { ...state.filters, ...patch };
      if (state.pinned) savePin();
    },
    onApply: () => {
      captureFilters();
      state.monitoringLoaded = false;
      loadData();
    },
  });
  syncFilterInputs();
  bind();
  ensureResearchBundle();
  loadData();
}

window.addEventListener("error", (event) => {
  console.error("[dashboard]", event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[dashboard] promise rejeitada", event.reason);
});

boot();
