/**
 * Diagnósticos de qualidade — Etapa 9 (sem alterar BASE QV).
 */
import { parseDate } from "./utils.mjs";
import { PROFILE_LABELS, resolveContractualEntry } from "./hs2a-interpretation.mjs";

export const PROFILE_RULES = {
  em_implantacao: "classificacao_historica == Em implantação (prioridade após dados reconstruíveis)",
  relacionamento_estabelecido: ">=3 reuniões OU E>40, fora implantação, M observável",
  baixa_atividade_observada: ">=1 reunião E E<=20 — descritivo, não risco",
  historico_insuficiente: "Sem registro reconstruível OU <2 reuniões fora implantação",
  mecanismos_nao_observaveis: "cobertura_mecanismos == sem_vinculo",
  dados_inconsistentes: "entrada não confiável (migração) ou reconstrução parcial",
};

export function diagnoseMechanismGap(clientId, mechanismRows = []) {
  const rows = mechanismRows.filter((r) => String(r.client_id) === String(clientId));
  if (!rows.length) {
    return { causa: "ausencia_vinculo", detalhe: "Nenhum registro em client_mecanismos" };
  }
  const withDate = rows.filter((r) => parseDate(r.implemented_at) || parseDate(r.created_at));
  if (!withDate.length) return { causa: "ausencia_datas", detalhe: "Vínculos sem implemented_at/created_at úteis" };
  const statuses = [...new Set(rows.map((r) => String(r.status || "").trim()).filter(Boolean))];
  if (statuses.length > 3) return { causa: "status_inconsistente", detalhe: `Múltiplos status: ${statuses.slice(0, 4).join(", ")}` };
  const implemented = rows.filter((r) => parseDate(r.implemented_at));
  if (!implemented.length) return { causa: "historico_nao_disponivel", detalhe: "Vínculos existem mas sem implantação datada" };
  return { causa: "regra_pontuacao_ou_status", detalhe: "Vínculo presente — revisar status vs contagem implantados" };
}

export function diagnoseInconsistencies(client, row) {
  const issues = [];
  const entry = resolveContractualEntry(client);
  if (entry.migrationBatch && !parseDate(client?.data_inicio_ciclo)) {
    issues.push({ tipo: "entrada_migracao_cadastral", severidade: "media", corrigivel: "preencher data_inicio_ciclo" });
  }
  if (!entry.date) issues.push({ tipo: "datas_ausentes", severidade: "alta", corrigivel: "cadastro entrada/ciclo" });
  if (entry.date && row.cycleDate) {
    const c = parseDate(client?.data_inicio_ciclo);
    const cr = parseDate(client?.created_at);
    if (c && cr && c < cr && entry.migrationBatch) {
      issues.push({ tipo: "campos_contraditorios", severidade: "baixa", corrigivel: "validar ciclo vs created_at" });
    }
  }
  if (row.finalClass === "Sem registro" && (row.totalMeetings || 0) > 0) {
    issues.push({ tipo: "classificacao_vs_atividade", severidade: "media", corrigivel: "revisar regra classificação" });
  }
  return issues;
}

export function diagnoseHistoricoInsuficiente(client, row) {
  const reasons = [];
  if (row.finalClass === "Sem registro") reasons.push("reconstrucao_impossivel");
  if ((row.daysSinceEntry || 0) < 90 && row.finalClass === "Em implantação") reasons.push("cliente_novo_implantacao");
  if ((row.totalMeetings || 0) === 0 && row.finalClass !== "Em implantação") reasons.push("atividade_nao_observada");
  if (!parseDate(client?.data_inicio_ciclo) && !parseDate(client?.created_at)) reasons.push("fonte_cobertura_limitada");
  return reasons.length ? reasons : ["historico_curto_pos_implantacao"];
}

export function explainProfileReasons(client, row, { mechanismLinked = false, mechanismRows = [] } = {}) {
  const h = row.hs2a || {};
  const code = h.perfilCodigo;
  const reasons = [{ regra: PROFILE_RULES[code] || code }];
  if (code === "mecanismos_nao_observaveis") {
    reasons.push(diagnoseMechanismGap(client.id, mechanismRows));
  }
  if (code === "dados_inconsistentes") {
    for (const issue of diagnoseInconsistencies(client, row)) reasons.push({ regra: issue.tipo, ...issue });
  }
  if (code === "historico_insuficiente") {
    reasons.push({ regra: "subtipos", subtipos: diagnoseHistoricoInsuficiente(client, row) });
  }
  if (code === "em_implantacao") {
    reasons.push({ regra: "tenure", diasEntrada: row.daysSinceEntry, reunioes: row.totalMeetings });
  }
  if (code === "baixa_atividade_observada") {
    reasons.push({ regra: "E_baixo_com_reuniao", E: row.engagementScore, reunioes: row.totalMeetings });
  }
  return reasons;
}

