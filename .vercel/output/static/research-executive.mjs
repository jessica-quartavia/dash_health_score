/** Textos e conclusões automáticas — linguagem executiva (Laboratório Preditivo). */

import { finiteNumber } from "../lib/frontend/display-format.mjs";

export const EXECUTIVE_INTRO =
  "Este estudo analisa se sinais históricos de relacionamento, como Engajamento (E), Mecanismos (M) e o Health Score (HS), ajudam a identificar clientes que cancelaram nos 90 dias seguintes. É uma análise de pesquisa, não um modelo operacional em produção.";

export function executiveChips(horizonDays = 90) {
  return [
    { label: "Alvo", value: "Churn / cancelamento" },
    { label: "Horizonte", value: `${horizonDays} dias` },
    { label: "Base", value: "Histórico validado" },
    { label: "Uso", value: "Pesquisa" },
    { label: "Status", value: "Experimental · não operacional", tone: "warn" },
  ];
}

function topBand(bands) {
  const valid = (bands || []).filter(
    (b) => b.band !== "insuficiente" && finiteNumber(b.churnRate) != null && (b.n || 0) > 0,
  );
  if (!valid.length) return null;
  return [...valid].sort((a, b) => (b.churnRate || 0) - (a.churnRate || 0))[0];
}

function bottomBand(bands) {
  const valid = (bands || []).filter(
    (b) => b.band !== "insuficiente" && finiteNumber(b.churnRate) != null && (b.n || 0) > 0,
  );
  if (!valid.length) return null;
  return [...valid].sort((a, b) => (a.churnRate || 0) - (b.churnRate || 0))[0];
}

export function insightHsBands(bands) {
  const hi = topBand(bands);
  const lo = bottomBand(bands);
  if (!hi || !lo) return "Ainda não há faixas suficientes para comparar churn observado por HS neste recorte.";
  if (hi.band === lo.band) return "As faixas de HS disponíveis concentram taxas similares — ampliar recorte ou revisar cobertura.";
  return `Faixas mais baixas de HS (ex.: ${hi.band}) concentraram maior churn observado que faixas altas (ex.: ${lo.band}). Parte desse efeito pode refletir menos histórico ou cobertura incompleta de mecanismos, não só “má saúde”.`;
}

export function insightSimpleBands(bands, pillar) {
  const hi = topBand(bands);
  const lo = bottomBand(bands);
  const name = pillar === "E" ? "engajamento" : "mecanismos";
  if (!hi || !lo) return `Sem dados suficientes para concluir sobre ${name} neste recorte.`;
  return `Menor ${name} (${hi.band}) associou-se a maior churn observado; faixas mais altas (${lo.band}) tendem a taxas menores no passado analisado.`;
}

export function insightProfiles(profiles) {
  const list = (profiles || []).filter((p) => finiteNumber(p.churnRate) != null);
  if (!list.length) return "Perfis exploratórios indisponíveis neste ambiente.";
  const top = [...list].sort((a, b) => (b.churnRate || 0) - (a.churnRate || 0))[0];
  const id = String(top.id || "").replace(/_/g, " ");
  return `O perfil “${id}” apresentou a maior taxa observada de churn no recorte histórico — útil para hipóteses, não para rotular clientes hoje.`;
}

export function insightModels(models) {
  const ranked = (models || []).filter((m) => finiteNumber(m.rocAuc) != null);
  if (!ranked.length) return "Comparação de modelos A–E indisponível — artefatos de modelagem ausentes.";
  const best = [...ranked].sort((a, b) => (b.rocAuc || 0) - (a.rocAuc || 0))[0];
  return `Entre os modelos exploratórios congelados, ${best.id} (${best.label || "—"}) teve melhor discriminação no hold-out de teste. Isso não autoriza uso operacional individual.`;
}

export function buildExecutiveConclusion(panorama) {
  const k = panorama?.kpis || {};
  const rate = finiteNumber(k.observedChurnRate90d);
  const pct = rate != null ? `${(rate * 100).toFixed(1).replace(".", ",")}%` : "—";
  const ref = k.referenceModelId || "E";
  const nLab = k.observationsLabeled90d;
  if (nLab == null) {
    return "Os agregados históricos ainda não estão disponíveis neste ambiente. O painel operacional de HS continua independente.";
  }
  return `No histórico validado (pre_audit, ${nLab.toLocaleString("pt-BR")} observações rotuladas 90d), cerca de ${pct} das linhas cliente-mês tiveram churn observado — taxa descritiva, não previsão individual. O Modelo ${ref} permanece referência experimental congelada; alternativas testadas nas Etapas 15/16 não substituem esse baseline para uso em produção.`;
}

export const LIMITATIONS_PLAIN = [
  "Não publicamos probabilidade individual de churn por cliente.",
  "Não é um modelo em produção — o time continua usando o Health Score operacional de hoje.",
  "HS baixo no histórico pode significar falta de reuniões ou de mecanismos registrados, não necessariamente risco iminente.",
  "Previsão validada de HS futuro por cliente ainda não existe — ver aba HS futuro.",
];
