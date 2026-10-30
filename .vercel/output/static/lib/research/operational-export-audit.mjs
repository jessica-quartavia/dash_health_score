/**
 * Auditoria do snapshot operacional (exports) — não substitui painel temporal PIT.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function countCsvRows(path, sep = ";") {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  return Math.max(0, lines.length - 1);
}

function countNpsClients(npsPath) {
  if (!existsSync(npsPath)) return null;
  const text = readFileSync(npsPath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return 0;
  const header = lines[0].split(";");
  const refIdx = header.findIndex((h) => /cliente_ref|cliente/i.test(h));
  const scoreIdx = header.findIndex((h) => /nps|score|nota/i.test(h));
  const refs = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";");
    const ref = refIdx >= 0 ? cols[refIdx] : cols[0];
    const score = scoreIdx >= 0 ? cols[scoreIdx] : cols[1];
    if (ref && score && String(score).trim() !== "") refs.add(ref);
  }
  return refs.size;
}

export function auditOperationalExport(root) {
  const exp = join(root, "exports", "predictive-study");
  const snap = join(exp, "clientes_cadastro_snapshot.csv");
  const total = countCsvRows(snap);
  let ativos = null;
  if (existsSync(snap)) {
    const lines = readFileSync(snap, "utf8").split(/\r?\n/).filter((l) => l.trim());
    if (lines.length > 1) {
      ativos = 0;
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(";");
        const churn = cols[5] ?? "";
        if (!String(churn).trim()) ativos += 1;
      }
    }
  }
  const npsClients = countNpsClients(join(exp, "nps_historico.csv"));
  return {
    snapshotFile: "exports/predictive-study/clientes_cadastro_snapshot.csv",
    clientsInSnapshot: total,
    activeProxyNoChurnDate: ativos,
    clientsWithNpsHistory: npsClients,
    note:
      "Snapshot operacional (~30/10/2026) para cobertura — treino preditivo usa dataset_preditivo_validado.csv point-in-time.",
    pitSourcesPresent: {
      nps_historico: existsSync(join(exp, "nps_historico.csv")),
      suporte_historico: existsSync(join(exp, "suporte_historico.csv")),
      renovacoes: existsSync(join(exp, "renovacoes_eventos.csv")),
    },
  };
}
