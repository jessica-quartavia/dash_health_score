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
  @page { size: A4; margin: 16mm 14mm; }
  body { font-family: Inter, system-ui, sans-serif; color: #1e293b; font-size: 10.5pt; line-height: 1.5; max-width: 210mm; margin: 0 auto; padding: 0; }
  h1 { font-size: 21pt; color: #0f172a; margin: 0 0 10px; letter-spacing: -0.02em; }
  h2 { font-size: 13pt; margin: 22px 0 8px; border-bottom: 2px solid #e85d3a; padding-bottom: 4px; page-break-after: avoid; }
  .cover { min-height: 55vh; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.08em; font-size: 9pt; color: #64748b; }
  .meta { color: #64748b; font-size: 10pt; }
  .note { font-size: 9.5pt; color: #64748b; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0 16px; font-size: 9pt; page-break-inside: avoid; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
  th { background: #f8fafc; font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  ul { padding-left: 18px; }
  .footer { margin-top: 28px; font-size: 9pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  .formula-block { background: #f8fafc; border-left: 3px solid #e85d3a; padding: 10px 14px; margin: 12px 0; font-size: 11pt; }
  .tag-experimental-cover { display: inline-block; margin-top: 12px; padding: 6px 12px; background: #f5f3ff; border: 1px solid #c4b5fd; border-radius: 999px; font-size: 9pt; color: #5b4bb4; }
  .toc { font-size: 9.5pt; margin-bottom: 20px; padding: 12px; background: #fafafa; border-radius: 8px; }
  .toc ol { margin: 8px 0 0; padding-left: 20px; }
  @media print { .no-print { display: none !important; } thead { display: table-header-group; } tr { page-break-inside: avoid; } h2 { page-break-before: auto; } }
`;

export function wrapReportDocument(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>${escHtml(title)}</title><style>${REPORT_PRINT_CSS}</style></head><body>
${bodyHtml}
<section class="no-print" style="margin-top:32px;padding:16px;background:#f8fafc;border-radius:8px;">
  <p><strong>Salvar como PDF:</strong> use Imprimir → Destino “Salvar como PDF” (Chrome/Edge).</p>
  <button type="button" onclick="window.print()" style="padding:10px 16px;background:#e85d3a;color:#fff;border:0;border-radius:8px;cursor:pointer;font-size:14px;">Imprimir / Salvar PDF</button>
</section>
</body></html>`;
}
