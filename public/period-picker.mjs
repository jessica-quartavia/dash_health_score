import {
  PERIOD_PRESETS,
  resolvePresetRange,
  formatPeriodLabel,
  inferPreset,
} from "./period-utils.mjs";

export function mountPeriodPicker({ root, fromInput, toInput, onApply, getFilters, setFilters }) {
  if (!root || !fromInput || !toInput) return null;

  let fp = null;
  let open = false;

  const displayBtn = document.createElement("button");
  displayBtn.type = "button";
  displayBtn.className = "period-display";
  displayBtn.setAttribute("aria-haspopup", "dialog");
  displayBtn.setAttribute("aria-expanded", "false");

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "btn ghost period-clear";
  clearBtn.textContent = "Limpar";

  const panel = document.createElement("div");
  panel.className = "period-panel hidden";
  panel.setAttribute("role", "dialog");
  panel.innerHTML = `
    <p class="period-panel-title">Selecione o intervalo</p>
    <div class="period-presets" role="listbox"></div>
    <div class="period-cal-wrap">
      <input type="text" class="period-cal-input" aria-label="Calendário de intervalo" readonly />
    </div>
  `;

  root.classList.add("period-control");
  root.append(displayBtn, clearBtn, panel);

  const presetsNode = panel.querySelector(".period-presets");
  const calInput = panel.querySelector(".period-cal-input");

  function paintDisplay() {
    const { from, to } = getFilters();
    displayBtn.textContent = formatPeriodLabel(from, to);
    fromInput.value = from || "";
    toInput.value = to || "";
    const activePreset = inferPreset(from, to);
    presetsNode.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.preset === activePreset);
    });
  }

  function closePanel() {
    open = false;
    panel.classList.add("hidden");
    displayBtn.setAttribute("aria-expanded", "false");
  }

  function openPanel(focusCustom = false) {
    open = true;
    panel.classList.remove("hidden");
    displayBtn.setAttribute("aria-expanded", "true");
    const { from, to } = getFilters();
    if (fp) {
      if (from && to) fp.setDate([from, to], false);
      else if (from) fp.setDate([from], false);
      else fp.clear(false);
      if (focusCustom) {
        presetsNode.querySelector('[data-preset="custom"]')?.classList.add("active");
      }
    }
  }

  function applyRange(from, to, preset = "custom") {
    setFilters({ from: from || "", to: to || "" });
    paintDisplay();
    if (preset !== "custom-open") closePanel();
    onApply();
  }

  PERIOD_PRESETS.forEach((preset) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "period-preset";
    btn.dataset.preset = preset.id;
    btn.textContent = preset.label;
    btn.addEventListener("click", () => {
      if (preset.id === "custom") {
        openPanel(true);
        return;
      }
      const range = resolvePresetRange(preset.id);
      applyRange(range.from, range.to, preset.id);
    });
    presetsNode.append(btn);
  });

  displayBtn.addEventListener("click", () => (open ? closePanel() : openPanel()));
  clearBtn.addEventListener("click", () => applyRange("", "", "all"));

  document.addEventListener("click", (event) => {
    if (!open) return;
    if (root.contains(event.target)) return;
    closePanel();
  });

  if (typeof flatpickr === "function") {
    fp = flatpickr(calInput, {
      inline: true,
      mode: "range",
      locale: flatpickr.l10ns?.pt || "default",
      dateFormat: "Y-m-d",
      allowInput: false,
      static: true,
      onChange(selectedDates) {
        if (selectedDates.length === 2) {
          const from = fp.formatDate(selectedDates[0], "Y-m-d");
          const to = fp.formatDate(selectedDates[1], "Y-m-d");
          applyRange(from, to, "custom");
        }
      },
    });
  } else {
    calInput.placeholder = "Calendário indisponível (Flatpickr)";
  }

  paintDisplay();

  return {
    refresh: paintDisplay,
    destroy() {
      fp?.destroy();
      root.replaceChildren();
    },
  };
}
