import { mountPeriodPicker } from "./period-picker.mjs";
import { paginate, pagerHtml, bindPager, DEFAULT_PAGE_SIZE } from "./table-ui.mjs";
import { tipIcon, bindTipTriggers } from "./tooltips.mjs";
import { applyWeightsToPayload, snapshotFromClients } from "/lib/frontend/weight-recompute.mjs";
import { renderHealthEvolutionPage, bindHealthEvolutionPage } from "./health-evolution.mjs";
import { openHealthEvolutionReport, openPredictiveExecutiveReport } from "./executive-report.mjs";
import {
  buildHealthComposition,
  buildProgramHealthStats,
  buildEpHealthStats,
  filterAccompanimentRows,
  accompanimentDefaultRows,
  primaryObservedFactor,
  E_BANDS,
  M_BANDS,
  HEALTH_LEVEL_ORDER,
} from "/lib/frontend/health-evolution-analytics.mjs";
import {
  balancePanelHtml,
  bindBalancePanel,
  paintBalancePanel,
  globalWeightBadgeHtml,
} from "./hs-balance.mjs";
import { weightsFromEngagement } from "/lib/frontend/hs-weight.mjs";
import { describeCorrelation } from "/lib/frontend/correlation-copy.mjs";
import {
  PORTFOLIO_COLUMNS,
  loadVisibleColumnIds,
  saveVisibleColumnIds,
  resolvePortfolioCell,
} from "./portfolio-columns.mjs";
import { mountClientProfile } from "./client-profile.mjs";
import { bindClientDrawer, openClientDrawer } from "./client-drawer.mjs";
import { hsScoreBarHtml } from "/lib/frontend/hs-score-bar.mjs";
import { loadSystemStatus, mountSystemBanners } from "./system-banners.mjs";
import {
  shouldRefetchOnEnterResearch,
  shouldRefetchOnLeaveResearch,
} from "/lib/frontend/view-registry.mjs";
import {
  ANALYTICAL_COLUMNS,
  ANALYTICAL_GROUPS,
  loadAnalyticalColumnIds,
  saveAnalyticalColumnIds,
  resolveAnalyticalCell,
  analyticalSortValue,
  formatAnalyticalCellHtml,
} from "./analytical-columns.mjs";
import { analyticalRowsToCsv } from "/lib/frontend/analytical-csv.mjs";
import { renderResearchPanorama } from "./research-panorama.mjs";
import { renderResearchLabHow } from "./research-lab-how.mjs";
import { renderResearchLabModel } from "./research-lab-model.mjs";
import { fetchJsonArtifact } from "/lib/http/fetch-json.mjs";

const VIEWS = {
  overview: ["Principal", "Visão Geral"],
  portfolio: ["Carteira", "Carteira de Clientes"],
  health: ["Health Score", "Health Score"],
  evolution: ["Evolução", "Saúde e Evolução"],
  engagement: ["Análises", "Engajamento"],
  mechanisms: ["Análises", "Mecanismos"],
  nps: ["Análises", "NPS e Correlações"],
  quality: ["Análises", "Qualidade dos Dados"],
  research: ["Pesquisa", "Laboratório Preditivo"],
  base: ["Pesquisa", "Base Analítica"],
};

