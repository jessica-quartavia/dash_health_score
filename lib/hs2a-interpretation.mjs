/**
 * HS 2.0A — interpretação operacional (score V1 inalterado).
 * Alinhado à taxonomia da Etapa 7 (pesquisa).
 */
import { daysBetween, parseDate } from "./utils.mjs";
import { WEIGHTS, normalizeWeights } from "./scoring.mjs";

export const HS2A_VERSION = "hs2a-etapa8-v1";
export const OFFICIAL_FORMULA_VERSION = "hs-v1-50-50-operacional";

export const PROFILE_LABELS = {
  em_implantacao: "Em implantação",
  relacionamento_estabelecido: "Relacionamento estabelecido",
  baixa_atividade_observada: "Baixa atividade observada",
  historico_insuficiente: "Histórico insuficiente",
  mecanismos_nao_observaveis: "Mecanismos não observáveis",
  dados_inconsistentes: "Dados inconsistentes",
};

export const QUALITY_LABELS = {
  alta_confiabilidade: "Alta confiabilidade",
  confiabilidade_parcial: "Confiabilidade parcial",
  historico_insuficiente: "Histórico insuficiente",
};

function isMigrationCreatedAt(date) {
  if (!date) return false;
  return date.getUTCFullYear() === 2026 && date.getUTCMonth() === 1;
}

export function resolveContractualEntry(client) {
  const cycle = parseDate(client?.data_inicio_ciclo);
  const created = parseDate(client?.created_at);
  const mig = isMigrationCreatedAt(created);
  let date = cycle || null;
  let source = cycle ? "data_inicio_ciclo" : "unavailable";
  let confiavel = Boolean(cycle);
  if (!date && created && !mig) {
    date = created;
    source = "created_at";
    confiavel = true;
  }
  if (!date && created && mig) {
    source = "created_at_migracao";
    confiavel = false;
  }
  return { date, source, confiavel, migrationBatch: mig && !cycle };
}

export function mechanismCoverage({ mechanismLinked = false, inProgress = 0, implemented = 0 } = {}) {
  if (!mechanismLinked) return "sem_vinculo";
  if (inProgress > 0 && implemented === 0) return "parcial";
  return "completa";
}

export function reconstructionReliability(finalClass, engagementScore, mechanismScore) {
  if (finalClass === "Sem registro") return "nao_reconstruivel";
  if (engagementScore == null || mechanismScore == null) return "nao_reconstruivel";
  return "integral";
}

export function classifyInformationQuality(row) {
  const q = row.hs2a?.qualidadeCodigo;
  if (q) return q;
  const cls = row.finalClass;
  const reun = row.totalMeetings || 0;
  const covM = row.hs2a?.coberturaMecanismos || "completa";
  const recon = row.hs2a?.confiabilidadeReconstrucao || reconstructionReliability(cls, row.engagementScore, row.mechanismScore);
  if (recon === "nao_reconstruivel") return "historico_insuficiente";
  if (row.hs2a?.confiabilidadeEntrada === "baixa_migracao_ou_ausente") return "confiabilidade_parcial";
  if (covM === "sem_vinculo" && cls !== "Em implantação") return "confiabilidade_parcial";
  if (reun === 0 && cls !== "Em implantação") return "confiabilidade_parcial";
  return "alta_confiabilidade";
}

export function primaryRelationshipProfile(ctx) {
  const {
    finalClass,
    totalMeetings = 0,
    engagementScore = 0,
    coberturaMecanismos = "completa",
    confiabilidadeReconstrucao = "integral",
    confiabilidadeEntrada = "alta",
  } = ctx;

  if (["baixa_migracao_ou_ausente", "inconsistente"].includes(confiabilidadeEntrada)) {
    return "dados_inconsistentes";
  }
  if (confiabilidadeReconstrucao === "nao_reconstruivel") return "historico_insuficiente";
  if (finalClass === "Em implantação") return "em_implantacao";
  if (coberturaMecanismos === "sem_vinculo") return "mecanismos_nao_observaveis";
  if (totalMeetings >= 1 && engagementScore <= 20) return "baixa_atividade_observada";
  if (totalMeetings >= 3 || engagementScore > 40) return "relacionamento_estabelecido";
  if (totalMeetings < 2) return "historico_insuficiente";
  return "relacionamento_estabelecido";
}

export function secondaryTags(ctx) {
  const tags = [];
  if ((ctx.avgMeetingsPerMonth || 0) >= 1 || (ctx.reunioes30d || 0) >= 1) tags.push("alta_atividade");
  if (ctx.totalMeetings === 0 && ctx.finalClass !== "Em implantação") tags.push("sem_reuniao_pos_implantacao");
  return tags;
}

