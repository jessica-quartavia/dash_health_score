/** Textos curtos de ajuda contextual (linguagem leiga). */

export const TOOLTIPS = {
  hs_medio:
    "Health Score (0–100): média ponderada de Engajamento (E) e Mecanismos (M) no recorte. Com a barra experimental, os pesos mudam e o HS recalcula na hora. Não é chance de cancelar.",
  hs_formula: "Fórmula: HS = (peso de E × E) + (peso de M × M). Pesos somam 100%. No estudo histórico usamos 50/50 documentado.",
  hs_faixa:
    "Classificação do dia a dia: Saudável (score alto), Atenção, Crítico, além de regras como Em implantação e Sem registro.",
  engajamento:
    "Nota E (0–100) a partir da média mensal de reuniões válidas no histórico do cliente. Quanto mais cadência saudável, maior tende a ser E.",
  mecanismos:
    "Nota M (0–100) pela quantidade de mecanismos implantados. Itens só em andamento não entram na conta.",
  qualidade_info:
    "Quão confiável é o cadastro e o histórico (datas, vínculos). Separado do número do HS e de qualquer modelo de churn.",
  perfil_2a:
    "Perfil interpretativo HS 2.0A: mesmo score V1 com contexto de fase e histórico. Ajuda na conversa com o cliente — não dispara alerta automático.",
  historico_suficiente:
    "Há reuniões e/ou mecanismos suficientes para calcular E e M com segurança — não é 'Sem registro'.",
  mecanismos_confiaveis: "Os mecanismos do cliente estão vinculados de forma que a contagem de M é confiável.",
  entrada_contratual: "Preferimos a data do ciclo contratual em vez de apenas a data de criação do registro.",
  churn_pesquisa:
    "Churn no estudo: cancelamentos consolidados em datasets históricos (episódios). Diferente do status 'de hoje' no painel operacional.",
  elegiveis_90d:
    "Clientes com tempo suficiente no estudo para saber se cancelaram dentro de 90 dias após a data de referência.",
  censura:
    "Casos em que ainda não deu para observar o desfecho (ex.: cliente recente): entram no estudo mas não contam como churn confirmado na janela.",
  desfecho_90d: "Desfecho = o que medimos depois de 90 dias: cancelou ou não dentro desse prazo, no passado analisado.",
  roc_auc:
    "Mede quão bem o modelo separa quem cancelou de quem não cancelou no teste hold-out. Quanto mais perto de 1, melhor o ranqueamento — ainda assim é experimento histórico.",
  pr_auc:
    "Útil quando churn é raro: foca em acertar os positivos. Complementa o ROC-AUC; não usar para decisão operacional.",
  snapshot: "Foto pseudonimizada gerada pelo pipeline local. Se faltar, o painel ainda pode usar a BASE QV ao vivo.",
  automacao: "Estado declarado da rotina mensual (GitHub Actions / pipeline).",
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
