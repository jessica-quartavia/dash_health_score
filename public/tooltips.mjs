/** Textos curtos de ajuda contextual (dado atual vs pesquisa vs experimental). */

export const TOOLTIPS = {
  hs_medio: "Média do Health Score V1 no recorte. Recalcula com os pesos E/M da barra experimental. Não é probabilidade de churn.",
  hs_faixa: "Classificação operacional: ≥70 Saudável, ≥20 Atenção, abaixo Crítico, mais regras de implantação e sem registro.",
  engajamento: "Nota E (0–100) a partir da média mensal de reuniões válidas no ciclo. Dado atual da BASE QV.",
  mecanismos: "Nota M (0–100) por quantidade implantada. Em andamento não pontua. Dado atual.",
  qualidade_info: "Confiabilidade cadastral e de histórico — separada do HS numérico e do risco de churn.",
  perfil_2a: "Perfil interpretativo HS 2.0A. Mesmo score V1 + contexto. Experimental, não risco automático.",
  historico_suficiente: "Cliente com reuniões/mecanismos suficientes para calcular E e M com confiança.",
  mecanismos_confiaveis: "Vínculo e status dos mecanismos permitem contagem confiável de M.",
  entrada_contratual: "Data de entrada preferencialmente do ciclo contratual, não só created_at migrado.",
  churn_pesquisa: "Episódios consolidados no dataset validado (pesquisa). Não misturar com snapshot operacional.",
  roc_auc: "Capacidade de ranquear positivos vs negativos no teste hold-out. Pesquisa congelada — não recalcula ao filtrar.",
  pr_auc: "Útil com churn raro. Mesmo experimento histórico; não usar operacionalmente.",
  snapshot: "Foto pseudonimizada local do pipeline. Ausência não indica falha na BASE QV.",
  automacao: "Estado declarado do cron/pipeline. Persistência central pode estar pendente.",
};

export function tipIcon(key) {
  const text = TOOLTIPS[key];
  if (!text) return "";
  return `<button type="button" class="tip-trigger" aria-label="Ajuda" data-tip="${encodeURIComponent(text)}">?</button>`;
}

export function bindTipTriggers(root = document) {
  root.querySelectorAll(".tip-trigger").forEach((btn) => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = "1";
    const text = decodeURIComponent(btn.dataset.tip || "");
    btn.title = text;
  });
}