export function buildQualityIndicators(clients, { denominatorLabel = "clientes no recorte" } = {}) {
  const n = clients.length || 0;
  const pct = (c) => (n ? Math.round((c / n) * 1000) / 10 : 0);
  let histSuf = 0;
  let mechConf = 0;
  let entradaConf = 0;
  let inconsist = 0;
  const problemCounts = new Map();

  for (const c of clients) {
    const h = c.hs2a || {};
    if (h.qualidadeCodigo !== "historico_insuficiente") histSuf += 1;
    if (h.coberturaMecanismos === "completa") mechConf += 1;
    if (h.entradaConfiavel) entradaConf += 1;
    if (h.perfilCodigo === "dados_inconsistentes") inconsist += 1;
    for (const r of h.diagnostico || []) {
      const key = r.tipo || r.causa || r.regra;
      if (key) problemCounts.set(key, (problemCounts.get(key) || 0) + 1);
    }
  }

  return {
    denominador: { n, label: denominatorLabel },
    indicadores: [
      { id: "historico_suficiente", numerador: histSuf, percentual: pct(histSuf), nota: "qualidade != historico_insuficiente" },
      { id: "mecanismos_confiaveis", numerador: mechConf, percentual: pct(mechConf), nota: "cobertura_mecanismos=completa" },
      { id: "entrada_contratual_confiavel", numerador: entradaConf, percentual: pct(entradaConf), nota: "data_inicio_ciclo ou created_at não migrado" },
      { id: "com_inconsistencias", numerador: inconsist, percentual: pct(inconsist), nota: "perfil dados_inconsistentes" },
    ],
    principais_problemas: [...problemCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tipo, count]) => ({ tipo, count, percentual: pct(count) })),
    separacao: "Indicadores de qualidade informacional — não medem saúde (HS) do relacionamento.",
  };
}

export function attachDiagnostics(client, row, ctx) {
  const issues = diagnoseInconsistencies(client, row);
  const mechGap = row.hs2a?.perfilCodigo === "mecanismos_nao_observaveis"
    ? diagnoseMechanismGap(client.id, ctx.mechanismRows)
    : null;
  const diagnostico = [
    ...issues,
    ...(mechGap ? [{ tipo: mechGap.causa, detalhe: mechGap.detalhe }] : []),
  ];
  const profileReasons = explainProfileReasons(client, row, ctx);
  return {
    ...row,
    hs2a: {
      ...row.hs2a,
      diagnostico,
      profileReasons,
    },
  };
}

export function auditProfileSegment(clients, profileCode) {
  const sub = clients.filter((c) => c.hs2a?.perfilCodigo === profileCode);
  const n = sub.length;
  if (!n) return null;
  const hs = sub.map((c) => c.healthScore).filter(Number.isFinite);
  const e = sub.map((c) => c.engagementScore).filter(Number.isFinite);
  const m = sub.map((c) => c.mechanismScore).filter(Number.isFinite);
  const prog = new Map();
  const ep = new Map();
  for (const c of sub) {
    prog.set(c.program, (prog.get(c.program) || 0) + 1);
    ep.set(c.engineer, (ep.get(c.engineer) || 0) + 1);
  }
  const issueMap = new Map();
  for (const c of sub) {
    for (const d of c.hs2a?.diagnostico || []) {
      const k = d.tipo || d.causa || "outro";
      issueMap.set(k, (issueMap.get(k) || 0) + 1);
    }
  }
  return {
    perfil: profileCode,
    label: PROFILE_LABELS[profileCode],
    regra: PROFILE_RULES[profileCode],
    clientes: n,
    hs: distStats(hs),
    e: distStats(e),
    m: distStats(m),
    programa: topN(prog, 6),
    ep: topN(ep, 6),
    permanencia_dias: distStats(sub.map((c) => c.hs2a?.diasRelacionamento).filter(Number.isFinite)),
    cobertura_reuniao: {
      com_reuniao: sub.filter((c) => (c.totalMeetings || 0) > 0).length,
      sem_reuniao: sub.filter((c) => (c.totalMeetings || 0) === 0).length,
    },
    cobertura_mecanismos: countBy(sub, (c) => c.hs2a?.coberturaMecanismos),
    inconsistencias_principais: topN(issueMap, 8),
    nota: "Distribuição descritiva — sem inferência causal.",
  };
}

function distStats(values) {
  if (!values.length) return { n: 0, media: null, mediana: null, min: null, max: null };
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return {
    n: s.length,
    media: Math.round((s.reduce((a, b) => a + b, 0) / s.length) * 10) / 10,
    mediana: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2,
    min: s[0],
    max: s[s.length - 1],
  };
}

function topN(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function countBy(rows, fn) {
  const m = new Map();
  for (const r of rows) bump(m, fn(r));
  return Object.fromEntries(m);
}

function bump(map, key) {
  const k = key || "—";
  map.set(k, (map.get(k) || 0) + 1);
}
