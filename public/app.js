const state = {
  showDetails: false,
  payload: null,
  loading: false,
  debounce: null,
  requestId: 0,
  weights: {
    engagement: 50,
    mechanism: 50,
  },
};

const el = {
  formulaTitle: document.getElementById("formulaTitle"),
  formulaText: document.getElementById("formulaText"),
  weightsText: document.getElementById("weightsText"),
  kpiGrid: document.getElementById("kpiGrid"),
  healthBars: document.getElementById("healthBars"),
  engagementBars: document.getElementById("engagementBars"),
  mechanismBars: document.getElementById("mechanismBars"),
  clientsBody: document.getElementById("clientsBody"),
  tableWrap: document.getElementById("tableWrap"),
  tableCount: document.getElementById("tableCount"),
  btnToggleTable: document.getElementById("btnToggleTable"),
  metaLine: document.getElementById("metaLine"),
  errorBanner: document.getElementById("errorBanner"),
  fSearch: document.getElementById("fSearch"),
  fEp: document.getElementById("fEp"),
  fCluster: document.getElementById("fCluster"),
  fProgram: document.getElementById("fProgram"),
  fFinal: document.getElementById("fFinal"),
  engagementWeightRange: document.getElementById("engagementWeightRange"),
  engagementWeightInput: document.getElementById("engagementWeightInput"),
  mechanismWeightRange: document.getElementById("mechanismWeightRange"),
  mechanismWeightInput: document.getElementById("mechanismWeightInput"),
  healthView: document.getElementById("healthView"),
  npsView: document.getElementById("npsView"),
  npsKpis: document.getElementById("npsKpis"),
  npsEngagementCorrelation: document.getElementById("npsEngagementCorrelation"),
  npsMechanismCorrelation: document.getElementById("npsMechanismCorrelation"),
  npsRenewalBody: document.getElementById("npsRenewalBody"),
};

const fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const pctFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const WEIGHTS_STORAGE_KEY = "healthScoreWeights";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function badgeClass(label) {
  const t = String(label || "");
  if (t === "Em implantação") return "implantacao";
  if (t === "Sem registro") return "registro";
  if (t.includes("Crítico") || t.includes("crítico")) return "Crítico";
  if (t.startsWith("Saudável")) return "Saudável";
  if (t.startsWith("Atenção")) return "Atenção";
  return "";
}

function formatDate(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return dateFmt.format(d);
}

function currentFilters() {
  return {
    search: el.fSearch.value.trim(),
    ep: el.fEp.value || "all",
    cluster: el.fCluster.value || "ativos",
    program: el.fProgram.value || "all",
    finalClass: el.fFinal.value || "all",
  };
}

