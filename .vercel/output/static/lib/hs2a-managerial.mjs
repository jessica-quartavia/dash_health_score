/**
 * Agregações gerenciais HS 2.0A — perfis exclusivos vs atributos coexistem.
 */
import { PROFILE_LABELS, QUALITY_LABELS, hsBand } from "./hs2a-interpretation.mjs";
import { pct, round1 } from "./utils.mjs";

function bump(map, key) {
  const k = key || "outros";
  map.set(k, (map.get(k) || 0) + 1);
}

export function buildManagerialSummary(clients) {
  const total = clients.length;
  const exclusiveProfile = new Map();
  const hsBandMap = new Map();
  const phaseMap = new Map();
  const qualityMap = new Map();
  const attributes = {
    historico_suficiente: 0,
    historico_insuficiente: 0,
    sem_reunioes_observadas: 0,
    sem_mecanismos_implantados: 0,
    baixo_engajamento_comprovado: 0,
  };

  for (const c of clients) {
    const h = c.hs2a || {};
    bump(exclusiveProfile, h.perfilCodigo);
    bump(hsBandMap, hsBand(c.healthScore));
    bump(phaseMap, h.faseRelacionamento);
    bump(qualityMap, h.qualidadeCodigo);

    if (h.qualidadeCodigo !== "historico_insuficiente") attributes.historico_suficiente += 1;
    else attributes.historico_insuficiente += 1;
    if ((c.totalMeetings || 0) === 0) attributes.sem_reunioes_observadas += 1;
    if ((c.implementedCount || 0) === 0) attributes.sem_mecanismos_implantados += 1;
    if ((c.totalMeetings || 0) >= 1 && (c.engagementScore || 0) <= 20) attributes.baixo_engajamento_comprovado += 1;
  }

  const profileRows = [...exclusiveProfile.entries()].map(([code, count]) => ({
    code,
    label: PROFILE_LABELS[code] || code,
    count,
    percent: pct(count, total),
  }));

  const compareDimension = (map, labelKey = "label") =>
    [...map.entries()]
      .map(([key, count]) => ({ [labelKey]: key, count, percent: pct(count, total) }))
      .sort((a, b) => b.count - a.count);

  return {
    version: "hs2a-managerial-etapa8-v1",
    totalClientes: total,
    notaDuplicidade: "Perfis primários são mutuamente exclusivos; atributos abaixo podem coexistir no mesmo cliente.",
    perfisExclusivos: profileRows,
    faixasHs: compareDimension(hsBandMap, "faixa"),
    fases: compareDimension(phaseMap, "fase").map((r) => ({
      ...r,
      fase: r.fase === "implantacao" ? "Em implantação" : "Pós-implantação",
    })),
    qualidadeInformacional: compareDimension(qualityMap, "categoria").map((r) => ({
      ...r,
      categoria: QUALITY_LABELS[r.categoria] || r.categoria,
    })),
    atributosCoexistem: Object.entries(attributes).map(([id, count]) => ({
      id,
      count,
      percent: pct(count, total),
    })),
  };
}

export function buildComparativeStats(clients, dimension) {
  const groups = new Map();
  for (const c of clients) {
    let key;
    if (dimension === "program") key = c.program || "Não informado";
    else if (dimension === "engineer") key = c.engineer || "Não informado";
    else if (dimension === "fase") key = c.hs2a?.faseLabel || "—";
    else if (dimension === "qualidade") key = c.hs2a?.qualidadeLabel || "—";
    else if (dimension === "hsBand") key = hsBand(c.healthScore);
    else key = "all";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return [...groups.entries()]
    .map(([label, rows]) => {
      const scores = rows.map((r) => r.healthScore).filter(Number.isFinite);
      const sorted = [...scores].sort((a, b) => a - b);
      const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
      return {
        label,
        n: rows.length,
        hsMedio: scores.length ? round1(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        hsMediana: median,
        shareImplantacao: pct(rows.filter((r) => r.hs2a?.perfilCodigo === "em_implantacao").length, rows.length),
        coberturaReuniao: pct(rows.filter((r) => (r.totalMeetings || 0) > 0).length, rows.length),
      };
    })
    .filter((g) => g.n >= 1)
    .sort((a, b) => b.n - a.n);
}

export function distributionFromClients(clients) {
  const bands = ["0-20", "20-40", "40-60", "60-80", "80-100", "indisponivel"];
  const counts = Object.fromEntries(bands.map((b) => [b, 0]));
  for (const c of clients) counts[hsBand(c.healthScore)] = (counts[hsBand(c.healthScore)] || 0) + 1;
  const total = clients.length || 1;
  return bands.filter((b) => counts[b]).map((faixa) => ({
    faixa,
    n: counts[faixa],
    share: counts[faixa] / total,
  }));
}

export function profileDistributionFromClients(clients) {
  const map = new Map();
  for (const c of clients) bump(map, c.hs2a?.perfilCodigo);
  const total = clients.length || 1;
  return [...map.entries()].map(([code, n]) => ({
    code,
    label: PROFILE_LABELS[code] || code,
    n,
    share: n / total,
  }));
}
