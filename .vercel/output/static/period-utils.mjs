export function formatIsoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1);
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export const PERIOD_PRESETS = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "90d", label: "Últimos 90 dias" },
  { id: "6m", label: "Últimos 6 meses" },
  { id: "12m", label: "Últimos 12 meses" },
  { id: "month", label: "Este mês" },
  { id: "year", label: "Este ano" },
  { id: "all", label: "Todo o período" },
  { id: "custom", label: "Personalizado" },
];

export function resolvePresetRange(presetId, now = new Date()) {
  const today = formatIsoDate(now);
  switch (presetId) {
    case "today":
      return { from: today, to: today, preset: presetId };
    case "7d":
      return { from: formatIsoDate(addDays(now, -6)), to: today, preset: presetId };
    case "30d":
      return { from: formatIsoDate(addDays(now, -29)), to: today, preset: presetId };
    case "90d":
      return { from: formatIsoDate(addDays(now, -89)), to: today, preset: presetId };
    case "6m":
      return { from: formatIsoDate(addDays(now, -183)), to: today, preset: presetId };
    case "12m":
      return { from: formatIsoDate(addDays(now, -364)), to: today, preset: presetId };
    case "month":
      return { from: formatIsoDate(startOfMonth(now)), to: today, preset: presetId };
    case "year":
      return { from: formatIsoDate(startOfYear(now)), to: today, preset: presetId };
    case "all":
      return { from: "", to: "", preset: presetId };
    default:
      return { from: "", to: "", preset: "custom" };
  }
}

export function formatPeriodLabel(from, to) {
  if (!from && !to) return "Todo o período";
  if (from && to) return `${from} → ${to}`;
  if (from) return `A partir de ${from}`;
  return `Até ${to}`;
}

export function inferPreset(from, to) {
  for (const preset of PERIOD_PRESETS) {
    if (preset.id === "custom" || preset.id === "all") continue;
    const r = resolvePresetRange(preset.id);
    if (r.from === from && r.to === to) return preset.id;
  }
  if (!from && !to) return "all";
  return "custom";
}