export function explainHsFactors(row) {
  const factors = [];
  const hs = row.healthScore;
  const e = row.engagementScore;
  const m = row.mechanismScore;
  if (row.finalClass === "Em implantação") {
    factors.push({ id: "implantacao", label: "Cliente em implantação (carência / histórico curto)", impact: "contexto" });
  }
  if (e <= 20) factors.push({ id: "e_baixo", label: `Engajamento baixo (E=${Math.round(e)})`, impact: "score" });
  else if (e <= 60) factors.push({ id: "e_medio", label: `Engajamento moderado (E=${Math.round(e)})`, impact: "score" });
  if (m <= 20) factors.push({ id: "m_baixo", label: `Poucos mecanismos implantados (M=${Math.round(m)})`, impact: "score" });
  if ((row.totalMeetings || 0) === 0 && row.finalClass !== "Em implantação") {
    factors.push({ id: "sem_reuniao", label: "Nenhuma reunião observada no histórico", impact: "cobertura" });
  }
  if (row.hs2a?.coberturaMecanismos === "sem_vinculo") {
    factors.push({ id: "sem_vinculo_m", label: "Sem vínculo de mecanismos no cadastro", impact: "cobertura" });
  }
  if (!row.hs2a?.entradaConfiavel) {
    factors.push({ id: "entrada", label: "Tempo de relacionamento incerto (possível migração cadastral)", impact: "limitacao" });
  }
  if (hs != null && hs <= 20 && factors.every((f) => f.impact !== "score")) {
    factors.push({ id: "hs_baixo_misto", label: "HS baixo com composição mista (ver E, M e contexto)", impact: "interpretacao" });
  }
  return factors;
}

export function humanVerificationHints(row) {
  const hints = [];
  if (row.hs2a?.perfilCodigo === "dados_inconsistentes") hints.push("Validar datas de entrada e ciclo no cadastro.");
  if (row.hs2a?.coberturaMecanismos === "sem_vinculo") hints.push("Confirmar se mecanismos deveriam estar vinculados.");
  if (row.hs2a?.perfilCodigo === "baixa_atividade_observada") hints.push("Verificar engajamento recente — perfil descritivo, não predição de churn.");
  if ((row.totalMeetings || 0) === 0 && row.finalClass !== "Em implantação") {
    hints.push("Ausência de reuniões: distinguir desengajamento de lacuna de registro.");
  }
  return hints;
}

export function enrichClientWithHs2a(row, { client, mechanismLinked = true, reunioes30d = 0, weights = WEIGHTS } = {}) {
  const entry = resolveContractualEntry(client);
  const now = new Date();
  const diasRelacionamento = entry.date ? Math.max(0, daysBetween(entry.date, now)) : null;
  const cycleDate = parseDate(client?.data_inicio_ciclo);
  const diasCiclo = cycleDate ? Math.max(0, daysBetween(cycleDate, now)) : null;
  const covM = mechanismCoverage({
    mechanismLinked,
    inProgress: row.inProgressCount || 0,
    implemented: row.implementedCount || 0,
  });
  const recon = reconstructionReliability(row.finalClass, row.engagementScore, row.mechanismScore);
  const confEntrada = !entry.confiavel ? "baixa_migracao_ou_ausente" : entry.date ? "alta" : "indisponivel";

  const ctx = {
    finalClass: row.finalClass,
    totalMeetings: row.totalMeetings || 0,
    engagementScore: row.engagementScore,
    coberturaMecanismos: covM,
    confiabilidadeReconstrucao: recon,
    confiabilidadeEntrada: confEntrada,
    avgMeetingsPerMonth: row.avgMeetingsPerMonth,
    reunioes30d,
  };

  const perfilCodigo = primaryRelationshipProfile(ctx);
  const tags = secondaryTags({ ...ctx, finalClass: row.finalClass });
  const activeWeights = normalizeWeights(weights);
  let qualidadeCodigo = "alta_confiabilidade";
  if (recon === "nao_reconstruivel") qualidadeCodigo = "historico_insuficiente";
  else if (confEntrada === "baixa_migracao_ou_ausente") qualidadeCodigo = "confiabilidade_parcial";
  else if (covM === "sem_vinculo" && row.finalClass !== "Em implantação") qualidadeCodigo = "confiabilidade_parcial";
  else if ((row.totalMeetings || 0) === 0 && row.finalClass !== "Em implantação") qualidadeCodigo = "confiabilidade_parcial";

  const hs2a = {
    version: HS2A_VERSION,
    hsScore: row.healthScore,
    formulaOficial: OFFICIAL_FORMULA_VERSION,
    formulaAplicada: activeWeights.formula,
    faseRelacionamento: row.finalClass === "Em implantação" ? "implantacao" : "pos_implantacao",
    faseLabel: row.finalClass === "Em implantação" ? "Em implantação" : "Relacionamento em curso",
    qualidadeCodigo,
    qualidadeLabel: QUALITY_LABELS[qualidadeCodigo] || qualidadeCodigo,
    perfilCodigo,
    perfilLabel: PROFILE_LABELS[perfilCodigo] || perfilCodigo,
    tagsSecundarias: tags,
    coberturaReunioes: (row.totalMeetings || 0) > 0 ? "com_reunioes" : "sem_reunioes_observadas",
    coberturaMecanismos: covM,
    confiabilidadeReconstrucao: recon,
    confiabilidadeEntrada: confEntrada,
    entradaConfiavel: entry.confiavel,
    diasRelacionamento: diasRelacionamento,
    diasCicloAtual: diasCiclo,
    entradaSource: entry.source,
    fatores: explainHsFactors({ ...row, hs2a: { coberturaMecanismos: covM, entradaConfiavel: entry.confiavel, perfilCodigo } }),
    verificacaoHumana: [],
    nota: "Interpretação 2.0A — não substitui HS V1 nem indica risco preditivo.",
  };
  hs2a.verificacaoHumana = humanVerificationHints({ ...row, hs2a });

  return { ...row, hs2a };
}

export function hsBand(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return "indisponivel";
  if (s <= 20) return "0-20";
  if (s <= 40) return "20-40";
  if (s <= 60) return "40-60";
  if (s <= 80) return "60-80";
  return "80-100";
}
