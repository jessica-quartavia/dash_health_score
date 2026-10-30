import { buildQualityIndicators } from "../hs2a-diagnostics.mjs";
import { compareSnapshots } from "./snapshot-diff.mjs";

function pct(num, den) {
  return den ? Math.round((num / den) * 1000) / 10 : 0;
}

export function buildTrackingIndicators(clients, { denominatorLabel = "clientes no recorte" } = {}) {
  const base = buildQualityIndicators(clients, { denominatorLabel });
  const n = clients.length || 0;
  const withIssues = clients.filter((c) => (c.hs2a?.diagnostico || []).length > 0).length;
  return {
    ...base,
    indicadores: [
      ...base.indicadores,
      {
        id: "clientes_com_diagnosticos",
        numerador: withIssues,
        percentual: pct(withIssues, n),
        nota: "Ao menos um diagnóstico de qualidade no recorte",
      },
    ],
  };
}

export function segmentQualityBreakdown(clients, field = "program") {
  const groups = new Map();
  for (const c of clients) {
    const label = c[field === "engineer" ? "engineer" : "program"] || "—";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(c);
  }
  return [...groups.entries()]
    .map(([label, rows]) => {
      const n = rows.length;
      const hist = rows.filter((r) => r.hs2a?.qualidadeCodigo !== "historico_insuficiente").length;
      const mech = rows.filter((r) => r.hs2a?.coberturaMecanismos === "completa").length;
      const entrada = rows.filter((r) => r.hs2a?.entradaConfiavel).length;
      const inconsist = rows.filter((r) => r.hs2a?.perfilCodigo === "dados_inconsistentes").length;
      return {
        label,
        n,
        amostraPequena: n < 30,
        historico_suficiente: { numerador: hist, percentual: pct(hist, n) },
        mecanismos_confiaveis: { numerador: mech, percentual: pct(mech, n) },
        entrada_confiavel: { numerador: entrada, percentual: pct(entrada, n) },
        inconsistencias: { numerador: inconsist, percentual: pct(inconsist, n) },
        alertaComposicao: n < 30 ? "Amostra pequena — diferenças podem refletir composição da carteira" : null,
      };
    })
    .sort((a, b) => b.n - a.n);
}

export function enrichTemporalWithQuality(temporal, currentSnap, previousSnap) {
  if (!temporal?.comparable) return temporal;
  return {
    ...temporal,
    acompanhamento: {
      novos_problemas: temporal.mudancas?.inconsistencias_novas ?? 0,
      problemas_resolvidos: temporal.mudancas?.inconsistencias_resolvidas ?? 0,
      denominador_comparado: temporal.clientesComparados,
    },
  };
}
