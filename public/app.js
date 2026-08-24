const state = {
  model: "completo",
  showDetails: false,
  payload: null,
  loading: false,
  debounce: null,
};

const el = {
  formulaTitle: document.getElementById("formulaTitle"),
  formulaText: document.getElementById("formulaText"),
  weightsText: document.getElementById("weightsText"),
  kpiGrid: document.getElementById("kpiGrid"),
  healthBars: document.getElementById("healthBars"),
  s1Bars: document.getElementById("s1Bars"),
  s2Bars: document.getElementById("s2Bars"),
  s3Bars: document.getElementById("s3Bars"),
  s4Bars: document.getElementById("s4Bars"),
  clientsBody: document.getElementById("clientsBody"),
  tableWrap: document.getElementById("tableWrap"),
  tableCount: document.getElementById("tableCount"),
  btnToggleTable: document.getElementById("btnToggleTable"),
  metaLine: document.getElementById("metaLine"),
  errorBanner: document.getElementById("errorBanner"),
  fSearch: document.getElementById("fSearch"),
  fEp: document.getElementById("fEp"),
  fStatus: document.getElementById("fStatus"),
  fProgram: document.getElementById("fProgram"),
  fFinal: document.getElementById("fFinal"),
  fSituation: document.getElementById("fSituation"),
};

const fmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const pctFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 });

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function badgeClass(label) {
  const t = String(label || "");
  if (t.includes("Crítico") || t.includes("crítico")) return "Crítico";
  if (t.startsWith("Saudável")) return "Saudável";
  if (t.startsWith("Atenção")) return "Atenção";
  if (t.startsWith("Risco")) return "Risco";
  return "";
}

function currentFilters() {
  return {
    model: state.model,
    search: el.fSearch.value.trim(),
    ep: el.fEp.value || "all",
    status: el.fStatus.value || "active",
    program: el.fProgram.value || "all",
    finalClass: el.fFinal.value || "all",
    situation: el.fSituation.value || "all",
  };
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
    { label: "Clientes filtrados", value: fmt.format(summary.totalClients || 0), hint: "Base do recorte atual" },
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
      label: "Risco",
      value: fmt.format(summary.risk || 0),
      hint: `${pctFmt.format(summary.riskPercent || 0)}%`,
      tone: "risk",
    },
    {
      label: "Críticos",
      value: fmt.format(summary.critical || 0),
      hint: `${pctFmt.format(summary.criticalPercent || 0)}%`,
      tone: "critical",
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
  if (t.includes("Fase natural")) return "natural";
  if (t.includes("Crítico") || t.includes("crítico")) return "critical";
  if (t.startsWith("Saudável")) return "healthy";
  if (t.startsWith("Atenção")) return "attention";
  if (t.includes("maior")) return "risk-high";
  if (t.startsWith("Risco")) return "risk";
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
        <td class="num">${c.cycleDays == null ? "—" : fmt.format(c.cycleDays)}</td>
        <td class="num">${fmt.format(c.meetingsFirst45 || 0)}</td>
        <td><span class="badge ${badgeClass(c.s1Label)}">${escapeHtml(c.s1Label)}</span></td>
        <td class="num">${fmt.format(c.s1Score)}</td>
        <td class="num">${fmt.format(c.avgMeetingsPerMonth)}</td>
        <td><span class="badge ${badgeClass(c.s2Label)}">${escapeHtml(c.s2Label)}</span></td>
        <td class="num">${fmt.format(c.s2Score)}</td>
        <td class="num">${fmt.format(c.implementedCount || 0)}</td>
        <td><span class="badge ${badgeClass(c.s3Label)}">${escapeHtml(c.s3Label)}</span></td>
        <td class="num">${fmt.format(c.s3Score)}</td>
        <td><span class="badge ${badgeClass(c.s4Label)}">${escapeHtml(c.s4Label)}</span></td>
        <td class="num">${fmt.format(c.s4Score)}</td>
        <td class="num"><strong>${fmt.format(c.healthScore)}</strong></td>
        <td><span class="badge ${finalBadge}">${escapeHtml(c.finalClass)}</span></td>
      </tr>`;
    })
    .join("");
}

function syncTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    const active = btn.dataset.model === state.model;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function renderPayload(payload) {
  state.payload = payload;
  const w = payload.weights || {};
  el.formulaTitle.textContent = state.model === "simplificado" ? "Modelo Simplificado" : "Modelo Completo";
  el.formulaText.textContent = w.formula || "—";
  el.weightsText.textContent = w.label || "—";
  renderKpis(payload.summary || {});
  renderBars(el.healthBars, payload.healthDistribution);
  renderBars(el.s1Bars, payload.situationDistributions?.s1);
  renderBars(el.s2Bars, payload.situationDistributions?.s2);
  renderBars(el.s3Bars, payload.situationDistributions?.s3);
  renderBars(el.s4Bars, payload.situationDistributions?.s4);
  renderTable(payload.clients || []);

  const options = payload.filters?.options || {};
  const applied = payload.filters?.applied || {};
  fillSelect(el.fStatus, options.status, applied.status || "active");
  fillSelect(el.fEp, options.ep, applied.ep || "all");
  fillSelect(el.fProgram, options.program, applied.program || "all");
  fillSelect(el.fFinal, options.finalClass, applied.finalClass || "all");
  fillSelect(el.fSituation, options.situation, applied.situation || "all");
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

async function loadData({ refresh = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  el.metaLine.textContent = "Carregando Health Score…";
  const filters = currentFilters();
  const params = new URLSearchParams({
    model: filters.model,
    status: filters.status,
    ep: filters.ep,
    program: filters.program,
    finalClass: filters.finalClass,
    situation: filters.situation,
  });
  if (filters.search) params.set("search", filters.search);
  if (refresh) params.set("refresh", "1");

  try {
    const res = await fetch(`/api/health-score?${params.toString()}`);
    const contentType = res.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await res.json()
      : { error: await res.text() };
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    renderPayload(body);
  } catch (error) {
    console.error(error);
    showError(error.message || "Falha ao carregar o dashboard.");
    el.metaLine.textContent = "Erro ao carregar";
  } finally {
    state.loading = false;
  }
}

function scheduleLoad() {
  if (state.debounce) clearTimeout(state.debounce);
  state.debounce = setTimeout(() => loadData(), 280);
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.model = btn.dataset.model;
    syncTabs();
    loadData();
  });
});

["change"].forEach((evt) => {
  [el.fEp, el.fStatus, el.fProgram, el.fFinal, el.fSituation].forEach((node) => {
    node.addEventListener(evt, () => loadData());
  });
});

el.fSearch.addEventListener("input", scheduleLoad);

document.getElementById("btnReset").addEventListener("click", () => {
  el.fSearch.value = "";
  el.fStatus.value = "active";
  el.fEp.value = "all";
  el.fProgram.value = "all";
  el.fFinal.value = "all";
  el.fSituation.value = "all";
  loadData();
});

document.getElementById("btnRefresh").addEventListener("click", () => loadData({ refresh: true }));

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

syncTabs();
loadData();