const RESEARCH_TAB_ALIASES = {
  panorama: "panorama",
  hsfuture: "hsfuture",
  how: "how",
  model: "model",
  methodology: "how",
  intro: "how",
  study: "how",
  limitations: "model",
  study2: "model",
  v2: "model",
  diagnostic: "model",
  study15: "model",
  study16: "model",
  v16: "model",
  churn: "model",
  validation: "model",
  modeling: "model",
  weights: "model",
  advanced: "model",
  audit: "model",
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
  briefcase: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  trend: '<svg viewBox="0 0 24 24"><path d="M4 18h16"/><path d="m6 16 4-6 4 3 5-9"/></svg>',
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
  sort: { key: "clientName", dir: "asc" },
  tableSort: {
    portfolio: { key: "clientName", dir: "asc" },
    base: { key: "clientName", dir: "asc" },
  },
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  qualityPage: 1,
  qualityDiagSearch: "",
  qualityDiagnostics: [],
  monitoringHistory: null,
  monitoringHistoryFetched: false,
  selectedId: null,
  researchTab: "panorama",
  researchPanorama: null,
  researchPanoramaQuery: "",
  predictiveLabPack: null,
  predictiveLabPackLoaded: false,
  portfolioColumnIds: loadVisibleColumnIds(),
  baseColumnIds: loadAnalyticalColumnIds(),
  baseSearch: "",
  systemStatus: null,
  hsFutureFeasible: false,
  evolutionRequestId: 0,
  evolutionPage: 1,
  evolutionSummary: null,
  evolutionSummaryKey: "",
  evolutionLocalFilters: {
    search: "",
    healthLevel: "all",
    program: "all",
    ep: "all",
    quality: "all",
    engagement: "all",
    mechanism: "all",
  },
  lastQueryKey: "",
  lastRenderMs: null,
  portfolioColumnsOpen: false,
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
let qualityRequestId = 0;

const API_TIMEOUT_MS = 120_000;
const API_PROBE_TIMEOUT_MS = 25_000;

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
  hsWeightBadge: document.getElementById("hsWeightBadge"),
  systemBanners: document.getElementById("systemBanners"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let toastTimer = null;
function showReportToast(result) {
  const node = document.getElementById("appToast");
  if (!node) return;
  clearTimeout(toastTimer);
  if (!result?.ok) {
    node.textContent = result?.error || "Não foi possível gerar o relatório.";
    node.className = "app-toast is-error";
  } else {
    node.textContent =
      result.method === "download+preview"
        ? "Relatório baixado e aberto — use Imprimir → Salvar como PDF."
        : "Relatório baixado — abra o arquivo HTML e use Imprimir → Salvar como PDF.";
    node.className = "app-toast is-success";
  }
  node.hidden = false;
  toastTimer = setTimeout(() => {
    node.hidden = true;
  }, 7000);
}

function syncSidebarToggleUi() {
  const collapsed = el.shell?.classList.contains("collapsed");
  const btn = document.getElementById("btnCollapse");
  if (!btn) return;
  btn.setAttribute("aria-expanded", String(!collapsed));
  btn.setAttribute("aria-label", collapsed ? "Expandir menu" : "Recolher menu");
  const label = btn.querySelector(".sidebar-toggle-label");
  if (label) label.textContent = collapsed ? "Expandir" : "Recolher menu";
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

function filteredSnapshot() {
  const rows = clients();
  if (!rows.length) return { summary: {}, healthDistribution: [] };
  return snapshotFromClients(rows, state.weights);
}

function readStoredWeights() {
  try {
    const stored = JSON.parse(localStorage.getItem(WEIGHT_KEY) || "{}");
    const engagement = Number(stored.engagement);
    const mechanism = Number(stored.mechanism);
    if (Number.isFinite(engagement) && Number.isFinite(mechanism) && engagement + mechanism === 100) {
      state.weights = weightsFromEngagement(engagement);
    }
  } catch { /* pesos padrão */ }
}

function applyFiltersSticky() {
  const bar = document.getElementById("filtersBar");
  if (bar) bar.classList.toggle("is-sticky", state.pinned);
}

function envWarningText(w) {
  if (typeof w === "string") return w;
  if (w && typeof w.message === "string") return w.message;
  return String(w ?? "");
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
      "Laboratório Preditivo: população do estudo na própria página (padrão Total). Filtro Status não se aplica aqui.";
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

function card(title, subtitle, body, { htmlTitle = false } = {}) {
  const head = htmlTitle ? title : escapeHtml(title);
  return `<article class="card"><h2>${head}</h2><p class="sub">${escapeHtml(subtitle || "")}</p>${body}</article>`;
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

function table(headers, rowsHtml, { compact = false, sticky = false, scrollY = false } = {}) {
  const cls = ["table-wrap", compact ? "table-compact" : "", sticky ? "table-sticky" : "", scrollY ? "" : "table-flat"].filter(Boolean).join(" ");
  return `<div class="${cls}"><table><thead><tr>${headers}</tr></thead><tbody>${rowsHtml || `<tr><td colspan="12"><span class="empty">Sem dados no recorte.</span></td></tr>`}</tbody></table></div>`;
}

function hsScoreCell(row) {
  return hsScoreBarHtml(row, { escapeHtml, formatNum, weights: state.weights });
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

function tableViewKey() {
  return state.view === "base" ? "base" : "portfolio";
}

function getTableSort() {
  const key = tableViewKey();
  return state.tableSort[key] || state.tableSort.portfolio;
}

function setTableSort(sort) {
  const key = tableViewKey();
  state.tableSort[key] = sort;
  state.sort = sort;
}

function compareSortValues(av, bv) {
  const an = Number(av);
  const bn = Number(bv);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  return String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR");
}

function sortedRowsForTable(viewKey, rowBuilder) {
  const sort = state.tableSort[viewKey] || state.tableSort.portfolio;
  let rows = rowBuilder();
  const sortKey = sort.key;
  rows.sort((a, b) => {
    let av;
    let bv;
    if (viewKey === "base") {
      const col = ANALYTICAL_COLUMNS.find((c) => c.sortKey === sortKey || c.id === sortKey);
      const id = col?.id || sortKey;
      av = analyticalSortValue(a, id);
      bv = analyticalSortValue(b, id);
    } else {
      av = resolvePortfolioCell(a, sortKey === "healthScore" ? "healthScore" : sortKey);
      bv = resolvePortfolioCell(b, sortKey === "healthScore" ? "healthScore" : sortKey);
    }
    const cmp = compareSortValues(av, bv);
    return sort.dir === "asc" ? cmp : -cmp;
  });
  return rows;
}

function neighborClientIds(viewKey) {
  const rows =
    viewKey === "base"
      ? sortedRowsForTable("base", () => filterBaseRows([...clients()]))
      : sortedRowsForTable("portfolio", () => [...clients()].map((row) => ({ ...row })));
  return rows.map((r) => String(r.clientId));
}

function bindTableRowClicks(root, { viewKey = "portfolio" } = {}) {
  root.querySelectorAll("tr[data-client]").forEach((row) => {
    row.addEventListener("click", (ev) => {
      if (ev.target.closest("a, button, input, select, summary, label")) return;
      openDetail(row.dataset.client, { viewKey });
    });
  });
}

function renderAnalyticalTd(row, columnId, helpers) {
  if (columnId === "finalClass") return `<td>${badge(row.finalClass)}</td>`;
  if (columnId === "clientName") {
    return `<td><span class="cell-primary">${escapeHtml(String(row.clientName ?? "—"))}</span></td>`;
  }
  if (columnId === "clientCode") {
    return `<td><span class="muted-code">${escapeHtml(String(row.clientCode ?? "—"))}</span></td>`;
  }
  const cell = formatAnalyticalCellHtml(row, columnId, helpers, { hsScoreCell });
  if (typeof cell === "string") {
    const num = columnId === "healthScore" || typeof analyticalSortValue(row, columnId) === "number";
    return `<td class="${num ? "num" : ""}">${cell}</td>`;
  }
  if (cell.kind === "zero") return `<td class="num"><span class="val-zero">${cell.text}</span></td>`;
  if (cell.kind === "na") return `<td><span class="val-na" title="Não aplicável">n/a</span></td>`;
  if (cell.kind === "missing") return `<td><span class="val-missing" title="Não informado">—</span></td>`;
  const num = typeof analyticalSortValue(row, columnId) === "number";
  return `<td class="${num ? "num" : ""}">${escapeHtml(cell.text)}</td>`;
}

function renderHs5050Explainer() {
  const study = state.researchBundle?.data?.hsWeightStudy;
  const rec = study?.recommendation?.summaryPlain
    || "50/50 permanece referência oficial V1 — grid exploratório não substitui validação independente.";
  const weightBars = (study?.grid || [])
    .filter((g) => g.rocAucTest != null)
    .slice(0, 21)
    .map((g) => ({
      label: `${g.engagementPercent}/${g.mechanismPercent}${g.official ? " ★" : ""}`,
      count: g.rocAucTest,
      percent: g.rocAucTest * 100,
      meta: `ROC ${formatNum(g.rocAucTest, 3)} · PR ${formatNum(g.prAucTest, 3)}`,
    }));
  return `
    <section class="card hs-5050-card">
      <h2 class="section-heading">Por que usamos 50/50?</h2>
      <p class="page-lead-text">O Health Score combina <strong>Engajamento (E)</strong> e <strong>Mecanismos (M)</strong> implantados. Fórmula oficial documentada: <span class="formula-inline">HS = 0,50 × E + 0,50 × M</span>.</p>
      <ul class="plain-list">
        <li>50/50 é referência <strong>equilibrada e interpretável</strong> — não é a melhor combinação estatística comprovada.</li>
        <li>O estudo de churn usa HS congelado na exportação; <strong>não se confunde</strong> com os coeficientes dos modelos logísticos.</li>
        <li>O slider no topo do painel é <strong>simulação</strong> — não altera o indicador oficial nem a BASE QV.</li>
        <li>Exploração das 21 ponderações: hold-out jun/2026 já usado — sem nova ponderação ótima sem validação independente.</li>
      </ul>
      <p class="sub">${escapeHtml(rec)}</p>
      ${weightBars.length ? `<h3 class="section-heading-sm">Estudo exploratório das ponderações (ROC-AUC no teste congelado)</h3>${bars(weightBars, "count")}` : `<p class="note">Execute <code>npm run research:hs-weights</code> para carregar hs_weight_study.json.</p>`}
    </section>`;
}

function comparisonTable(stats) {
  const body = stats.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td class="num">${fmt.format(item.count)}</td><td class="num">${formatNum(item.avgScore)}</td><td class="num">${formatNum(item.avgEngagement, 2)}</td><td class="num">${pctFmt.format(item.coverage)}%</td></tr>`).join("");
  return table("<th>Grupo</th><th class='num'>Clientes</th><th class='num'>Score médio</th><th class='num'>Reuniões/mês</th><th class='num'>Cobertura M</th>", body);
}

function overviewPageLead() {
  return `
    <section class="page-lead">
      <h2 class="page-lead-title">Resumo executivo do recorte</h2>
      <p class="page-lead-text">Esta página mostra <strong>quantos clientes</strong> você está vendo, o <strong>Health Score médio</strong>, engajamento e mecanismos — e onde estão os casos que pedem atenção. Use a barra acima para simular outros pesos entre E e M (experimental).</p>
    </section>`;
}

function renderOverview(payload) {
  const rows = clients();
  const snap = filteredSnapshot();
  const summary = snap.summary || payload.summary || {};
  const healthDist = snap.healthDistribution || distribution(payload, "health");
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
    ${overviewPageLead()}
    <section class="grid kpis kpis-6">
      ${kpi("Clientes no recorte", fmt.format(rows.length), summary.totalClients ? `de ${fmt.format(summary.totalClients)} após filtros` : "Quem entra nos filtros abaixo")}
      ${kpi("Score médio", formatNum(summary.averageScore), payload.weights?.formula || "Pesos experimentais atuais", "", "hs_medio")}
      ${kpi("Engajamento médio", avgEngagement == null ? "—" : formatNum(avgEngagement, 2), "Reuniões válidas por mês (E)", "", "engajamento")}
      ${kpi("Cobertura de mecanismos", `${pctFmt.format(coverage)}%`, `${fmt.format(withMechanism)} clientes com implantado`, "", "mecanismos")}
      ${kpi("Atenção + crítico", fmt.format((summary.attention || 0) + (summary.critical || 0)), "Fora de implantação", "attention", "hs_faixa")}
      ${kpi("Em implantação", fmt.format(summary.implanting || 0), `${pctFmt.format(summary.implantingPercent || 0)}% do recorte`, "neutral")}
    </section>
    <section class="view-section">
      <h2 class="section-heading">Distribuição e classificação</h2>
      <p class="section-sub">O que estou vendo? Quantos clientes estão saudáveis, em atenção ou críticos — e como o score se espalha.</p>
      <div class="grid cards-2">
        ${card("Health Score por faixa", "Barras = quantidade de clientes", stackShareChart(healthDist) + bars(healthDist))}
        ${card("Classificação operacional", "Regras da BASE QV (responde aos pesos E/M)", bars(healthDist))}
      </div>
    </section>
    <section class="view-section">
      <h2 class="section-heading">Detalhe do score</h2>
      <div class="grid cards-2">
        ${card("Histograma do score", "Faixas de 10 pontos (0–100)", bars(histogram(rows), "count"))}
        ${card("Componente E (engajamento)", "Nota 0–100 por cadência de reuniões", bars(distribution(payload, "engagement")))}
        ${card("Componente M (mecanismos)", "Nota 0–100 por mecanismos implantados", bars(distribution(payload, "mechanism")))}
        ${card(`Perfis 2.0A ${tipIcon("perfil_2a")}`, "Leitura interpretativa — não é alerta automático", managerialBars(mgr.perfisExclusivos, "label"), { htmlTitle: true })}
        ${card(`Qualidade dos dados ${tipIcon("qualidade_info")}`, "Histórico confiável vs lacunas cadastrais", managerialBars(mgr.qualidadeInformacional, "categoria"), { htmlTitle: true })}
      </div>
    </section>
    <section class="view-section">
      <h2 class="section-heading">Comparativos e alertas</h2>
      <div class="grid cards-2">
        ${card("Por programa", "Média de score, reuniões e cobertura M", comparisonTable(groupStats(rows, "program")))}
        ${card("Por engenheiro (EP)", "Carteiras podem ter composições diferentes", comparisonTable(groupStats(rows, "engineer")))}
        ${card("Entrada na carteira", cohorts.length > 1 ? "Novos clientes por mês (filtro de período)" : "Poucos meses no recorte", cohorts.length > 1 ? columnChart(cohorts) : `<p class="empty">Sem série mensal de entradas.</p>`)}
        ${card("Principais alertas", "Crítico, Atenção ou Sem registro", table("<th>Cliente</th><th>EP</th><th>Classe</th><th class='num'>HS</th><th>Motivo</th>", attentionBody || "<tr><td colspan='5'>Nenhum cliente nestas faixas.</td></tr>"))}
      </div>
    </section>
    ${card("Clientes no recorte", "Clique na linha para abrir detalhes · HS do menor para o maior", table("<th>Cliente</th><th>Programa</th><th class='num'>HS</th><th>Perfil 2.0A</th><th>Classe</th>", topBody || "<tr><td colspan='5'>Sem clientes.</td></tr>"))}
    <section class="how-to-read">
      <h2 class="section-heading">Como ler esta página</h2>
      <p>Comece pelos <strong>cartões no topo</strong> (volume, score médio, alertas). Depois veja a <strong>distribuição</strong> e, se precisar, a tabela de clientes. A barra de balanceamento recalcula o HS na hora — é simulação, não previsão de cancelamento.</p>
    </section>
  `;
  el.view.querySelectorAll("[data-client]").forEach((row) => row.addEventListener("click", () => openDetail(row.dataset.client)));
}

function updateGlobalWeightBadge() {
  if (!el.hsWeightBadge) return;
  const show = state.view !== "research" && state.view !== "quality";
  el.hsWeightBadge.hidden = !show;
  if (show) el.hsWeightBadge.textContent = globalWeightBadgeHtml(state.weights);
}

function refreshSystemBannersForView() {
  if (!el.systemBanners) return;
  if (state.view === "quality" && state.systemStatus) {
    mountSystemBanners(el.systemBanners, state.systemStatus);
  } else {
    el.systemBanners.innerHTML = "";
    el.systemBanners.hidden = true;
  }
}

function renderScoreSlot() {
  if (!el.scoreSlot) return;
  updateGlobalWeightBadge();
  if (!state.payload || (state.view !== "health" && state.view !== "overview")) {
    el.scoreSlot.innerHTML = "";
    el.scoreSlot.hidden = true;
    return;
  }
  el.scoreSlot.hidden = false;
  const needsMount = !el.scoreSlot.querySelector("#hsBalance");
  if (needsMount) {
    el.scoreSlot.innerHTML = balancePanelHtml(state.weights);
    bindBalancePanel(el.scoreSlot, { onEngagementChange: (value) => setWeights(value) });
  } else {
    paintBalancePanel(el.scoreSlot, state.weights);
  }
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
    <section class="page-lead">
      <div class="page-lead-row">
        <div>
          <h2 class="page-lead-title">Health Score no recorte atual</h2>
          <p class="page-lead-text">Ajuste a barra acima para ver como o score muda ao dar mais peso a <strong>reuniões (E)</strong> ou a <strong>mecanismos (M)</strong>. Tudo abaixo atualiza na hora. A fórmula oficial documentada na pesquisa permanece 50/50 — isto é exploração visual.</p>
        </div>
        <div class="page-lead-actions">
          <button type="button" class="btn ghost sm" id="btnHealthCsv">Exportar CSV</button>
          <button type="button" class="btn ghost sm" id="btnHealthGerencialCsv">CSV gerencial 2.0A</button>
        </div>
      </div>
    </section>
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
    ${renderHs5050Explainer()}
    ${card("Ranking interpretado", "Clique para detalhe 2.0A", table("<th>Cliente</th><th>Programa</th><th class='num'>HS</th><th>Perfil</th><th>Qualidade</th><th>Classe</th>", tableBody))}
  `;
  el.view.querySelectorAll("[data-client]").forEach((row) => row.addEventListener("click", () => openDetail(row.dataset.client)));
  document.getElementById("btnHealthCsv")?.addEventListener("click", downloadCsv);
  document.getElementById("btnHealthGerencialCsv")?.addEventListener("click", downloadGerencialCsv);
  if (!state.researchBundleLoaded) {
    ensureResearchBundle().then(() => {
      if (state.view === "health") renderHealth(payload);
    });
  }
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

function renderQualitySummaryError(err, reqId) {
  if (reqId !== qualityRequestId || state.view !== "quality") return;
  const hist = state.monitoringHistory;
  const histBlock =
    hist && !hist.ok
      ? alertBox("warning", "Histórico Business Data", `<p>${escapeHtml(hist.error || "Indisponível.")}</p>`)
      : hist?.ok
        ? alertBox("info", "Histórico Business Data", `<p>${fmt.format(hist.runs?.length || 0)} execuções válidas consultadas.</p>`)
        : "";
  el.view.innerHTML = `
    <section class="card error-state">
      <h2>Qualidade e Monitoramento</h2>
      <p>${escapeHtml(qualityErrorMessage(err))}</p>
      <p class="sub">Diagnósticos operacionais dependem do snapshot ao vivo; falha no histórico persistido não impede revisão quando a BASE QV responde.</p>
      ${histBlock}
      <button type="button" class="btn" id="retryQuality">Tentar novamente</button>
    </section>`;
  document.getElementById("retryQuality")?.addEventListener("click", () => {
    state.monitoringLoaded = false;
    renderQuality();
  });
}

function renderQuality() {
  const reqId = ++qualityRequestId;
  const cacheKey = queryParams().toString();
  if (state.monitoringLoaded && state.monitoringSummary && state.monitoringCacheKey === cacheKey) {
    paintQualityPage(state.monitoringSummary, reqId);
    return;
  }
  el.view.innerHTML = `
    <section class="page-lead"><h2 class="page-lead-title">Qualidade dos dados</h2>
    <p class="page-lead-text">Indicadores ao vivo da carteira filtrada. Histórico e execuções carregam em seguida — falha parcial não bloqueia a leitura operacional.</p></section>
    <p class="note" id="qualityLoadingNote">Carregando indicadores…</p>`;
  loadMonitoringHistory().catch(() => {});
  fetchMonitoringSummary()
    .then((mon) => {
      if (reqId !== qualityRequestId || state.view !== "quality") return;
      paintQualityPage(mon, reqId);
    })
    .catch((err) => {
      renderQualitySummaryError(err, reqId);
    });
}

function paintQualityPage(mon, reqId) {
  if (reqId !== qualityRequestId || state.view !== "quality") return;
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
      if (env.durableDestination?.supabase) {
        const supa = env.durableDestination.supabase;
        const bucket = supa && typeof supa === "object" ? supa.bucket : null;
        destParts.push(`Storage (${escapeHtml(bucket || "bucket")})`);
      }

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
          ${(env.warnings || []).length ? alertBox("warning", "Avisos do ambiente", env.warnings.map((w) => `<p>${escapeHtml(envWarningText(w))}</p>`).join("")) : ""}
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
        <section class="page-lead"><h2 class="page-lead-title">Qualidade dos dados</h2>
        <p class="page-lead-text">Separamos qualidade informacional (cadastro/histórico) do Health Score e de modelos de churn.</p></section>
        <h3 class="section-heading">Qualidade da carteira</h3>
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
        <h3 class="section-heading">Histórico</h3>
        <section class="grid cards-2">
          ${card("Evolução por snapshot", "Local ou Business Data (_dash_health_score)", table("<th>Dia ref.</th><th class='num'>Clientes</th><th>Fonte</th>", trendBody))}
          ${card("Comparação temporal", temporal.comparable ? "Snapshots válidos" : "Histórico em formação", `<p class="sub">${temporalNote}</p>`)}
        </section>
        <h3 class="section-heading">Execuções</h3>
        ${card("Pipeline de monitoramento", "Preferência Business Data quando configurado", table("<th>Ref.</th><th>Status</th><th class='num'>Clientes</th><th>Término</th><th>Fonte</th>", runRows || "<tr><td colspan='5'>Nenhuma execução registrada.</td></tr>"))}
        <section class="card" id="qualityDiagSection">
          <h3>Diagnósticos por cliente</h3>
          <p class="sub">Busca local · paginação 20 · clique abre detalhe · não altera BASE QV</p>
          <input type="search" id="qualityTableSearch" class="input" placeholder="Buscar nome, código, programa, EP, tipo…" value="${escapeHtml(state.qualityDiagSearch)}" />
          ${table("<th>Cliente</th><th>Código</th><th>Programa</th><th>EP</th><th>Categoria</th><th>Tipo</th><th>Pri.</th><th>Evidência</th><th>Ação</th>", "", { compact: true })}
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
    if (reqId !== qualityRequestId || state.view !== "quality") return;
    el.view.innerHTML = `<section class="card error-state"><h2>Erro ao montar Qualidade dos Dados</h2><p>${escapeHtml(innerErr.message || "Dados incompletos.")}</p><button type="button" class="btn" id="retryQuality">Tentar novamente</button></section>`;
    document.getElementById("retryQuality")?.addEventListener("click", () => {
      state.monitoringLoaded = false;
      renderQuality();
    });
  }
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

function npsBandStats(rows, labelField, order) {
  return order.map((label) => {
    const subset = rows.filter((row) => row[labelField] === label && Number.isFinite(row.npsScore));
    const promoters = subset.filter((row) => row.npsClass === "promoter").length;
    const detractors = subset.filter((row) => row.npsClass === "detractor").length;
    const avg = subset.length ? subset.reduce((s, r) => s + r.npsScore, 0) / subset.length : null;
    const index = subset.length ? ((promoters - detractors) / subset.length) * 100 : null;
    const meta =
      subset.length === 0
        ? "sem respostas"
        : `n=${subset.length} · nota média ${formatNum(avg, 1)}${index == null ? "" : ` · NPS ${formatNum(index, 0)}`}`;
    return {
      label,
      count: subset.length,
      percent: subset.length,
      meta,
      tone: tone(label),
    };
  });
}

function npsNoteDistribution(rows) {
  const counts = Array.from({ length: 11 }, (_, score) => ({
    label: String(score),
    count: 0,
    percent: 0,
    tone: score <= 6 ? "critical" : score <= 8 ? "attention" : "healthy",
  }));
  for (const row of rows) {
    if (!Number.isFinite(row.npsScore)) continue;
    const score = Math.max(0, Math.min(10, Math.round(row.npsScore)));
    counts[score].count += 1;
  }
  const total = counts.reduce((s, c) => s + c.count, 0);
  return counts.map((c) => ({
    ...c,
    percent: c.count,
    meta: total ? `${fmt.format(c.count)} (${pctFmt.format((c.count / total) * 100)}%)` : "0",
  }));
}

function correlationCard(item, subject) {
  const copy = describeCorrelation({
    pearson: item.pearson,
    sampleSize: item.sampleSize,
    subject,
  });
  return card(
    item.label,
    copy.headline,
    `<p class="sub">${escapeHtml(copy.detail)}</p><div class="cols compact-cols"><span>Pearson</span><strong>${item.pearson == null ? "—" : formatNum(item.pearson, 3)}</strong><span>Spearman</span><strong>${item.spearman == null ? "—" : formatNum(item.spearman, 3)}</strong><span>Amostra</span><strong>${fmt.format(item.sampleSize || 0)}</strong></div>`,
  );
}

function renderNps(payload) {
  const nps = payload.nps || {};
  const all = clients();
  const rows = all.filter((row) => Number.isFinite(row.npsScore));
  const eOrder = ["Saudável", "Atenção", "Crítico", "Sem registro", "Não informado"];
  const mOrder = ["Saudável", "Atenção", "Crítico", "Sem registro", "Não informado"];
  const byE = npsBandStats(all, "engagementLabel", eOrder);
  const byM = npsBandStats(all, "mechanismLabel", mOrder);
  const noteBars = npsNoteDistribution(all);
  const correlations = nps.correlations || [];
  const renewal = (nps.renewalByClass || []).map((row) => `<tr><td>${escapeHtml(row.label)}</td><td class="num">${fmt.format(row.respondents || 0)}</td><td class="num">${fmt.format(row.renewed || 0)}</td><td class="num">${row.renewalRate == null ? "—" : `${pctFmt.format(row.renewalRate)}%`}</td></tr>`).join("");
  el.view.innerHTML = `
    ${alertBox("info", "Leitura associativa", "<p>Mostramos padrões no recorte filtrado. Isso <strong>não prova</strong> que engajamento ou mecanismos causem NPS.</p>")}
    <section class="grid kpis kpis-4">
      ${kpi("Respondentes", fmt.format(nps.respondents || 0), `${pctFmt.format(nps.coveragePercent || 0)}% do recorte`)}
      ${kpi("Clientes no recorte", fmt.format(nps.totalClients || 0), "Respeita filtros globais")}
      ${kpi("Pares E × NPS", fmt.format(correlations[0]?.sampleSize || 0), "Última nota válida")}
      ${kpi("Pares M × NPS", fmt.format(correlations[1]?.sampleSize || 0), "Última nota válida")}
    </section>
    ${card("Notas de 0 a 10", "Detrator (0–6) · Neutro (7–8) · Promotor (9–10)", bars(noteBars, "count"))}
    <section class="grid cards-2">
      ${card("Engajamento (E) × NPS", "Por faixa de nota E — quantidade de respostas e NPS do grupo", bars(byE.filter((b) => b.count > 0).length ? byE : [{ label: "Sem respostas", count: 0, percent: 0, meta: "—" }], "count"))}
      ${card("Mecanismos (M) × NPS", "Por faixa de nota M — mesmo recorte", bars(byM.filter((b) => b.count > 0).length ? byM : [{ label: "Sem respostas", count: 0, percent: 0, meta: "—" }], "count"))}
    </section>
    <section class="grid cards-2">
      ${correlations[0] ? correlationCard(correlations[0], "engajamento (E) e satisfação (NPS)") : ""}
      ${correlations[1] ? correlationCard(correlations[1], "mecanismos (M) e satisfação (NPS)") : ""}
    </section>
    ${card("Renovação por classe NPS", "Observacional — ciclo atual", table("<th>Classe</th><th class='num'>Respondentes</th><th class='num'>Renovados</th><th class='num'>Taxa</th>", renewal))}
    <details class="advanced-block">
      <summary>Gráficos de dispersão (avançado)</summary>
      <section class="grid cards-2">
        ${card("Dispersão Engajamento × NPS", `n = ${fmt.format(rows.length)}`, scatter(rows.map((row) => ({ x: row.npsScore, y: row.engagementScore, label: row.clientCode }))))}
        ${card("Dispersão Mecanismos × NPS", "Eixo X = nota NPS · Y = nota M", scatter(rows.map((row) => ({ x: row.npsScore, y: row.mechanismScore, label: row.clientCode }))))}
      </section>
    </details>
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
  { id: "panorama", label: "Visão executiva" },
  { id: "hsfuture", label: "HS futuro" },
  { id: "how", label: "Como funciona" },
  { id: "model", label: "Modelo e limitações" },
];

function normalizeResearchTab(tab) {
  return RESEARCH_TAB_ALIASES[tab] || tab;
}

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
      state.researchTab = normalizeResearchTab(button.dataset.researchTab);
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

function studyFlowDiagram() {
  const steps = [
    { title: "Cliente", text: "Carteira na BASE QV" },
    { title: "Dados", text: "Reuniões, M, status" },
    { title: "HS", text: "E + M (pesquisa 50/50)" },
    { title: "Janela 90d", text: "Observar cancelamento" },
    { title: "Modelo", text: "Experimentos A–E" },
    { title: "Resultado", text: "Métricas congeladas" },
  ];
  return `<ol class="study-flow">${steps.map((s) => `<li><strong>${escapeHtml(s.title)}</strong><span>${escapeHtml(s.text)}</span></li>`).join("")}</ol>`;
}

function methodologySummaryCard() {
  return card(
    `Metodologia resumida ${tipIcon("hs_formula")}${tipIcon("churn_pesquisa")}`,
    "O que foi medido e o que não publicamos em produção",
    `<dl class="def-list">
      <dt>Health Score (HS) ${tipIcon("hs_medio")}</dt><dd>Nota 0–100: combinação ponderada de E e M. No dashboard você pode simular outros pesos; o estudo histórico documenta 50/50.</dd>
      <dt>E (Engajamento) ${tipIcon("engajamento")}</dt><dd>Quão presente está o relacionamento em reuniões válidas.</dd>
      <dt>M (Mecanismos) ${tipIcon("mecanismos")}</dt><dd>Quanto da jornada já tem mecanismo implantado (em andamento não conta).</dd>
      <dt>O que previmos ${tipIcon("desfecho_90d")}</dt><dd>Probabilidade de <strong>churn em 90 dias</strong> no passado — só para comparar modelos, não para decidir hoje.</dd>
      <dt>Censura ${tipIcon("censura")}</dt><dd>Clientes ainda sem tempo suficiente para saber se cancelaram dentro da janela.</dd>
      <dt>Em produção</dt><dd>Não exibimos probabilidade individual de churn — apenas o HS operacional e esta pesquisa agregada.</dd>
    </dl>`,
    { htmlTitle: true },
  );
}

function readinessBlock() {
  const r = state.predictiveReadiness;
  if (!r) {
    return `<p class="note">Arquivo de prontidão da pesquisa ausente neste ambiente. Métricas dos modelos A–E podem aparecer na aba Modelagem se os exports existirem.</p>`;
  }
  const cs = r.churnStats || {};
  const a = r.audit || {};
  const churnTitle = r.source === "modeling_results.json" ? "Churn (síntese)" : "Churn confirmado";
  const churnSub = "Episódios identificados no estudo — não confundir com o total de clientes do painel";
  return `
    <section class="grid cards-3 kpi-cards-research">
      ${card(`${churnTitle} ${tipIcon("churn_pesquisa")}`, churnSub, `<p class="formula">${fmt.format(cs.episodesConfirmed ?? cs.positives ?? 0)}</p><p class="sub">${fmt.format(cs.episodesWithoutDate || 0)} sem data · ${fmt.format(cs.dateConflicts || 0)} datas conflitantes</p>`, { htmlTitle: true })}
      ${card("HS histórico", "Reconstruído mês a mês para o estudo", `<p class="formula">${fmt.format(a.hsIntegral || 0)}</p><p class="sub">${fmt.format(a.hsParcial || 0)} parcial · ${fmt.format(a.hsNaoReconstruivel || 0)} sem histórico suficiente</p>`)}
      ${card(`Clientes elegíveis (90d) ${tipIcon("elegiveis_90d")}`, "Com janela válida para avaliar cancelamento em 90 dias", `<p class="formula">${fmt.format(a.rowsEligible90 || 0)}</p><p class="sub">${fmt.format(a.positives90 || 0)} com churn · ${fmt.format(a.censored90 || 0)} censurados ${tipIcon("censura")}</p>`, { htmlTitle: true })}
    </section>`;
}

function renderResearchWeights() {
  const study = state.researchBundle?.data?.hsWeightStudy || state.hsWeightStudy;
  if (!study) {
    return alertBox(
      "warning",
      "Estudo de pesos",
      "<p>Execute <code>npm run research:hs-weights</code> após artefatos de modelagem.</p>",
    );
  }
  const aucBars = (study.grid || [])
    .filter((g) => g.rocAucTest != null)
    .map((g) => ({
      label: `${g.engagementPercent}/${g.mechanismPercent}${g.official ? " ★" : ""}`,
      count: g.rocAucTest,
      percent: g.rocAucTest * 100,
      meta: `PR ${formatNum(g.prAucTest, 3)} · ${g.source}`,
    }));
  return `
    <section class="page-lead research-lead">
      <h2 class="page-lead-title">Qual peso entre E e M?</h2>
      <p class="page-lead-text">${escapeHtml(study.recommendation.summaryPlain)}</p>
    </section>
    ${alertBox("experimental", "Baseline oficial", "<p>HS operacional V1 permanece <strong>50/50</strong> até decisão formal — grid completo exige refit row-level.</p>")}
    ${card("Desempenho exploratório (ROC-AUC)", "Pontos com métrica disponível — hold-out jun/2026 não é confirmação", aucBars.length ? bars(aucBars, "count") : "<p class='note'>Regenerar estudo após model:all.</p>")}
    ${card("Churn observado por faixa HS (50/50 histórico)", "Descritivo — HS alto = melhor saúde", bars(study.hsChurnByBand?.map((b) => ({ label: b.hs_faixa, count: b.n, percent: (b.churn_rate_90d || 0) * 100, meta: `${pctFmt.format((b.churn_rate_90d || 0) * 100)}% churn` })) || [], "count"))}
    <p class="note">Relatório completo: <code>docs/HS_WEIGHT_STUDY.md</code></p>`;
}

function renderResearchHsFuture() {
  const f = state.researchBundle?.data?.hsFutureFeasibility || state.hsFutureFeasibility;
  if (!f) {
    return `<section class="research-hero card research-hero-compact">
      <h1 class="research-hero-title">Saúde futura do cliente (em desenvolvimento)</h1>
      <p class="research-hero-lead">Ainda não há avaliação de viabilidade neste ambiente. O Health Score operacional de hoje permanece a referência.</p>
    </section>`;
  }
  const ready = Boolean(f.feasible && f.modelValidated);
  const statusLabel = ready ? "Em estudo" : "Não pronto";
  const statusClass = ready ? "research-status-study" : "research-status-not-ready";
  const maturity =
    (f.snapshotPoints || 0) >= 12
      ? "Série em formação"
      : (f.snapshotPoints || 0) >= 3
        ? "Maturidade inicial"
        : "Base ainda curta";
  return `
    <section class="research-hero card research-hero-compact">
      <p class="research-hero-eyebrow">Viabilidade · separado do churn histórico</p>
      <h1 class="research-hero-title">Saúde futura do cliente (em desenvolvimento)</h1>
      <p class="research-hero-lead">Ainda <strong>não existe previsão validada</strong> de Health Score futuro por cliente. O painel mostra o HS de hoje; esta aba acompanha se a base histórica permite, no futuro, modelar evolução.</p>
      <span class="research-status-pill ${statusClass}">${escapeHtml(statusLabel)}</span>
    </section>
    <section class="grid kpis kpis-4 research-exec-kpis">
      ${kpi("Snapshots válidos", fmt.format(f.snapshotPoints ?? 0), "Business Data / execuções")}
      ${kpi("Meses comparáveis", fmt.format(f.distinctReferenceDays ?? 0), "Referências distintas")}
      ${kpi("Maturidade da base", maturity, escapeHtml(f.reason || ""))}
      ${kpi("Próximo passo", ready ? "Validar modelo" : "Acumular histórico", ready ? "Hold-out cronológico" : "Mais snapshots mensais")}
    </section>
    <section class="card research-exec-conclusion">
      <h2 class="research-section-title">Mensagem para sócios</h2>
      <p>${escapeHtml(f.reason || "Série longitudinal insuficiente.")} Até validação formal, não publicamos HS futuro nem substituímos o score operacional.</p>
      <p class="sub">Baseline de persistência: permanecemos com HS operacional de hoje; evolução futura exige mais snapshots mensais comparáveis.</p>
    </section>`;
}

function renderResearchStudy(rows, audit) {
  const pop = audit?.population || {};
  const counts = state.payload?.metadata?.counts || {};
  const trained = state.modelingResults?.status === "ok";
  const objective = trained
    ? `<p>Comparamos modelos A–E no passado para ver se E, M ou HS ajudam a antecipar cancelamento em 90 dias. Os números estão na aba <strong>Modelagem</strong> — são experimentais.</p>`
    : `<p>Preparamos dados históricos, validamos o HS e treinamos modelos de comparação. Sem exports completos, você ainda vê a lógica do estudo aqui.</p>`;
  return `
    ${researchStateBanner()}
    <section class="page-lead research-lead">
      <h2 class="page-lead-title">O que é esta análise?</h2>
      <p class="page-lead-text">Um estudo <strong>offline</strong> que pergunta: “no passado, sinais como engajamento e mecanismos ajudaram a explicar quem cancelou em até 90 dias?”. Não é o botão que o time usa no dia a dia — é evidência para evoluir o produto com cautela.</p>
    </section>
    ${readinessBlock()}
    ${card("Fluxo do estudo", "Do cliente aos resultados — visão em sequência", studyFlowDiagram())}
    <section class="grid cards-2">
      ${card("Objetivo", audit?.studyPhase || "Pesquisa preditiva", objective)}
      ${card(`O que é churn? ${tipIcon("churn_pesquisa")}`, "Como identificamos cancelamento no estudo", `<p class="sub">${escapeHtml(audit?.definitions?.churnDashboard || "Consolidado a partir de evidências na BASE QV.")}</p>`, { htmlTitle: true })}
    </section>
    <section class="grid cards-2">
      ${card(`O que é HS, E e M? ${tipIcon("hs_medio")}`, "Três ideias simples", `<p><strong>HS</strong> combina duas notas. <strong>E</strong> mede reuniões. <strong>M</strong> mede mecanismos implantados. Pesos 50/50 no estudo; no painel operacional você pode simular outros pesos.</p>`, { htmlTitle: true })}
      ${card("Formas de identificar churn", "Operacional vs pesquisa", `<ul class="plain-list"><li><strong>Churn:</strong> ${escapeHtml(audit?.definitions?.churnDashboard || "—")}</li><li><strong>Renovação:</strong> ${escapeHtml(audit?.definitions?.renewalDashboard || "—")}</li></ul>`)}
    </section>
    <section class="grid cards-3">
      ${card("População carregada", "Snapshot atual da BASE QV", `<p class="formula">${fmt.format(pop.clientsLoaded || counts.clients || 0)}</p><p class="sub">clientes disponíveis</p>`)}
      ${card("No recorte do estudo", "Filtros de programa, EP e busca", `<p class="formula">${fmt.format(rows.length)}</p><p class="sub">população: ${escapeHtml(pop.appliedCluster || effectiveCluster())}</p>`)}
      ${card("Evidência de cancelamento", "Indício no snapshot — ver também churn confirmado acima", `<p class="formula">${fmt.format(pop.cancelEvidence || 0)}</p><p class="sub">${fmt.format(pop.cancelWithDate || 0)} com data registrada</p>`)}
    </section>
    ${methodologySummaryCard()}
    ${card("Três camadas — não misturar", "Cada camada responde uma pergunta diferente", `<div class="chips"><span class="chip">Operacional: HS de hoje</span><span class="chip">Pesquisa: churn histórico</span><span class="chip">Modelos: ranking A–E</span></div>`)}
    ${prospectiveFreezesCard()}
  `;
}

function prospectiveFreezesCard() {
  const hist = state.monitoringHistory;
  if (!hist) {
    return alertBox("info", "Freezes prospectivos (Business Data)", `<p class="note">Carregando histórico persistido…</p>`);
  }
  if (!hist.ok) {
    const detail = hist.persistence?.detail || hist.error || "Verifique service role e URL do projeto rckpuebaiswrxzmywllv.";
    return alertBox(
      hist.persistence?.state === "disconnected" ? "warning" : "critical",
      "Freezes prospectivos (Business Data)",
      `<p>${escapeHtml(detail)}</p>${hist.code ? `<p class="muted-code">${escapeHtml(hist.code)}</p>` : ""}`,
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
  const coverageBars = localCoverage.map(([label, item]) => ({
    label,
    count: item.count,
    percent: item.percent,
    meta: `${pctFmt.format(item.percent)}%`,
  }));
  return `
    <section class="page-lead research-lead">
      <h2 class="page-lead-title">Dados e base analítica</h2>
      <p class="page-lead-text">De onde vêm os números, quantos clientes têm cada informação preenchida e onde ainda há lacunas. Barras maiores = melhor cobertura no recorte selecionado.</p>
    </section>
    ${card("Cobertura por variável (recorte atual)", "Percentual de clientes com dado utilizável", bars(coverageBars))}
    ${card("Fontes identificadas", "Tabelas usadas no carregamento do dashboard", table("<th>Tabela</th><th>Papel</th><th class='num'>Linhas</th>", sources))}
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
    <section class="page-lead research-lead">
      <h2 class="page-lead-title">Validação do Health Score</h2>
      <p class="page-lead-text">O HS ajuda a <strong>organizar a carteira</strong> e, no histórico, aparece associado a mais churn quando está baixo — mas isso <strong>não prova</strong> sozinho que o score prevê cancelamento. Use os gráficos como leitura descritiva.</p>
    </section>
    ${robustBlock}
    ${evolutionBlock}
    ${labBlock}
    ${descBlock}
    <p class="note">Tabela abaixo: comparação simples no snapshot de hoje. Para performance preditiva (ROC/PR), vá à aba Modelagem.</p>
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
    <section class="page-lead research-lead">
      <h2 class="page-lead-title">Modelagem (experimentos A–E)</h2>
      <p class="page-lead-text">Comparamos combinações de variáveis para ranquear risco de churn em 90 dias no <strong>passado</strong>. O melhor modelo aqui <strong>não está aprovado</strong> para operação — serve para aprendizado e próximos passos.</p>
    </section>
    ${alertBox("experimental", "Somente pesquisa", "<p>Alterar filtros do dashboard não muda estas métricas. Não publicamos score de risco individual para clientes.</p>")}
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

function researchPanoramaUi() {
  return {
    escapeHtml,
    fmt,
    pctFmt,
    formatNum,
    bars,
    hBarMetrics,
    card,
    kpi,
  };
}

async function ensurePredictiveLabPack(force = false) {
  if (state.predictiveLabPackLoaded && !force && state.predictiveLabPack?.referenceModel) {
    return state.predictiveLabPack;
  }
  try {
    const parsed = await fetchJsonArtifact("/api/predictive-lab-reference");
    if (parsed.ok && parsed.data?.referenceModel) {
      state.predictiveLabPack = parsed.data;
    } else {
      state.predictiveLabPack = {
        ok: false,
        loadState: "error",
        error: parsed.data?.error || parsed.error || "Falha ao carregar referência de modelagem",
        sources: parsed.data?.sources,
      };
    }
  } catch (err) {
    state.predictiveLabPack = { ok: false, loadState: "error", error: err.message };
  }
  state.predictiveLabPackLoaded = true;
  return state.predictiveLabPack;
}

async function ensureResearchPanorama(force = false) {
  const q = "frozen_descriptive_all";
  if (!force && state.researchPanorama && !state.researchPanorama.error && state.researchPanoramaQuery === q) {
    return state.researchPanorama;
  }
  try {
    const res = await fetch("/api/research-panorama");
    const contentType = res.headers.get("content-type") || "";
    const raw = await res.text();
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
    if (!res.ok) {
      state.researchPanorama = {
        error: body?.error || res.statusText || "API indisponível",
        descriptiveAvailability: body?.descriptiveAvailability || {
          ok: false,
          reason: "http_error",
          message: `HTTP ${res.status} ao carregar /api/research-panorama.`,
        },
        artifacts: body?.artifacts,
      };
    } else if (!body?.version || !body?.kpis) {
      const looksHtml = /^\s*</.test(raw || "");
      state.researchPanorama = {
        error: looksHtml
          ? "Resposta HTML em vez de JSON — reinicie com npm run dev (scripts/dev-server.mjs)."
          : "Contrato JSON inválido na API do Panorama.",
        descriptiveAvailability: {
          ok: false,
          reason: looksHtml ? "invalid_api_response" : "parse_error",
          message: looksHtml
            ? "Use npm run dev na pasta dash-health-score; Live Server/static não expõem /api/research-panorama."
            : "Resposta vazia ou corrompida.",
        },
      };
    } else {
      state.researchPanorama = body;
    }
    state.researchPanoramaQuery = q;
  } catch (err) {
    state.researchPanorama = {
      error: err.message || "Falha ao carregar panorama.",
      descriptiveAvailability: { ok: false, reason: "http_error", message: err.message },
    };
    state.researchPanoramaQuery = q;
  }
  return state.researchPanorama;
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
    state.hsWeightStudy = data.hsWeightStudy ?? null;
    state.hsFutureFeasibility = data.hsFutureFeasibility ?? null;
    state.hsFutureFeasible = Boolean(state.hsFutureFeasibility?.feasible);
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

function renderResearch({ skipReadinessFetch = false, skipPanoramaFetch = false } = {}) {
  if (!state.monitoringHistoryFetched) {
    state.monitoringHistoryFetched = true;
    loadMonitoringHistory().then(() => {
      if (state.view === "research") renderResearch({ skipReadinessFetch: true, skipPanoramaFetch: true });
    });
  }
  const tabEarly = normalizeResearchTab(state.researchTab);
  if (!skipPanoramaFetch && tabEarly === "panorama" && !state.researchPanorama) {
    ensureResearchPanorama().then(() => {
      if (state.view === "research") renderResearch({ skipReadinessFetch: true, skipPanoramaFetch: true });
    });
  }
  if (tabEarly === "model" && !state.predictiveLabPackLoaded) {
    ensurePredictiveLabPack().then(() => {
      if (state.view === "research") renderResearch({ skipReadinessFetch: true, skipPanoramaFetch: true });
    });
  }
  if (tabEarly === "model" && !state.researchPanorama) {
    ensureResearchPanorama().then(() => {
      if (state.view === "research") renderResearch({ skipReadinessFetch: true, skipPanoramaFetch: true });
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
      <strong>Laboratório Preditivo</strong> — pesquisa offline separada do operacional (ativos).
      <div class="field-inline">
        <label class="field" style="margin:0">
          <span>População do estudo</span>
          <select id="researchPopulation">${popOptions}</select>
        </label>
      </div>
    </div>`;
  const tabs = `<div class="tabs-inline research-tabs" role="tablist">${researchTabButtons()}</div>`;
  const labStandalone = ["panorama", "hsfuture", "how", "model"].includes(tabEarly);
  if (!rows.length && !labStandalone) {
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
  const tab = normalizeResearchTab(state.researchTab);
  state.researchTab = tab;
  let panoramaBind = null;
  if (tab === "panorama") {
    const pan = renderResearchPanorama(state.researchPanorama, researchPanoramaUi(), {
      onReport: () => openPredictiveExecutiveReport(state.researchPanorama, state.weights),
    });
    if (!pan || typeof pan.html !== "string") {
      body = `<section class="card error-state"><h2>Erro ao montar Panorama</h2><p>Resposta de renderização inválida — recarregue a página.</p></section>`;
    } else {
      body = pan.html;
      panoramaBind = pan.bind;
    }
  } else if (tab === "hsfuture") body = renderResearchHsFuture();
  else if (tab === "how") body = renderResearchLabHow(researchPanoramaUi());
  else if (tab === "model") {
    body = renderResearchLabModel(
      {
        loading: !state.predictiveLabPackLoaded,
        labPack: state.predictiveLabPack,
        labReference: state.researchPanorama?.labReference,
        panorama: state.researchPanorama,
        error: state.predictiveLabPack?.error,
      },
      researchPanoramaUi(),
    );
  } else body = renderResearchPanorama(state.researchPanorama, researchPanoramaUi()).html || "";
  const chrome =
    tab === "panorama"
      ? `<p class="research-disclaimer-bar">Pesquisa histórica · separada do Health Score operacional de hoje · sem probabilidade individual publicada.</p>`
      : banner;
  el.view.innerHTML = `${chrome}${tabs}${body}`;
  bindResearchTabs();
  panoramaBind?.(el.view);
  if (!skipReadinessFetch && !state.researchBundleLoaded) {
    ensureResearchBundle().then(() => {
      if (state.view === "research") renderResearch({ skipReadinessFetch: true });
    });
  }
}

function portfolioColumnPickerHtml(visible) {
  return PORTFOLIO_COLUMNS.filter((c) => !c.locked)
    .map(
      (c) =>
        `<label class="col-picker-row"><input type="checkbox" data-col="${c.id}" ${visible.includes(c.id) ? "checked" : ""}/> ${escapeHtml(c.label)}</label>`,
    )
    .join("");
}

function renderPortfolio(payload) {
  let rows = [...clients()].map((row) => ({
    ...row,
    _hsDeltaLabel: row._hsDeltaLabel || "—",
    _projectionLabel: state.hsFutureFeasible ? "Estudo" : "Simulador",
  }));
  const visible = state.portfolioColumnIds.filter((id) => PORTFOLIO_COLUMNS.some((c) => c.id === id));
  const colDefs = PORTFOLIO_COLUMNS.filter((c) => visible.includes(c.id));
  const sort = getTableSort();
  state.sort = sort;
  rows = sortedRowsForTable("portfolio", () => rows);
  const pg = paginate(rows, state.page, state.pageSize);
  state.page = pg.page;
  const pageRows = pg.slice;
  const snap = filteredSnapshot();
  const summary = snap.summary || payload.summary || {};
  const healthDist = snap.healthDistribution || distribution(payload, "health");
  const noMeet = rows.filter((r) => !r.totalMeetings).length;
  const withM = rows.filter((r) => (r.implementedCount || 0) > 0).length;
  const manyCols = visible.length > 9;
  const head = colDefs
    .map((c) => {
      const sk = c.sortKey || c.id;
      return `<th class="sortable" data-sort="${sk}">${escapeHtml(c.label)}${sort.key === sk ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}</th>`;
    })
    .join("");
  const body = pageRows
    .map((row) => {
      const cells = colDefs
        .map((c) => {
          const value = resolvePortfolioCell(row, c.id);
          if (c.id === "finalClass") return `<td>${badge(value)}</td>`;
          if (c.id === "clientName") return `<td><span class="cell-primary">${escapeHtml(value)}</span></td>`;
          if (c.id === "healthScore") return `<td class="num">${hsScoreCell(row)}</td>`;
          if (c.id === "engagementScore" || c.id === "mechanismScore" || c.id === "npsScore")
            return `<td class="num">${typeof value === "number" ? formatNum(value, 0) : escapeHtml(value)}</td>`;
          if (c.id === "lastMeetingAt") return `<td>${escapeHtml(formatDate(value))}</td>`;
          return `<td>${escapeHtml(value ?? "—")}</td>`;
        })
        .join("");
      return `<tr class="click-row" data-client="${escapeHtml(row.clientId)}">${cells}</tr>`;
    })
    .join("");
  el.view.innerHTML = `
    <section class="page-lead page-lead-compact">
      <div class="page-lead-row">
        <div>
          <h2 class="page-lead-title">Carteira de clientes</h2>
          <p class="page-lead-text">Recorte filtrado · clique na linha para perfil (histórico, mecanismos, simulador). Ordenação inicial por nome — use HS ↑/↓ ou cabeçalhos.</p>
        </div>
        <div class="page-lead-actions">
          <button type="button" class="btn ghost sm" data-goto-view="base">Base analítica</button>
          <button type="button" class="btn ghost sm" id="btnPortfolioSortHs" title="Ordenar por HS">${sort.key === "healthScore" && sort.dir === "desc" ? "HS ↓" : "HS ↑"}</button>
          <button type="button" class="btn ghost sm" id="btnPortfolioCsv">Exportar CSV</button>
        </div>
      </div>
    </section>
    <section class="grid kpis kpis-4 portfolio-kpis">
      ${kpi("Clientes", fmt.format(rows.length), "Filtros aplicados")}
      ${kpi("HS médio", formatNum(summary.averageScore), payload.weights?.formula || "50/50")}
      ${kpi("Sem reuniões", fmt.format(noMeet), "No recorte")}
      ${kpi("Com mecanismos", fmt.format(withM), `${pctFmt.format(rows.length ? (withM / rows.length) * 100 : 0)}%`)}
    </section>
    <section class="card portfolio-health-strip">
      <h3 class="section-heading-sm">Distribuição de saúde</h3>
      ${stackShareChart(healthDist)}
    </section>
    <section class="card portfolio-table-card ${manyCols ? "portfolio-table-wide" : ""}">
      <div class="portfolio-toolbar">
        <span class="sub">${fmt.format(rows.length)} clientes · ${visible.length} colunas · 20/página</span>
        <details class="col-picker">
          <summary class="btn ghost sm">Personalizar colunas</summary>
          <div class="col-picker-panel">${portfolioColumnPickerHtml(visible)}</div>
        </details>
      </div>
      ${table(head, body, { compact: true })}
      ${pagerHtml({ ...pg, idPrefix: "portfolio" })}
    </section>
  `;
  el.view.querySelectorAll("[data-col]").forEach((input) => {
    input.addEventListener("change", () => {
      const ids = [...el.view.querySelectorAll("[data-col]:checked")].map((n) => n.dataset.col);
      const locked = PORTFOLIO_COLUMNS.filter((c) => c.locked).map((c) => c.id);
      state.portfolioColumnIds = [...new Set([...locked, ...ids])];
      saveVisibleColumnIds(state.portfolioColumnIds);
      renderPortfolio(payload);
    });
  });
  el.view.querySelectorAll("[data-goto-view]").forEach((node) => {
    node.addEventListener("click", () => document.querySelector(`.nav-btn[data-view="${node.dataset.gotoView}"]`)?.click());
  });
  el.view.querySelectorAll("[data-sort]").forEach((header) =>
    header.addEventListener("click", () => {
      const column = header.dataset.sort;
      const cur = getTableSort();
      setTableSort({ key: column, dir: cur.key === column && cur.dir === "asc" ? "desc" : "asc" });
      render();
    }),
  );
  bindPager(el.view, "portfolio", {
    getPage: () => state.page,
    setPage: (p) => {
      state.page = p;
    },
    onChange: () => render(),
  });
  bindTableRowClicks(el.view, { viewKey: "portfolio" });
  document.getElementById("btnPortfolioCsv")?.addEventListener("click", downloadCsv);
  document.getElementById("btnPortfolioSortHs")?.addEventListener("click", () => {
    const cur = getTableSort();
    if (cur.key === "healthScore" && cur.dir === "asc") setTableSort({ key: "healthScore", dir: "desc" });
    else setTableSort({ key: "healthScore", dir: "asc" });
    renderPortfolio(payload);
  });
}

function evolutionSummaryCacheKey() {
  const rows = clients();
  return `${state.lastQueryKey}|n=${rows.length}|pop=${effectiveCluster()}`;
}

async function ensureEvolutionSummary() {
  const key = evolutionSummaryCacheKey();
  if (state.evolutionSummaryKey === key && state.evolutionSummary) return state.evolutionSummary;
  const rows = clients();
  const population = effectiveCluster() === "total" ? "total" : "ativos";
  const params = new URLSearchParams({
    population,
    program: state.filters.program || "all",
    engineer: state.filters.ep || "all",
  });
  const ids = rows.map((r) => r.clientId);
  if (ids.length && ids.length <= 4000) params.set("clientIds", ids.join(","));
  try {
    const res = await fetch(`/api/portfolio-evolution-summary?${params.toString()}`);
    const body = await res.json().catch(() => ({}));
    state.evolutionSummary = body;
    state.evolutionSummaryKey = key;
    return body;
  } catch {
    state.evolutionSummary = { ok: false, comparable: false, message: "Não foi possível carregar o histórico comparável." };
    state.evolutionSummaryKey = key;
    return state.evolutionSummary;
  }
}

function buildEvolutionFilterOptions(rows) {
  const programs = new Set(["all"]);
  const eps = new Set(["all"]);
  const qualityMap = new Map([["all", "Todos"]]);
  for (const r of rows) {
    programs.add(r.program || "Não informado");
    eps.add(r.engineer || "Não informado");
    if (r.hs2a?.qualidadeCodigo) {
      qualityMap.set(r.hs2a.qualidadeCodigo, r.hs2a.qualidadeLabel || r.hs2a.qualidadeCodigo);
    }
  }
  const opt = (set, allLabel = "Todos") =>
    [...set].sort((a, b) => (a === "all" ? -1 : String(a).localeCompare(String(b), "pt-BR"))).map((value) => ({
      value,
      label: value === "all" ? allLabel : value,
    }));
  return {
    healthLevels: [{ value: "all", label: "Todos" }, ...HEALTH_LEVEL_ORDER.map((label) => ({ value: label, label }))],
    programs: opt(programs),
    eps: opt(eps),
    qualities: [{ value: "all", label: "Todos" }, ...[...qualityMap.entries()].filter(([k]) => k !== "all").map(([value, label]) => ({ value, label }))],
    engagementBands: E_BANDS.map((b) => ({ value: b.id, label: b.label })),
    mechanismBands: M_BANDS.map((b) => ({ value: b.id, label: b.label })),
  };
}

function paintEvolutionView(payload, evolution) {
  const rows = clients();
  const snap = filteredSnapshot();
  const composition = buildHealthComposition(rows);
  const programStats = buildProgramHealthStats(rows);
  const epStats = buildEpHealthStats(rows);
  let tableRows = filterAccompanimentRows(accompanimentDefaultRows(rows), state.evolutionLocalFilters);
  if (state.evolutionSort) {
    const { key, dir } = state.evolutionSort;
    tableRows = [...tableRows].sort((a, b) => {
      const av = key === "factor" ? primaryObservedFactor(a) : a[key];
      const bv = key === "factor" ? primaryObservedFactor(b) : b[key];
      const an = Number(av);
      const bn = Number(bv);
      let cmp = Number.isFinite(an) && Number.isFinite(bn) ? an - bn : String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR");
      return dir === "asc" ? cmp : -cmp;
    });
  }
  const pg = paginate(tableRows, state.evolutionPage, state.pageSize);
  state.evolutionPage = pg.page;
  const pageRows = pg.slice;
  const head = `<th class="sortable" data-sort="clientName">Cliente</th><th>Programa</th><th>EP</th><th class="sortable num" data-sort="healthScore">HS</th><th>Classificação</th><th>Qualidade</th><th>Fator observado</th><th></th>`;
  const body = pageRows
    .map(
      (row) =>
        `<tr class="click-row" data-client="${escapeHtml(row.clientId)}"><td><span class="cell-primary">${escapeHtml(row.clientName)}</span></td><td>${escapeHtml(row.program)}</td><td>${escapeHtml(row.engineer)}</td><td class="num">${hsScoreCell(row)}</td><td>${badge(row.finalClass)}</td><td>${escapeHtml(row.hs2a?.qualidadeLabel || "—")}</td><td class="evo-factor">${escapeHtml(primaryObservedFactor(row))}</td><td><span class="linkish">Perfil</span></td></tr>`,
    )
    .join("");
  el.view.innerHTML = renderHealthEvolutionPage({
    summary: snap.summary,
    healthDistribution: snap.healthDistribution,
    composition,
    programStats,
    epStats,
    evolution,
    weights: payload.weights,
    metaGeneratedAt: payload.metadata?.generatedAt,
    tableHtml: table(head, body, { compact: true, sticky: true }),
    pagerHtml: pagerHtml({ ...pg, idPrefix: "evolution" }),
    filterOptions: buildEvolutionFilterOptions(rows),
    localFilters: state.evolutionLocalFilters,
    helpers: { escapeHtml, formatNum, fmt, pctFmt, kpi, badge, hsScoreCell, tipIcon },
  });
  bindHealthEvolutionPage(el.view, {
    onRefresh: () => {
      state.evolutionSummaryKey = "";
      loadData({ refresh: true });
    },
    onReport: () => {
      const r = openHealthEvolutionReport({
        summary: snap.summary,
        rows,
        weights: state.weights,
        filters: state.filters,
        meta: payload.metadata,
        healthDistribution: snap.healthDistribution,
        composition,
        programStats,
        epStats,
        evolution,
      });
      showReportToast(r);
    },
    onRowClick: (id) => openDetail(id),
    onPager: (root) =>
      bindPager(root, "evolution", {
        getPage: () => state.evolutionPage,
        setPage: (p) => {
          state.evolutionPage = p;
        },
        onChange: () => paintEvolutionView(payload, evolution),
      }),
    onSort: (column) => {
      const cur = state.evolutionSort || { key: "healthScore", dir: "asc" };
      state.evolutionSort = {
        key: column,
        dir: cur.key === column && cur.dir === "asc" ? "desc" : "asc",
      };
      paintEvolutionView(payload, evolution);
    },
    onLocalFilter: (key, value) => {
      state.evolutionLocalFilters = { ...state.evolutionLocalFilters, [key]: value };
      state.evolutionPage = 1;
      paintEvolutionView(payload, evolution);
    },
  });
  bindTipTriggers(el.view);
}

function renderEvolution() {
  const payload = state.payload;
  if (!payload) {
    el.view.innerHTML = skeleton();
    return;
  }
  const reqId = ++state.evolutionRequestId;
  const cached =
    state.evolutionSummaryKey === evolutionSummaryCacheKey() ? state.evolutionSummary : { comparable: false, loading: true };
  paintEvolutionView(payload, cached);
  ensureEvolutionSummary().then((evolution) => {
    if (reqId !== state.evolutionRequestId || state.view !== "evolution") return;
    paintEvolutionView(payload, evolution);
  });
}

function analyticalHelpers() {
  return { formatDate, formatNum, fmt };
}

function filterBaseRows(rows) {
  const q = state.baseSearch.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    [
      row.clientName,
      row.clientCode,
      row.program,
      row.engineer,
      row.analyticalStatus,
      row.finalClass,
      row.hs2a?.perfilLabel,
      row.hs2a?.qualidadeLabel,
    ].some((v) => String(v || "").toLowerCase().includes(q)),
  );
}

function analyticalColumnPickerHtml(visible) {
  return ANALYTICAL_GROUPS.map((g) => {
    const cols = ANALYTICAL_COLUMNS.filter((c) => c.group === g.id && !c.locked);
    if (!cols.length) return "";
    const selected = cols.filter((c) => visible.includes(c.id)).length;
    const inner = cols
      .map(
        (c) =>
          `<label class="col-picker-row"><input type="checkbox" data-base-col="${c.id}" ${visible.includes(c.id) ? "checked" : ""}/> ${escapeHtml(c.label)}</label>`,
      )
      .join("");
    return `<details class="col-picker-group-fold" open>
      <summary class="col-picker-group">${escapeHtml(g.label)} <span class="col-picker-count">${selected}/${cols.length}</span></summary>
      <div class="col-picker-group-actions">
        <button type="button" class="btn ghost xs" data-base-group="${g.id}" data-base-group-action="all">Marcar grupo</button>
        <button type="button" class="btn ghost xs" data-base-group="${g.id}" data-base-group-action="none">Limpar grupo</button>
      </div>
      ${inner}
    </details>`;
  }).join("");
}

function renderBase(payload) {
  const visible = state.baseColumnIds.filter((id) => ANALYTICAL_COLUMNS.some((c) => c.id === id));
  const colDefs = ANALYTICAL_COLUMNS.filter((c) => visible.includes(c.id));
  const helpers = analyticalHelpers();
  const sort = getTableSort();
  state.sort = sort;
  let rows = sortedRowsForTable("base", () => filterBaseRows([...clients()]));
  const pg = paginate(rows, state.page, state.pageSize);
  state.page = pg.page;
  const pageRows = pg.slice;
  const manyCols = visible.length > 10;
  const head = colDefs
    .map((c) => {
      const sk = c.sortKey || c.id;
      return `<th class="sortable" data-sort="${sk}">${escapeHtml(c.label)}${sort.key === sk ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}</th>`;
    })
    .join("");
  const body = pageRows
    .map((row) => {
      const cells = colDefs.map((c) => renderAnalyticalTd(row, c.id, helpers)).join("");
      return `<tr class="click-row" data-client="${escapeHtml(row.clientId)}">${cells}</tr>`;
    })
    .join("");
  const counts = payload.metadata?.counts || {};
  const missingEntry = rows.filter((row) => !row.entryDate).length;
  const missingNps = rows.filter((row) => row.npsScore == null).length;
  const missingEp = rows.filter((row) => row.engineer === "Não informado").length;
  el.view.innerHTML = `
    <section class="page-lead page-lead-compact">
      <div class="page-lead-row">
        <div>
          <h2 class="page-lead-title">Base analítica</h2>
          <p class="page-lead-text">Explorador técnico autorizado · mesmos HS/E/M e pesos (${payload.weights?.formula || "50/50"}) do restante do painel. Ordenação inicial por nome; 0, — e n/a têm significados distintos.</p>
        </div>
        <div class="page-lead-actions">
          <button type="button" class="btn ghost sm" data-goto-view="portfolio">Carteira de clientes</button>
          <button type="button" class="btn ghost sm" id="btnBaseSortHs" title="Alternar ordenação por Health Score">${sort.key === "healthScore" && sort.dir === "desc" ? "HS ↓" : "HS ↑"}</button>
          <button type="button" class="btn ghost sm" id="btnBaseCsv">Exportar CSV</button>
        </div>
      </div>
    </section>
    <section class="card portfolio-table-card ${manyCols ? "portfolio-table-wide" : ""}">
      <div class="portfolio-toolbar">
        <input type="search" id="baseTableSearch" class="input" placeholder="Buscar cliente, código, programa, EP…" value="${escapeHtml(state.baseSearch)}" />
        <details class="col-picker col-picker-base">
          <summary class="btn ghost sm">Colunas por categoria (${visible.length})</summary>
          <div class="col-picker-panel col-picker-panel-wide">${analyticalColumnPickerHtml(visible)}</div>
        </details>
        <span class="sub">${fmt.format(rows.length)} linhas · ${visible.length} colunas · 20/página</span>
      </div>
      ${table(head, body, { compact: true })}
      ${pagerHtml({ ...pg, idPrefix: "base" })}
    </section>
    <section class="grid cards-2" style="margin-top:12px">
      ${card("Qualidade no recorte", "Valores ausentes (—) na tabela.", `<div class="cols"><span>Sem data de entrada</span><strong>${fmt.format(missingEntry)} · ${pctFmt.format(rows.length ? (missingEntry / rows.length) * 100 : 0)}%</strong><span>Sem NPS</span><strong>${fmt.format(missingNps)} · ${pctFmt.format(rows.length ? (missingNps / rows.length) * 100 : 0)}%</strong><span>EP não informado</span><strong>${fmt.format(missingEp)}</strong><span>Sem reunião</span><strong>${fmt.format(rows.filter((row) => !row.totalMeetings).length)}</strong><span>Sem mecanismo implantado</span><strong>${fmt.format(rows.filter((row) => !row.implementedCount).length)}</strong></div>`)}
      ${card("Volume carregado da BASE QV", "Somente leitura — não altera origem.", `<div class="cols"><span>Clientes</span><strong>${fmt.format(counts.clients || 0)}</strong><span>Reuniões</span><strong>${fmt.format(counts.clientMeetings || 0)}</strong><span>Reuniões manuais</span><strong>${fmt.format(counts.manualMeetings || 0)}</strong><span>Mecanismos</span><strong>${fmt.format(counts.clientMecanismos || 0)}</strong><span>NPS</span><strong>${fmt.format(counts.npsResponses || 0)}</strong><span>Cancelamentos</span><strong>${fmt.format(counts.cancellations || 0)}</strong></div>`)}
    </section>
    ${card("Dicionário resumido", "Campos disponíveis no drawer e nas colunas opcionais.", table("<th>Grupo</th><th>Campo</th><th>Leitura</th>", [
      ["Cadastro", "Ciclo", "Número contratual — ciclo > 1 não prova renovação efetiva."],
      ["HS", "E / M", "Notas discretas 0/20/60/100 conforme regras V1."],
      ["HS", "Classificação", "Em implantação e Sem registro precedem faixas de score."],
      ["Contratos", "Evid. cancel.", "Indício analítico — pedido não efetiva churn."],
      ["Satisfação", "NPS", "Última resposta 0–10 quando existir."],
      ["Histórico", "Snapshots BD", "HS congelado por execução — ver perfil do cliente."],
    ].map(([g, n, t]) => `<tr><td>${escapeHtml(g)}</td><td>${escapeHtml(n)}</td><td>${escapeHtml(t)}</td></tr>`).join("")))}
  `;
  document.getElementById("baseTableSearch")?.addEventListener("input", (ev) => {
    state.baseSearch = ev.target.value;
    state.page = 1;
    renderBase(payload);
  });
  el.view.querySelectorAll("[data-base-col]").forEach((input) => {
    input.addEventListener("change", () => {
      const ids = [...el.view.querySelectorAll("[data-base-col]:checked")].map((n) => n.dataset.baseCol);
      const locked = ANALYTICAL_COLUMNS.filter((c) => c.locked).map((c) => c.id);
      state.baseColumnIds = [...new Set([...locked, ...ids])];
      saveAnalyticalColumnIds(state.baseColumnIds);
      renderBase(payload);
    });
  });
  el.view.querySelectorAll("[data-base-group-action]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const group = btn.dataset.baseGroup;
      const action = btn.dataset.baseGroupAction;
      const groupIds = ANALYTICAL_COLUMNS.filter((c) => c.group === group && !c.locked).map((c) => c.id);
      const locked = ANALYTICAL_COLUMNS.filter((c) => c.locked).map((c) => c.id);
      const cur = new Set(state.baseColumnIds);
      if (action === "all") groupIds.forEach((id) => cur.add(id));
      else groupIds.forEach((id) => cur.delete(id));
      state.baseColumnIds = [...new Set([...locked, ...cur])];
      saveAnalyticalColumnIds(state.baseColumnIds);
      renderBase(payload);
    });
  });
  document.getElementById("btnBaseCsv")?.addEventListener("click", () => downloadAnalyticalCsv(payload));
  document.getElementById("btnBaseSortHs")?.addEventListener("click", () => {
    const cur = getTableSort();
    if (cur.key === "healthScore" && cur.dir === "asc") setTableSort({ key: "healthScore", dir: "desc" });
    else setTableSort({ key: "healthScore", dir: "asc" });
    renderBase(payload);
  });
  el.view.querySelectorAll("[data-sort]").forEach((header) => header.addEventListener("click", () => {
    const column = header.dataset.sort;
    const cur = getTableSort();
    setTableSort({ key: column, dir: cur.key === column && cur.dir === "asc" ? "desc" : "asc" });
    render();
  }));
  bindPager(el.view, "base", {
    getPage: () => state.page,
    setPage: (p) => {
      state.page = p;
    },
    onChange: () => render(),
  });
  bindTableRowClicks(el.view, { viewKey: "base" });
  el.view.querySelectorAll("[data-goto-view]").forEach((node) => {
    node.addEventListener("click", () => document.querySelector(`.nav-btn[data-view="${node.dataset.gotoView}"]`)?.click());
  });
}

async function fetchClientHistoryPanel(panel, clientId) {
  const snapRes = await fetch(`/api/client-snapshot-history?clientId=${encodeURIComponent(clientId)}`);
  const snapHist = snapRes.ok ? await snapRes.json() : null;
  if (snapHist?.ok && snapHist.points?.length) {
    const histRows = snapHist.points
      .map(
        (p) =>
          `<tr><td>${escapeHtml(p.dia)}</td><td class="num">${p.hs == null ? "—" : formatNum(p.hs, 0)}</td><td class="num">${p.e == null ? "—" : formatNum(p.e, 0)}</td><td class="num">${p.m == null ? "—" : formatNum(p.m, 0)}</td><td>${escapeHtml(p.classe || "")}</td></tr>`,
      )
      .join("");
    panel.innerHTML = card(
      "Histórico observado (Business Data)",
      "Snapshots reais — HS V1 congelado por execução",
      table("<th>Ref.</th><th class='num'>HS</th><th class='num'>E</th><th class='num'>M</th><th>Classe</th>", histRows),
    );
    return;
  }
  const res = await fetch(`/api/client-hs-history?clientId=${encodeURIComponent(clientId)}`);
  const hist = res.ok ? await res.json() : null;
  if (!hist?.available || !hist.points?.length) {
    panel.innerHTML = `<p class="note">${escapeHtml(snapHist?.error || hist?.nota || hist?.reason || "Sem histórico comparável — aguardando snapshots ou export de pesquisa.")}</p>`;
    return;
  }
  const histRows = hist.points
    .slice(-12)
    .map(
      (p) =>
        `<tr><td>${escapeHtml(p.mes)}</td><td class="num">${p.hs == null ? "—" : formatNum(p.hs, 0)}</td><td class="num">${p.e == null ? "—" : formatNum(p.e, 0)}</td><td class="num">${p.m == null ? "—" : formatNum(p.m, 0)}</td><td class="num">${p.reunioes ?? "—"}</td><td>${escapeHtml(p.confiabilidade || "")}</td></tr>`,
    )
    .join("");
  panel.innerHTML = card(
    "Histórico reconstruído (pesquisa)",
    escapeHtml(hist.nota || "Point-in-time — não misturar com operacional"),
    table("<th>Mês</th><th class='num'>HS</th><th class='num'>E</th><th class='num'>M</th><th class='num'>Reuniões</th><th>Conf.</th>", histRows),
  );
}

async function openDetail(clientId, { viewKey = state.view === "base" ? "base" : "portfolio" } = {}) {
  const row = clients().find((item) => String(item.clientId) === String(clientId));
  if (!row) return;
  state.selectedId = clientId;
  const neighborIds = neighborClientIds(viewKey === "base" ? "base" : "portfolio");
  mountClientProfile({
    dialog: el.dialog,
    row,
    weights: state.weights,
    hsFutureFeasible: state.hsFutureFeasible,
    churnModelOperational: false,
    neighborIds,
    onNavigate: (id) => openDetail(id, { viewKey }),
    helpers: { escapeHtml, formatNum, formatDate, fmt },
    fetchHistory: (panel) => fetchClientHistoryPanel(panel, clientId),
    onClose: () => {
      state.selectedId = null;
    },
  });
  openClientDrawer(el.dialog);
}

function renderFatalView(message, { retry = true } = {}) {
  el.view.innerHTML = `
    <section class="card error-state">
      <h2>Não foi possível exibir o painel</h2>
      <p class="sub">${escapeHtml(message || "Erro desconhecido.")}</p>
      ${retry ? `<button type="button" class="btn" id="btnRetryLoad">Tentar novamente</button>` : ""}
    </section>`;
  document.getElementById("btnRetryLoad")?.addEventListener("click", () => startDashboardLoad({ refresh: true }));
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
    updateGlobalWeightBadge();
    applyFiltersSticky();
    updateFilterNote();
    refreshSystemBannersForView();
    if (state.view === "overview") renderOverview(payload);
    else if (state.view === "portfolio") renderPortfolio(payload);
    else if (state.view === "health") renderHealth(payload);
    else if (state.view === "evolution") renderEvolution();
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
  const t0 = performance.now();
  safeRender();
  state.lastRenderMs = Math.round(performance.now() - t0);
  if (state.lastRenderMs >= 0) console.debug("[nav render]", state.view, `${state.lastRenderMs}ms`);
}

function apiErrorFromResponse(response, text) {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const preview = String(text || "")
    .trimStart()
    .slice(0, 48);
  const looksHtml = preview.startsWith("<!") || preview.startsWith("<html");
  if (response.status === 404) {
    return "Rotas /api/* indisponíveis neste deploy (404). Confirme funções serverless e variáveis de ambiente na Vercel.";
  }
  if (looksHtml || contentType.includes("text/html")) {
    return "A API respondeu HTML em vez de JSON — verifique rewrites e deploy das funções /api/*.";
  }
  if (!contentType.includes("json")) {
    return `Resposta inesperada da API (${response.status}, ${contentType || "sem Content-Type"}).`;
  }
  return null;
}

async function fetchJson(url, { timeoutMs = API_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    const formatError = apiErrorFromResponse(response, text);
    if (formatError) {
      return { response, body: { error: formatError, code: response.status === 404 ? "API_NOT_DEPLOYED" : "API_BAD_FORMAT" } };
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: "JSON inválido na resposta da API." };
    }
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
    if (!response.ok) {
      const hint =
        body.code === "DATA_CONFIG" || body.code === "DATA_CONFIG_INVALID"
          ? "Configure DATA_SUPABASE_URL e DATA_SUPABASE_SERVICE_ROLE_KEY na Vercel (Production)."
          : body.code === "API_NOT_DEPLOYED"
            ? body.error
            : null;
      throw new Error(hint || body.message || body.error || "Falha na API principal.");
    }
    if (!Array.isArray(body.clients)) throw new Error("Payload sem lista de clientes.");
    if (requestId !== state.requestId) return;
    const qKey = queryParams().toString();
    const resetPage = refresh || qKey !== state.lastQueryKey;
    state.payload = body;
    state.hs2aLabSnapshot = body.metadata?.hs2aLab || null;
    if (resetPage) {
      state.page = 1;
      state.evolutionPage = 1;
      state.evolutionSummaryKey = "";
    }
    state.lastQueryKey = qKey;
    applyOptions(body);
    const meta = body.metadata || {};
    const ms = Math.round(performance.now() - started);
    el.meta.textContent = meta.generatedAt
      ? `Atualizado ${new Date(meta.generatedAt).toLocaleString("pt-BR")} · ${fmt.format(body.clients.length)} clientes · ${ms} ms`
      : `Atualizado · ${ms} ms`;
    state.loadStatus = "ready";
    hideError();
    loadMonitoringHistory().catch(() => {});
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

function setWeights(engagementValue) {
  state.weights = weightsFromEngagement(engagementValue);
  localStorage.setItem(WEIGHT_KEY, JSON.stringify(state.weights));
  paintBalancePanel(el.scoreSlot, state.weights);
  updateGlobalWeightBadge();
  if (state.payload?.clients?.length) {
    state.payload = applyWeightsToPayload(state.payload, state.weights);
    render();
  }
}

function downloadCsv() {
  window.location.href = `/api/health-score.csv?${queryParams().toString()}`;
}

function downloadGerencialCsv() {
  const params = queryParams();
  params.set("export", "gerencial");
  params.set("weights", `${state.weights.engagement}/${state.weights.mechanism}`);
  window.location.href = `/api/health-score.csv?${params.toString()}`;
}

function downloadAnalyticalCsv(payload) {
  const helpers = analyticalHelpers();
  const rows = sortedRowsForTable("base", () => filterBaseRows([...clients()]));
  const visible = state.baseColumnIds.filter((id) => ANALYTICAL_COLUMNS.some((c) => c.id === id));
  const csv = analyticalRowsToCsv(rows, visible, helpers);
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const day = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `base-analitica-${day}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function bind() {
  document.querySelectorAll(".nav-icon").forEach((node) => { node.innerHTML = ICONS[node.dataset.icon] || ""; });
  document.querySelectorAll(".nav-btn").forEach((button) => button.addEventListener("click", () => {
    const next = button.dataset.view;
    const prev = state.view;
    if (next === prev) {
      el.shell.classList.remove("nav-open");
      return;
    }
    state.view = next;
    document.querySelectorAll(".nav-btn").forEach((item) => item.classList.toggle("active", item === button));
    el.shell.classList.remove("nav-open");
    if (shouldRefetchOnEnterResearch(prev, next)) {
      if (!state.researchBundleLoaded) ensureResearchBundle();
      if (normalizeResearchTab(state.researchTab) === "panorama") ensureResearchPanorama();
      if (normalizeResearchTab(state.researchTab) === "model") ensurePredictiveLabPack();
      render();
      loadData();
    } else if (shouldRefetchOnLeaveResearch(prev, next)) {
      loadData();
    } else {
      render();
    }
  }));
  document.getElementById("btnCollapse").addEventListener("click", () => {
    el.shell.classList.toggle("collapsed");
    localStorage.setItem(SIDEBAR_KEY, el.shell.classList.contains("collapsed") ? "1" : "0");
    syncSidebarToggleUi();
  });
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    const label = btn.querySelector(".nav-label")?.textContent?.trim();
    if (label) btn.setAttribute("title", label);
  });
  document.getElementById("btnNav").addEventListener("click", () => el.shell.classList.toggle("nav-open"));
  document.getElementById("backdrop").addEventListener("click", () => el.shell.classList.remove("nav-open"));
  [el.ep, el.program, el.final, el.cluster].forEach((node) => node.addEventListener("change", () => {
    captureFilters();
    state.monitoringLoaded = false;
    loadData();
  }));
  el.search.addEventListener("input", () => { captureFilters(); scheduleLoad(); });
  el.pin.addEventListener("change", () => {
    state.pinned = el.pin.checked;
    captureFilters();
    savePin();
    applyFiltersSticky();
  });
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
    refreshSystemStatus();
  });
  document.getElementById("btnCsv").addEventListener("click", downloadCsv);
  document.getElementById("btnGuide").addEventListener("click", () => window.open("/guia-health-score-ceo.html", "_blank", "noopener"));
  if (localStorage.getItem(SIDEBAR_KEY) === "1") {
    el.shell.classList.add("collapsed");
  }
  syncSidebarToggleUi();
  bindClientDrawer(el.dialog, {
    onClose: () => {
      state.selectedId = null;
    },
  });
}

async function refreshSystemStatus() {
  state.systemStatus = await loadSystemStatus();
  refreshSystemBannersForView();
}

async function probeApiOnBoot() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_PROBE_TIMEOUT_MS);
  try {
    const res = await fetch("/api/config-status", { method: "GET", signal: controller.signal });
    const text = await res.text();
    const formatError = apiErrorFromResponse(res, text);
    if (formatError) {
      return { ok: false, message: formatError, code: res.status === 404 ? "API_NOT_DEPLOYED" : "API_BAD_FORMAT" };
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, message: "Resposta inválida de /api/config-status.", code: "API_BAD_FORMAT" };
    }
    if (res.status === 503 || body.ready === false) {
      const missing = Object.entries(body.presence || {})
        .filter(([, v]) => v !== "presente")
        .map(([k]) => k);
      const envHint = missing.length
        ? ` Configure na Vercel (Production): ${missing.join(", ")}.`
        : body.message
          ? ` ${body.message}`
          : "";
      return {
        ok: false,
        message: `BASE QV não configurada para leitura.${envHint}`,
        code: body.code || "DATA_CONFIG",
        configStatus: body,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        message: body.message || body.error || `API indisponível (${res.status}).`,
        code: body.code || "API_ERROR",
      };
    }
    return { ok: true, configStatus: body };
  } catch (error) {
    if (error.name === "AbortError") {
      return {
        ok: false,
        message:
          "A API não respondeu a tempo (timeout). Verifique funções serverless /api/* na Vercel e redeploy após correções.",
        code: "API_TIMEOUT",
      };
    }
    return { ok: false, message: "Não foi possível contactar /api/config-status (rede ou CORS).", code: "NETWORK" };
  } finally {
    clearTimeout(timer);
  }
}

async function startDashboardLoad({ refresh = false } = {}) {
  const probe = await probeApiOnBoot();
  if (!probe.ok) {
    state.loadStatus = "critical_error";
    state.loadError = probe.message;
    showError(probe.message);
    el.meta.textContent = probe.code === "DATA_CONFIG" ? "Configuração incompleta" : "Erro de API";
    renderFatalView(probe.message);
    return;
  }
  ensureResearchBundle();
  refreshSystemStatus();
  loadData({ refresh });
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
  applyFiltersSticky();
  window.addEventListener("ha:report-result", (ev) => showReportToast(ev.detail));
  bind();
  startDashboardLoad();
}

window.addEventListener("error", (event) => {
  console.error("[dashboard]", event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[dashboard] promise rejeitada", event.reason);
});

boot();
