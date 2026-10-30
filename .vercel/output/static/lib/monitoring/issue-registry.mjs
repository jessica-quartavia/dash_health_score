/**
 * Registro gerencial de inconsistências — prioridade de dados, não risco de churn.
 */
import { stableClientRef } from "./snapshot-store.mjs";

const DEFAULT_META = {
  categoria: "cadastro",
  fonte: "clients",
  campo: "—",
  prioridade: "media",
  causaProvavel: "Revisar cadastro ou vínculos na origem",
  acaoRecomendada: "Validar com time responsável pela BASE QV",
};

export const ISSUE_META = {
  ausencia_vinculo: {
    categoria: "mecanismos",
    fonte: "client_mecanismos",
    campo: "client_id",
    prioridade: "alta",
    causaProvavel: "Cliente sem vínculo registrado ao catálogo de mecanismos",
    acaoRecomendada: "Criar vínculo ou confirmar elegibilidade ao programa",
  },
  ausencia_datas: {
    categoria: "mecanismos",
    fonte: "client_mecanismos",
    campo: "implemented_at / created_at",
    prioridade: "alta",
    causaProvavel: "Vínculos existem sem datas utilizáveis para histórico",
    acaoRecomendada: "Preencher datas de implantação na origem",
  },
  status_inconsistente: {
    categoria: "mecanismos",
    fonte: "client_mecanismos",
    campo: "status",
    prioridade: "media",
    causaProvavel: "Múltiplos status conflitantes no mesmo cliente",
    acaoRecomendada: "Padronizar status operacional",
  },
  historico_nao_disponivel: {
    categoria: "mecanismos",
    fonte: "client_mecanismos",
    campo: "implemented_at",
    prioridade: "media",
    causaProvavel: "Vínculos sem implantação datada",
    acaoRecomendada: "Registrar implemented_at quando aplicável",
  },
  regra_pontuacao_ou_status: {
    categoria: "mecanismos",
    fonte: "client_mecanismos + scoring",
    campo: "status / contagem",
    prioridade: "baixa",
    causaProvavel: "Vínculo presente mas não refletido na nota M",
    acaoRecomendada: "Revisar status vs regra de contagem implantados",
  },
  entrada_migracao_cadastral: {
    categoria: "entrada_contratual",
    fonte: "clients",
    campo: "data_inicio_ciclo",
    prioridade: "media",
    causaProvavel: "Lote de migração sem ciclo preenchido",
    acaoRecomendada: "preencher data_inicio_ciclo",
  },
  datas_ausentes: {
    categoria: "entrada_contratual",
    fonte: "clients",
    campo: "data_inicio_ciclo / created_at",
    prioridade: "alta",
    causaProvavel: "Sem data de entrada reconstruível",
    acaoRecomendada: "cadastro entrada/ciclo",
  },
  campos_contraditorios: {
    categoria: "cadastro",
    fonte: "clients",
    campo: "data_inicio_ciclo vs created_at",
    prioridade: "baixa",
    causaProvavel: "Ciclo anterior ao created_at em lote migrado",
    acaoRecomendada: "validar ciclo vs created_at",
  },
  classificacao_vs_atividade: {
    categoria: "classificacao",
    fonte: "reuniões + classificação",
    campo: "finalClass",
    prioridade: "media",
    causaProvavel: "Reuniões existentes com classe Sem registro",
    acaoRecomendada: "revisar regra classificação",
  },
};

const SEVERITY_RANK = { alta: 3, media: 2, baixa: 1, info: 0 };

export function issueKeyFromDiagnostic(d) {
  return String(d.tipo || d.causa || "desconhecido").trim();
}

export function buildIssueRecords(clients, { identifiedAt = new Date() } = {}) {
  const day = identifiedAt.toISOString().slice(0, 10);
  const records = [];
  for (const c of clients) {
    for (const d of c.hs2a?.diagnostico || []) {
      const tipo = issueKeyFromDiagnostic(d);
      const meta = ISSUE_META[tipo] || DEFAULT_META;
      const pri = d.severidade && SEVERITY_RANK[d.severidade] != null ? d.severidade : meta.prioridade;
      records.push({
        categoria: meta.categoria,
        tipo,
        clientId: c.clientId,
        clientName: c.clientName || c.clientCode || "—",
        clientCode: c.clientCode,
        clientRef: stableClientRef(c.clientId),
        programa: c.program || "—",
        ep: c.engineer || "—",
        campo: meta.campo,
        fonte: meta.fonte,
        evidencia: d.detalhe || d.corrigivel || tipo,
        prioridade: pri,
        prioridadeNota: "Qualidade de dados — não confundir com risco de churn",
        causaProvavel: meta.causaProvavel,
        acaoRecomendada: d.corrigivel || meta.acaoRecomendada,
        identificadoEm: day,
        perfil: c.hs2a?.perfilLabel || c.hs2a?.perfilCodigo || "",
      });
    }
  }
  return records.sort((a, b) => (SEVERITY_RANK[b.prioridade] || 0) - (SEVERITY_RANK[a.prioridade] || 0));
}

export function aggregateIssuesByCategory(records) {
  const m = new Map();
  for (const r of records) {
    m.set(r.categoria, (m.get(r.categoria) || 0) + 1);
  }
  return [...m.entries()].map(([categoria, count]) => ({ categoria, count })).sort((a, b) => b.count - a.count);
}
