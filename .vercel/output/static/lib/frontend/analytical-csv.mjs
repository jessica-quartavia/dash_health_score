import { ANALYTICAL_COLUMNS, resolveAnalyticalCell } from "../../public/analytical-columns.mjs";

function esc(v) {
  const s = String(v ?? "");
  return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV da Base Analítica — colunas visíveis, mesmos helpers do painel. */
export function analyticalRowsToCsv(rows, columnIds, helpers) {
  const cols = ANALYTICAL_COLUMNS.filter((c) => columnIds.includes(c.id));
  const header = cols.map((c) => c.label);
  const lines = [header.map(esc).join(",")];
  for (const row of rows) {
    const cells = cols.map((c) => {
      if (c.id === "healthScore") return row.healthScore ?? "";
      const v = resolveAnalyticalCell(row, c.id, helpers);
      if (v === "—") return "";
      return v;
    });
    lines.push(cells.map(esc).join(","));
  }
  return `${lines.join("\n")}\n`;
}
