/**
 * HTML de relatórios executivos (testável, sem DOM).
 */
export { buildPredictiveExecutiveReportHtml } from "./predictive-report-html.mjs";

export function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export const REPORT_PRINT_CSS = `
  @import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,600&display=swap");
  :root {
    --report-navy: #0f2744;
    --report-graphite: #334155;
    --report-coral: #e85d3a;
    --report-coral-soft: #fff4f0;
    --report-bg: #faf9f7;
    --report-line: #e2e8f0;
    --report-muted: #64748b;
  }
  @page {
    size: A4;
    margin: 18mm 16mm 22mm 16mm;
  }
  * { box-sizing: border-box; }
  body {
    font-family: Inter, system-ui, sans-serif;
    color: var(--report-graphite);
    font-size: 10.5pt;
    line-height: 1.55;
    max-width: 210mm;
    margin: 0 auto;
    padding: 0 4mm 12mm;
    background: var(--report-bg);
  }
  h1 {
    font-family: "Source Serif 4", Georgia, serif;
    font-size: 26pt;
    color: var(--report-navy);
    margin: 0 0 12px;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }
  h2 {
    font-family: "Source Serif 4", Georgia, serif;
    font-size: 14pt;
    color: var(--report-navy);
    margin: 0 0 12px;
    padding-bottom: 6px;
    border-bottom: 2px solid var(--report-coral);
    page-break-after: avoid;
  }
  h3 { font-size: 11pt; color: var(--report-navy); margin: 16px 0 8px; page-break-after: avoid; }
  h4 { font-size: 10pt; margin: 12px 0 6px; color: var(--report-graphite); }
  p { margin: 0 0 10px; }
  ul, ol { margin: 0 0 12px; padding-left: 20px; }
  li { margin-bottom: 4px; }
  .cover {
    min-height: 70vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 24px 0 40px;
  }
  .cover-sub { font-size: 13pt; color: var(--report-muted); margin-bottom: 16px; }
  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 9pt;
    font-weight: 600;
    color: var(--report-coral);
    margin-bottom: 8px;
  }
  .meta, .note { font-size: 9.5pt; color: var(--report-muted); }
  .version-line { font-size: 8.5pt; line-height: 1.45; }
  .tag-experimental-cover {
    display: inline-block;
    margin-top: 20px;
    padding: 8px 14px;
    background: var(--report-coral-soft);
    border: 1px solid #fecaca;
    border-radius: 8px;
    font-size: 9pt;
    color: #9a3412;
    max-width: 42em;
  }
  .report-running-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 8pt;
    color: var(--report-muted);
    border-bottom: 1px solid var(--report-line);
    padding: 8px 0 10px;
    margin-bottom: 8px;
  }
  .report-running-header .brand { font-weight: 600; color: var(--report-navy); }
  .toc {
    background: #fff;
    border: 1px solid var(--report-line);
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 24px;
  }
  .toc-title { font-weight: 600; margin: 0 0 8px; color: var(--report-navy); }
  .toc ol { margin: 0; }
  .report-section { margin-bottom: 8px; }
  .page-break-before { page-break-before: always; }
  .page-break-after { page-break-after: always; }
  .callout {
    background: #fff;
    border-left: 4px solid var(--report-coral);
    padding: 12px 16px;
    margin: 14px 0;
    border-radius: 0 8px 8px 0;
    box-shadow: 0 1px 2px rgba(15, 39, 68, 0.06);
  }
  .callout-primary { border-left-color: var(--report-navy); background: #f0f4f8; }
  .callout-warn { border-left-color: #d97706; background: #fffbeb; }
  .formula-block {
    background: #fff;
    border: 1px solid var(--report-line);
    border-radius: 8px;
    padding: 14px 18px;
    margin: 14px 0;
    font-size: 11pt;
    text-align: center;
  }
  .kpi-cards {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin: 16px 0;
  }
  .kpi-card {
    background: #fff;
    border: 1px solid var(--report-line);
    border-radius: 10px;
    padding: 12px 14px;
    page-break-inside: avoid;
  }
  .kpi-label { display: block; font-size: 8.5pt; color: var(--report-muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .kpi-value { display: block; font-size: 14pt; font-weight: 700; color: var(--report-navy); margin: 4px 0; }
  .kpi-hint { display: block; font-size: 8pt; color: var(--report-muted); }
  .results-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    margin: 14px 0;
  }
  .result-card {
    background: #fff;
    border: 1px solid var(--report-line);
    border-radius: 10px;
    padding: 14px 16px;
    page-break-inside: avoid;
  }
  .result-meta { font-size: 9pt; color: var(--report-muted); margin-bottom: 8px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 16px;
    font-size: 9pt;
    page-break-inside: avoid;
    background: #fff;
  }
  th, td { border: 1px solid var(--report-line); padding: 7px 10px; text-align: left; vertical-align: top; }
  th { background: #f1f5f9; font-weight: 600; color: var(--report-navy); }
  .table-compact th, .table-compact td { padding: 5px 8px; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .appendix { background: #fff; padding: 8px 12px 24px; border-radius: 12px; border: 1px solid var(--report-line); }
  .report-footer {
    margin-top: 28px;
    padding-top: 12px;
    border-top: 2px solid var(--report-line);
    font-size: 9pt;
    color: var(--report-muted);
  }
  code { font-size: 0.92em; background: #f1f5f9; padding: 1px 4px; border-radius: 4px; }
  @media print {
    body { background: #fff; padding: 0; }
    .no-print { display: none !important; }
    .report-running-header { position: fixed; top: 0; left: 0; right: 0; background: #fff; }
    thead { display: table-header-group; }
    tr, .kpi-card, .result-card, .callout { page-break-inside: avoid; }
    h2 { page-break-after: avoid; }
    .cover { page-break-after: always; }
  }
  @media (max-width: 640px) {
    .kpi-cards, .results-grid, .two-col { grid-template-columns: 1fr; }
  }
`;

export function wrapReportDocument(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escHtml(title)}</title><style>${REPORT_PRINT_CSS}</style></head><body>
${bodyHtml}
<section class="no-print" style="margin-top:32px;padding:20px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;">
  <p><strong>Exportar PDF:</strong> Imprimir → Destino “Salvar como PDF” (Chrome/Edge). Margens: padrão ou mínimas.</p>
  <button type="button" onclick="window.print()" style="padding:10px 18px;background:#e85d3a;color:#fff;border:0;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">Imprimir / Salvar PDF</button>
</section>
</body></html>`;
}
