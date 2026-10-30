/** Renderiza faixa de status dinâmico no topo do workspace. */

import { authHeaders } from "./session-auth.mjs";

export async function loadSystemStatus() {
  try {
    const res = await fetch("/api/system-status", { headers: authHeaders() });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function renderSystemBanners(status) {
  if (!status?.items?.length) return "";
  const max = 4;
  return `<div class="system-banners" role="status">${status.items
    .slice(0, max)
    .map(
      (item) =>
        `<div class="system-banner system-banner--${item.level}"><strong>${escape(item.title)}</strong><span>${escape(item.detail)}</span></div>`,
    )
    .join("")}</div>`;
}

function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function mountSystemBanners(slot, status) {
  if (!slot) return;
  if (!status?.items?.length) {
    slot.innerHTML = "";
    slot.hidden = true;
    return;
  }
  slot.hidden = false;
  slot.innerHTML = renderSystemBanners(status);
}