function clampWeight(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function readStoredWeights() {
  try {
    const stored = JSON.parse(localStorage.getItem(WEIGHTS_STORAGE_KEY) || "{}");
    const engagement = clampWeight(stored.engagement);
    const mechanism = clampWeight(stored.mechanism);
    if (engagement + mechanism === 100) {
      state.weights = { engagement, mechanism };
    }
  } catch {
    state.weights = { engagement: 50, mechanism: 50 };
  }
}

function saveWeights() {
  localStorage.setItem(WEIGHTS_STORAGE_KEY, JSON.stringify(state.weights));
}

function decimalWeight(value) {
  return (value / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

function renderWeightText() {
  el.formulaText.textContent = `Health Score = (E × ${decimalWeight(state.weights.engagement)}) + (M × ${decimalWeight(state.weights.mechanism)})`;
  el.weightsText.textContent = `Pesos: Engajamento (E) = ${state.weights.engagement}% · Mecanismos (M) = ${state.weights.mechanism}%`;
}

function syncWeightControls() {
  el.engagementWeightRange.value = String(state.weights.engagement);
  el.engagementWeightInput.value = String(state.weights.engagement);
  el.mechanismWeightRange.value = String(state.weights.mechanism);
  el.mechanismWeightInput.value = String(state.weights.mechanism);
  renderWeightText();
}

function setWeights(changed, value) {
  const primary = clampWeight(value);
  const secondary = 100 - primary;
  state.requestId += 1;
  state.weights = changed === "mechanism"
    ? { engagement: secondary, mechanism: primary }
    : { engagement: primary, mechanism: secondary };
  syncWeightControls();
  saveWeights();
  scheduleLoad();
}

function fillSelect(select, options, selected) {
  const opts = Array.isArray(options) ? options : [];
  select.innerHTML = opts
    .map((o) => {
      const value = o.value ?? o;
      const label = o.label ?? o;
      const sel = String(value) === String(selected) ? " selected" : "";
      return `<option value="${escapeHtml(value)}"${sel}>${escapeHtml(label)}</option>`;
    })
    .join("");
}

function renderKpis(summary) {
  const cards = [
    { label: "Clientes filtrados", value: fmt.format(summary.totalClients || 0), hint: "Recorte atual, incluindo sem registro" },
    { label: "Score médio", value: fmt.format(summary.averageScore || 0), hint: "Média do health score final" },
    {
      label: "Saudáveis",
      value: fmt.format(summary.healthy || 0),
      hint: `${pctFmt.format(summary.healthyPercent || 0)}%`,
      tone: "healthy",
    },
    {
      label: "Atenção",
      value: fmt.format(summary.attention || 0),
      hint: `${pctFmt.format(summary.attentionPercent || 0)}%`,
      tone: "attention",
    },
    {
      label: "Críticos",
      value: fmt.format(summary.critical || 0),
      hint: `${pctFmt.format(summary.criticalPercent || 0)}%`,
      tone: "critical",
    },
    {
      label: "Em implantação",
      value: fmt.format(summary.implanting || 0),
      hint: `${pctFmt.format(summary.implantingPercent || 0)}%`,
      tone: "implantacao",
    },
    {
      label: "Sem registro",
      value: fmt.format(summary.noRecord || 0),
      hint: `${pctFmt.format(summary.noRecordPercent || 0)}%`,
      tone: "registro",
    },
  ];
  el.kpiGrid.innerHTML = cards
    .map(
      (c) => `
      <article class="kpi ${c.tone || ""}">
        <p class="label">${escapeHtml(c.label)}</p>
        <p class="value">${escapeHtml(c.value)}</p>
        <p class="hint">${escapeHtml(c.hint || "")}</p>
      </article>`,
    )
    .join("");
}

function toneForLabel(label) {
  const t = String(label || "");
  if (t === "Em implantação") return "implantacao";
  if (t === "Sem registro") return "registro";
  if (t.includes("Crítico") || t.includes("crítico")) return "critical";
  if (t.startsWith("Saudável")) return "healthy";
  if (t.startsWith("Atenção")) return "attention";
  return "";
}

function renderBars(container, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    container.innerHTML = `<p class="muted">Sem dados no recorte.</p>`;
    return;
  }
  container.innerHTML = list
    .map((row) => {
      const tone = toneForLabel(row.label);
      const width = Math.max(0, Math.min(100, Number(row.percent) || 0));
      return `
        <div class="bar-row">
          <span>${escapeHtml(row.label)}</span>
          <div class="bar-track"><div class="bar-fill ${escapeHtml(tone)}" style="width:${width}%"></div></div>
          <span class="bar-meta">${fmt.format(row.count)} · ${pctFmt.format(row.percent)}%</span>
        </div>`;
    })
    .join("");
}

function renderTable(clients) {
  const rows = Array.isArray(clients) ? clients : [];
  el.tableCount.textContent = `${fmt.format(rows.length)} cliente(s) no recorte`;
  el.clientsBody.innerHTML = rows
    .map((c) => {
      const finalBadge = badgeClass(c.finalClass);
      return `<tr>
        <td>${escapeHtml(c.clientName)}</td>
        <td>${escapeHtml(c.clientCode)}</td>
        <td>${escapeHtml(c.engineer)}</td>
        <td>${escapeHtml(c.analyticalStatus)}</td>
        <td>${escapeHtml(c.program)}</td>
        <td class="num">${c.currentCycle == null ? "—" : fmt.format(c.currentCycle)}</td>
        <td>${c.hasRenewed ? "sim" : "não"}</td>
        <td>${escapeHtml(formatDate(c.cancellationDate))}</td>
        <td class="num">${fmt.format(c.totalMeetings || 0)}</td>
        <td class="num">${fmt.format(c.avgMeetingsPerMonth)}</td>
        <td class="num">${fmt.format(c.engagementScore)}</td>
        <td class="num">${fmt.format(c.implementedCount || 0)}</td>
        <td class="num">${fmt.format(c.mechanismScore)}</td>
        <td class="num"><strong>${fmt.format(c.healthScore)}</strong></td>
        <td><span class="badge ${finalBadge}">${escapeHtml(c.finalClass)}</span></td>
      </tr>`;
    })
    .join("");
}

function formatCorrelation(value) {
  return value == null ? "Sem base suficiente" : value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function renderCorrelation(container, correlation) {
  if (!correlation) {
    container.innerHTML = `<p class="muted">Sem dados de NPS no recorte.</p>`;
    return;
  }
  container.innerHTML = `
    <dl class="correlation-values">
      <div><dt>Pearson</dt><dd>${escapeHtml(formatCorrelation(correlation.pearson))}</dd></div>
      <div><dt>Spearman</dt><dd>${escapeHtml(formatCorrelation(correlation.spearman))}</dd></div>
      <div><dt>Base pareada</dt><dd>${escapeHtml(fmt.format(correlation.sampleSize || 0))} clientes</dd></div>
    </dl>`;
}

function renderNps(payload) {
  const nps = payload.nps || {};
  el.npsKpis.innerHTML = [
    { label: "Cobertura NPS", value: `${pctFmt.format(nps.coveragePercent || 0)}%`, hint: `${fmt.format(nps.respondents || 0)} de ${fmt.format(nps.totalClients || 0)} clientes` },
    { label: "Respondentes NPS", value: fmt.format(nps.respondents || 0), hint: "Última resposta válida por cliente" },
  ].map((card) => `<article class="kpi"><p class="label">${escapeHtml(card.label)}</p><p class="value">${escapeHtml(card.value)}</p><p class="hint">${escapeHtml(card.hint)}</p></article>`).join("");
  const correlations = nps.correlations || [];
  renderCorrelation(el.npsEngagementCorrelation, correlations.find((item) => item.key === "engagementScore"));
  renderCorrelation(el.npsMechanismCorrelation, correlations.find((item) => item.key === "mechanismScore"));
  el.npsRenewalBody.innerHTML = (nps.renewalByClass || []).map((row) => `
    <tr><td>${escapeHtml(row.label)}</td><td class="num">${fmt.format(row.respondents || 0)}</td><td class="num">${fmt.format(row.renewed || 0)}</td><td class="num">${row.renewalRate == null ? "—" : `${pctFmt.format(row.renewalRate)}%`}</td><td class="num">${row.shareOfRenewed == null ? "—" : `${pctFmt.format(row.shareOfRenewed)}%`}</td></tr>`).join("");
}

function renderPayload(payload) {
  state.payload = payload;
  el.formulaTitle.textContent = "Health Score";
  renderWeightText();
  renderKpis(payload.summary || {});
  renderBars(el.healthBars, payload.healthDistribution);
  renderBars(el.engagementBars, payload.distributions?.engagement);
  renderBars(el.mechanismBars, payload.distributions?.mechanism);
  renderTable(payload.clients || []);
  renderNps(payload);

  const options = payload.filters?.options || {};
  const applied = payload.filters?.applied || {};
  fillSelect(el.fCluster, options.cluster, applied.cluster || "ativos");
  fillSelect(el.fEp, options.ep, applied.ep || "all");
  fillSelect(el.fProgram, options.program, applied.program || "all");
  fillSelect(el.fFinal, options.finalClass, applied.finalClass || "all");
  if (applied.search != null && document.activeElement !== el.fSearch) {
    el.fSearch.value = applied.search;
  }

  const meta = payload.metadata || {};
  const counts = meta.counts || {};
  el.metaLine.innerHTML = `
    Gerado em ${escapeHtml(meta.generatedAt ? new Date(meta.generatedAt).toLocaleString("pt-BR") : "—")}<br/>
    ${fmt.format(counts.clients || 0)} clientes · ${fmt.format(counts.clientMeetings || 0)} reuniões · carga ${fmt.format(meta.loadMs || 0)} ms
  `;
  hideError();
}

function showError(message) {
  el.errorBanner.textContent = message;
  el.errorBanner.classList.remove("hidden");
}

function hideError() {
  el.errorBanner.classList.add("hidden");
  el.errorBanner.textContent = "";
}

function queryParams({ refresh = false } = {}) {
  const filters = currentFilters();
  const params = new URLSearchParams({
    cluster: filters.cluster,
    ep: filters.ep,
    program: filters.program,
    finalClass: filters.finalClass,
    engagementWeight: String(state.weights.engagement),
    mechanismWeight: String(state.weights.mechanism),
  });
  if (filters.search) params.set("search", filters.search);
  if (refresh) params.set("refresh", "1");
  return params;
}

async function loadData({ refresh = false } = {}) {
  const requestId = state.requestId + 1;
  state.requestId = requestId;
  state.loading = true;
  el.metaLine.textContent = "Carregando Health Score…";
  const params = queryParams({ refresh });

  try {
    const res = await fetch(`/api/health-score?${params.toString()}`);
    const contentType = res.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await res.json()
      : { error: await res.text() };
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    if (requestId !== state.requestId) return;
    renderPayload(body);
  } catch (error) {
    if (requestId !== state.requestId) return;
    console.error(error);
    showError(error.message || "Falha ao carregar o dashboard.");
    el.metaLine.textContent = "Erro ao carregar";
  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
    }
  }
}

function scheduleLoad() {
  if (state.debounce) clearTimeout(state.debounce);
  state.debounce = setTimeout(() => loadData(), 280);
}

["change"].forEach((evt) => {
  [el.fEp, el.fCluster, el.fProgram, el.fFinal].forEach((node) => {
    node.addEventListener(evt, () => loadData());
  });
});

el.fSearch.addEventListener("input", scheduleLoad);

readStoredWeights();
syncWeightControls();

el.engagementWeightRange.addEventListener("input", () => setWeights("engagement", el.engagementWeightRange.value));
el.engagementWeightInput.addEventListener("input", () => setWeights("engagement", el.engagementWeightInput.value));
el.mechanismWeightRange.addEventListener("input", () => setWeights("mechanism", el.mechanismWeightRange.value));
el.mechanismWeightInput.addEventListener("input", () => setWeights("mechanism", el.mechanismWeightInput.value));

document.getElementById("btnReset").addEventListener("click", () => {
  el.fSearch.value = "";
  el.fCluster.value = "ativos";
  el.fEp.value = "all";
  el.fProgram.value = "all";
  el.fFinal.value = "all";
  loadData();
});

document.getElementById("btnRefresh").addEventListener("click", () => loadData({ refresh: true }));

document.getElementById("btnCsv").addEventListener("click", () => {
  window.location.href = `/api/health-score.csv?${queryParams().toString()}`;
});

document.getElementById("btnPdf").addEventListener("click", () => {
  window.open("/guia-health-score-ceo.html?print=1", "_blank", "noopener");
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => {
    const npsActive = button.dataset.view === "nps";
    document.querySelectorAll("[data-view]").forEach((node) => node.classList.toggle("active", node === button));
    el.healthView.classList.toggle("hidden", npsActive);
    el.npsView.classList.toggle("hidden", !npsActive);
  });
});

el.btnToggleTable.addEventListener("click", () => {
  state.showDetails = !state.showDetails;
  el.tableWrap.classList.toggle("hidden", !state.showDetails);
  el.btnToggleTable.textContent = state.showDetails ? "Ocultar detalhes" : "Mostrar detalhes";
});

document.querySelectorAll(".tip-btn").forEach((btn) => {
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    const tip = btn.closest(".tip");
    const wasOpen = tip.classList.contains("open");
    document.querySelectorAll(".tip.open").forEach((node) => node.classList.remove("open"));
    if (!wasOpen) tip.classList.add("open");
  });
});

document.addEventListener("click", () => {
  document.querySelectorAll(".tip.open").forEach((node) => node.classList.remove("open"));
});

loadData();
