/**

 * Perfil individual — drawer lateral com abas.

 */



import { weightsFromEngagement } from "/lib/frontend/hs-weight.mjs";

import { computeHealthScore, classifyHealth } from "/lib/scoring.mjs";

import { closeClientDrawer } from "./client-drawer.mjs";



export function mountClientProfile({

  dialog,

  row,

  helpers,

  onClose,

  fetchHistory,

  weights = { engagement: 50, mechanism: 50 },

  hsFutureFeasible = false,

  churnModelOperational = false,

  neighborIds = [],

  onNavigate,

}) {

  const wE = Number(weights.engagement) / 100;

  const wM = Number(weights.mechanism) / 100;

  const e = Number(row.engagementScore) || 0;

  const m = Number(row.mechanismScore) || 0;

  const hs = Number(row.healthScore);

  const hsExplain = Number.isFinite(hs)

    ? `HS = (E × ${weights.engagement}%) + (M × ${weights.mechanism}%) = ${helpers.formatNum(hs, 1)}`

    : "HS indisponível — faltam E ou M válidos.";

  const zeroNote =

    hs === 0

      ? `<p class="note">Score zero: E=${e}, M=${m}. Classificação: <strong>${helpers.escapeHtml(row.finalClass)}</strong> — nem todo HS 0 é “crítico operacional”.</p>`

      : "";

  const h = row.hs2a || {};

  const fatores = (h.fatores || []).map((f) => `<li>${helpers.escapeHtml(f.label)}</li>`).join("");

  const hints = (h.verificacaoHumana || []).map((t) => `<li>${helpers.escapeHtml(t)}</li>`).join("");



  dialog.innerHTML = `

    <div class="profile-drawer" role="document">

      <header class="profile-drawer-header">

        <div class="profile-drawer-titleblock">

          <h2 id="profileDrawerTitle">${helpers.escapeHtml(row.clientName)}</h2>

          <p class="profile-drawer-meta">${helpers.escapeHtml(row.clientCode || "—")} · ${helpers.escapeHtml(row.program || "—")} · ${helpers.escapeHtml(row.engineer || "—")}</p>

        </div>

        <div class="profile-drawer-actions">
          ${neighborIds.length > 1 ? `<button type="button" class="btn ghost btn-sm" id="profilePrev" ${neighborIds.indexOf(String(row.clientId)) <= 0 ? "disabled" : ""} aria-label="Cliente anterior">←</button><button type="button" class="btn ghost btn-sm" id="profileNext" ${neighborIds.indexOf(String(row.clientId)) >= neighborIds.length - 1 ? "disabled" : ""} aria-label="Próximo cliente">→</button>` : ""}
          <button type="button" class="btn btn-outline btn-sm profile-drawer-close" id="closeDetail" aria-label="Fechar perfil">Fechar</button>
        </div>

      </header>

      <nav class="profile-drawer-tabs" role="tablist" aria-label="Seções do perfil">

        <button type="button" class="tab-btn active" role="tab" aria-selected="true" data-profile-tab="now">Situação atual</button>

        <button type="button" class="tab-btn" role="tab" data-profile-tab="rel">Cadastro e contrato</button>

        <button type="button" class="tab-btn" role="tab" data-profile-tab="hist">Histórico</button>

        <button type="button" class="tab-btn" role="tab" data-profile-tab="proj">Projeções</button>

      </nav>

      <div class="profile-drawer-body">

        <div class="profile-panel" id="profileNow" role="tabpanel">

          <p class="lead-plain">Health Score combina <strong>engajamento (E)</strong> e <strong>mecanismos (M)</strong> com regras operacionais V1.</p>

          <div class="grid cards-2 profile-kpis">

            <article class="kpi"><p class="label">Health Score</p><p class="value">${Number.isFinite(hs) ? helpers.formatNum(hs, 0) : "—"}</p></article>

            <article class="kpi"><p class="label">Classificação</p><p class="value">${helpers.escapeHtml(row.finalClass)}</p></article>

            <article class="kpi"><p class="label">E / M</p><p class="value">${helpers.formatNum(row.engagementScore, 0)} / ${helpers.formatNum(row.mechanismScore, 0)}</p></article>

            <article class="kpi"><p class="label">Qualidade informacional</p><p class="value">${helpers.escapeHtml(h.qualidadeLabel || "—")}</p></article>

          </div>

          <p class="formula sub">${helpers.escapeHtml(hsExplain)}</p>

          ${zeroNote}

          <h3 class="detail-section">Indicadores principais</h3>

          <dl class="profile-dl">

            <dt>Fase</dt><dd>${helpers.escapeHtml(h.faseLabel || "—")}</dd>

            <dt>Perfil 2.0A</dt><dd>${helpers.escapeHtml(h.perfilLabel || "—")}</dd>

            <dt>Reuniões / última</dt><dd>${helpers.fmt.format(row.totalMeetings || 0)} · ${helpers.escapeHtml(helpers.formatDate(row.lastMeetingAt))}</dd>

            <dt>Mecanismos implantados</dt><dd>${helpers.fmt.format(row.implementedCount || 0)}</dd>

            <dt>NPS</dt><dd>${row.npsScore == null ? "—" : helpers.formatNum(row.npsScore, 0)}</dd>

          </dl>

          <h3 class="detail-section">Fatores observados</h3>

          <ul class="plain-list">${fatores || "<li>Nenhum fator destacado.</li>"}</ul>

          ${hints ? `<p class="sub">Verificação sugerida:</p><ul class="plain-list">${hints}</ul>` : ""}

        </div>

        <div class="profile-panel hidden" id="profileRel" role="tabpanel" hidden>

          <h3 class="detail-section">Cadastro</h3>

          <dl class="profile-dl">

            <dt>Status analítico</dt><dd>${helpers.escapeHtml(row.analyticalStatus || "—")}</dd>

            <dt>Status BASE QV</dt><dd>${helpers.escapeHtml(row.status || "—")}</dd>

            <dt>Entrada</dt><dd>${helpers.formatDate(row.entryDate)} (${helpers.escapeHtml(row.entrySource || "—")})</dd>

            <dt>Ciclo</dt><dd>${helpers.formatDate(row.cycleDate)} · ciclo ${row.currentCycle ?? "—"}</dd>

            <dt>Dias casa / ciclo</dt><dd>${row.daysSinceEntry ?? "—"} / ${row.cycleDays ?? "—"}</dd>

            <dt>Contrato DAVOS</dt><dd>${row.davos_contrato_assinado ? "Assinado" : "Não"}</dd>

          </dl>

          <h3 class="detail-section">Engajamento e mecanismos</h3>

          <dl class="profile-dl">

            <dt>E / M (faixas)</dt><dd>${helpers.formatNum(row.engagementScore, 0)} · ${helpers.formatNum(row.mechanismScore, 0)}</dd>

            <dt>Reuniões 30d</dt><dd>${row.reunioes30d ?? "—"}</dd>

            <dt>Mec. em andamento</dt><dd>${helpers.fmt.format(row.inProgressCount || 0)}</dd>

          </dl>

          <h3 class="detail-section">Renovação e cancelamento</h3>

          <dl class="profile-dl">

            <dt>Renovações</dt><dd>${row.renewalCount ?? "—"}</dd>

            <dt>Evidência cancelamento</dt><dd>${row.hasCancellationEvidence ? helpers.formatDate(row.cancellationDate) : "Não"}</dd>

          </dl>

          <p class="note">Somente leitura BASE QV. Ausência (—) não vira zero.</p>

        </div>

        <div class="profile-panel hidden" id="profileHist" role="tabpanel" hidden><p class="note">Carregando histórico…</p></div>

        <div class="profile-panel hidden" id="profileProj" role="tabpanel" hidden>

          ${alertProj(churnModelOperational, hsFutureFeasible)}

          <section class="simulator-box" aria-label="Simulador hipotético">

            <h3>Simulador E/M (hipótese)</h3>

            <p class="sub">Não é previsão validada nem score oficial.</p>

            <label>E <input type="range" id="simE" min="0" max="100" step="5" value="${row.engagementScore ?? 50}" /></label>

            <label>M <input type="range" id="simM" min="0" max="100" step="5" value="${row.mechanismScore ?? 50}" /></label>

            <label>Peso E <input type="range" id="simW" min="0" max="100" step="5" value="50" /></label>

            <p class="formula" id="simFormula">—</p>

            <p class="sub" id="simClass">—</p>

          </section>

        </div>

      </div>

    </div>`;



  const navIdx = neighborIds.indexOf(String(row.clientId));

  dialog.querySelector("#profilePrev")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (navIdx > 0) onNavigate?.(neighborIds[navIdx - 1]);
  });

  dialog.querySelector("#profileNext")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (navIdx >= 0 && navIdx < neighborIds.length - 1) onNavigate?.(neighborIds[navIdx + 1]);
  });

  dialog.querySelector("#closeDetail")?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeClientDrawer();
    onClose?.();
  });



  const panels = {

    now: dialog.querySelector("#profileNow"),

    rel: dialog.querySelector("#profileRel"),

    hist: dialog.querySelector("#profileHist"),

    proj: dialog.querySelector("#profileProj"),

  };

  dialog.querySelectorAll("[data-profile-tab]").forEach((btn) => {

    btn.addEventListener("click", () => {

      dialog.querySelectorAll("[data-profile-tab]").forEach((b) => {

        b.classList.toggle("active", b === btn);

        b.setAttribute("aria-selected", b === btn ? "true" : "false");

      });

      const tab = btn.dataset.profileTab;

      Object.entries(panels).forEach(([key, node]) => {

        if (!node) return;

        const on = key === tab;

        node.classList.toggle("hidden", !on);

        node.hidden = !on;

      });

    });

  });



  const simE = dialog.querySelector("#simE");

  const simM = dialog.querySelector("#simM");

  const simW = dialog.querySelector("#simW");

  const paintSim = () => {

    const w = weightsFromEngagement(Number(simW.value));

    const eSim = Number(simE.value);

    const mSim = Number(simM.value);

    const hsSim = computeHealthScore(eSim, mSim, {

      engagement: w.engagement / 100,

      mechanism: w.mechanism / 100,

    });

    const cls = classifyHealth({

      daysSinceEntry: row.daysSinceEntry,

      currentCycle: row.currentCycle,

      totalMeetings: row.totalMeetings,

      implementedCount: row.implementedCount,

      healthScore: hsSim,

    });

    dialog.querySelector("#simFormula").textContent = `HS hipotético = ${helpers.formatNum(hsSim, 0)} (${w.engagement}%·E + ${w.mechanism}%·M)`;

    dialog.querySelector("#simClass").textContent = `Classificação se aplicasse: ${cls}`;

  };

  [simE, simM, simW].forEach((el) => el?.addEventListener("input", paintSim));

  paintSim();



  fetchHistory?.(panels.hist, row).catch(() => {

    if (panels.hist) panels.hist.innerHTML = `<p class="note">Histórico indisponível.</p>`;

  });

}



function alertProj(churnOperational, hsFuture) {

  if (churnOperational) {

    return `<div class="alert alert-critical"><p class="alert-title">Risco individual</p><p>Não disponível — modelos experimentais não aprovados.</p></div>`;

  }

  if (hsFuture) {

    return `<div class="alert alert-experimental"><p class="alert-title">HS futuro</p><p>Estudo longitudinal — abaixo apenas cenários hipotéticos.</p></div>`;

  }

  return `<div class="alert alert-warning"><p class="alert-title">Projeções</p><p>Sem modelo validado de HS futuro ou churn individual.</p></div>`;

}


