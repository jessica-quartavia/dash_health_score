/** Controle único E ↔ M (centro = 50/50), passo 5%. */

import { isOfficialHsWeights } from "/lib/frontend/hs-weight.mjs";

export function formatWeightFormula(engagement, mechanism) {
  const wE = (engagement / 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  const wM = (mechanism / 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  return `HS = (E × ${wE}) + (M × ${wM})`;
}

export function balancePanelHtml({ engagement, mechanism }) {
  const official = isOfficialHsWeights({ engagement, mechanism });
  return `
    <section class="hs-balance-panel" aria-label="Balanceamento experimental do Health Score">
      <div class="hs-balance-compact">
        <div class="hs-balance-meta">
          <span class="hs-balance-side hs-balance-side--e">E <strong id="engLabel">${engagement}%</strong></span>
          <p class="hs-balance-formula" id="scoreFormula">${formatWeightFormula(engagement, mechanism)}</p>
          <span class="hs-balance-side hs-balance-side--m">M <strong id="mecLabel">${mechanism}%</strong></span>
        </div>
        <div class="hs-balance-track" style="--pos:${engagement}">
          <div class="hs-balance-center" aria-hidden="true"></div>
          <div class="hs-balance-thumb" aria-hidden="true"></div>
          <input type="range" id="hsBalance" class="hs-balance-input" min="0" max="100" step="5" value="${engagement}"
            aria-label="Peso de Engajamento de 0 a 100 por cento, passo 5. Mecanismos completam até 100."
            aria-valuetext="Engajamento ${engagement} por cento, Mecanismos ${mechanism} por cento" />
        </div>
        <div class="hs-balance-foot">
          <span class="score-badge alert-experimental-tag">${official ? "Oficial V1 documentado (50/50)" : "Cenário experimental — difere do HS oficial 50/50"}</span>
          <div class="presets hs-balance-presets">
            <button type="button" class="preset${engagement === 100 ? " active" : ""}" data-preset="100" title="100% E">100/0</button>
            <button type="button" class="preset${engagement === 75 ? " active" : ""}" data-preset="75">75/25</button>
            <button type="button" class="preset${engagement === 50 ? " active" : ""}" data-preset="50">50/50</button>
            <button type="button" class="preset${engagement === 25 ? " active" : ""}" data-preset="25">25/75</button>
            <button type="button" class="preset${engagement === 0 ? " active" : ""}" data-preset="0" title="100% M">0/100</button>
          </div>
        </div>
      </div>
    </section>`;
}

export function paintBalancePanel(root, { engagement, mechanism }) {
  if (!root) return;
  const official = isOfficialHsWeights({ engagement, mechanism });
  const formula = root.querySelector("#scoreFormula");
  const eng = root.querySelector("#engLabel");
  const mec = root.querySelector("#mecLabel");
  const slider = root.querySelector("#hsBalance");
  const track = root.querySelector(".hs-balance-track");
  const tag = root.querySelector(".alert-experimental-tag");
  if (formula) formula.textContent = formatWeightFormula(engagement, mechanism);
  if (eng) eng.textContent = `${engagement}%`;
  if (mec) mec.textContent = `${mechanism}%`;
  if (slider && document.activeElement !== slider) {
    slider.value = String(engagement);
    slider.setAttribute("aria-valuetext", `Engajamento ${engagement} por cento, Mecanismos ${mechanism} por cento`);
  }
  if (track) track.style.setProperty("--pos", String(engagement));
  if (tag) {
    tag.textContent = official
      ? "Oficial V1 documentado (50/50)"
      : "Cenário experimental — difere do HS oficial 50/50";
  }
  root.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.preset) === engagement);
  });
}

export function bindBalancePanel(root, { onEngagementChange }) {
  const slider = root.querySelector("#hsBalance");
  slider?.addEventListener("input", (event) => onEngagementChange(Number(event.target.value)));
  slider?.addEventListener("change", (event) => onEngagementChange(Number(event.target.value)));
  root.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => onEngagementChange(Number(button.dataset.preset)));
  });
}

export function globalWeightBadgeHtml({ engagement, mechanism }) {
  const off = isOfficialHsWeights({ engagement, mechanism });
  const prefix = off ? "Health Score" : "HS experimental";
  return `${prefix}: Engajamento ${engagement}% · Mecanismos ${mechanism}%`;
}
