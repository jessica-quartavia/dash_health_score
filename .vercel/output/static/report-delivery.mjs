/** Entrega de relatórios: download HTML + abertura para PDF (sem depender só de popup vazio). */

import { wrapReportDocument } from "../lib/frontend/executive-report-core.mjs";

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".html") ? filename : `${filename}.html`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "download";
}

export function deliverReport({ title, bodyHtml, filename = "health-analytics-relatorio" }) {
  if (!bodyHtml?.trim()) {
    return { ok: false, error: "Conteúdo do relatório vazio." };
  }
  const doc = wrapReportDocument(title, bodyHtml);
  const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
  let method = "download";
  try {
    triggerDownload(blob, filename);
  } catch {
    return { ok: false, error: "Não foi possível iniciar o download do relatório." };
  }
  try {
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) method = "download+preview";
    else method = "download";
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
  } catch {
    /* download alone is enough */
  }
  return { ok: true, method };
}
