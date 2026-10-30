/**
 * Análises gerenciais — Saúde e Evolução (sem DOM).
 */
import { explainHsFactors, PROFILE_LABELS, QUALITY_LABELS } from "../hs2a-interpretation.mjs";
import { round1, pct } from "../utils.mjs";

export const HEALTH_LEVEL_ORDER = ["Saudável", "Atenção", "Crítico", "Em implantação", "Sem registro"];

function avg(nums) {
  const v = nums.filter(Number.isFinite);
  if (!v.length) return null;
  return round1(v.reduce((a, b) => a + b, 0) / v.length);
}

function bump(map, key) {
  const k = key || "—";
  map.set(k, (map.get(k) || 0) + 1);
}

export function primaryObservedFactor(row) {
  const factors = explainHsFactors(row);
  const scoreFactor = factors.find((f) => f.impact === "score");
  if (scoreFactor) return scoreFactor.label;
  const cov = factors.find((f) => f.impact === "cobertura");
  if (cov) return cov.label;
  const ctx = factors.find((f) => f.impact === "contexto");
  if (ctx) return ctx.label;
  const lim = factors.find((f) => f.impact === "limitacao");
  if (lim) return lim.label;
  const perfil = row.hs2a?.perfilCodigo;
  if (perfil && PROFILE_LABELS[perfil]) return PROFILE_LABELS[perfil];
  if (row.finalClass === "Sem registro") return "Sem reuniões e mecanismos observáveis no cadastro";
  if (row.finalClass === "Em implantação") return "Cliente recente em fase de implantação";
  return "Composição equilibrada ou histórico ainda curto";
}

export function buildHealthComposition(clients) {
  const buckets = Object.fromEntries(
    HEALTH_LEVEL_ORDER.map((l) => [l, { e: [], m: [], rows: [], quality: new Map() }]),
  );

  for (const c of clients || []) {
    const level = c.finalClass || "Sem registro";
    if (!buckets[level]) buckets[level] = { e: [], m: [], rows: [], quality: new Map() };
    buckets[level].rows.push(c);
    if (Number.isFinite(Number(c.engagementScore))) buckets[level].e.push(Number(c.engagementScore));
    if (Number.isFinite(Number(c.mechanismScore))) buckets[level].m.push(Number(c.mechanismScore));
    const q = c.hs2a?.qualidadeLabel || QUALITY_LABELS[c.hs2a?.qualidadeCodigo] || "—";
    bump(buckets[level].quality, q);
  }

  const levels = HEALTH_LEVEL_ORDER.map((label) => {
    const b = buckets[label] || { e: [], m: [], rows: [], quality: new Map() };
    const qualityRows = [...b.quality.entries()]
      .map(([qLabel, count]) => ({ label: qLabel, count, percent: pct(count, b.rows.length || 1) }))
      .sort((a, b) => b.count - a.count);
    return {
      label,
      n: b.rows.length,
      avgE: avg(b.e),
      avgM: avg(b.m),
      quality: qualityRows,
    };
  }).filter((r) => r.n > 0);

  const total = clients?.length || 0;
  let semReuniao = 0;
  let semMecanismo = 0;
  for (const c of clients || []) {
    if ((c.totalMeetings || 0) === 0) semReuniao += 1;
    if ((c.implementedCount || 0) === 0) semMecanismo += 1;
  }

  return {
    levels,
    coverage: {
      semReuniaoObservada: { count: semReuniao, percent: pct(semReuniao, total) },
      semMecanismoImplantado: { count: semMecanismo, percent: pct(semMecanismo, total) },
      nota:
        "Contagens descrevem o que o sistema registrou — ausência de reunião não prova desengajamento sem validar cadastro.",
    },
  };
}

export function buildProgramHealthStats(clients, { minGroup = 3 } = {}) {
  const groups = new Map();
  for (const c of clients || []) {
    const key = c.program || "Não informado";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return [...groups.entries()]
    .map(([program, rows]) => {
      const hs = rows.map((r) => r.healthScore).filter(Number.isFinite);
      const classMap = new Map();
      for (const r of rows) bump(classMap, r.finalClass);
      const distribution = HEALTH_LEVEL_ORDER.map((label) => ({
        label,
        count: classMap.get(label) || 0,
        percent: pct(classMap.get(label) || 0, rows.length),
      })).filter((d) => d.count > 0);
      const small = rows.length < minGroup;
      return {
        program,
        n: rows.length,
        hsMedio: hs.length ? round1(hs.reduce((a, b) => a + b, 0) / hs.length) : null,
        distribution,
        smallSample: small,
      };
    })
    .sort((a, b) => b.n - a.n);
}

export function buildEpHealthStats(clients, { minGroup = 3 } = {}) {
  const groups = new Map();
  for (const c of clients || []) {
    const key = c.engineer || "Não informado";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  return [...groups.entries()]
    .map(([engineer, rows]) => {
      const hs = rows.map((r) => r.healthScore).filter(Number.isFinite);
      const atencaoCritico = rows.filter((r) => r.finalClass === "Atenção" || r.finalClass === "Crítico").length;
      return {
        engineer,
        n: rows.length,
        hsMedio: hs.length ? round1(hs.reduce((a, b) => a + b, 0) / hs.length) : null,
        shareAtencaoCritico: pct(atencaoCritico, rows.length),
        smallSample: rows.length < minGroup,
      };
    })
    .sort((a, b) => b.n - a.n);
}

const E_BANDS = [
  { id: "all", label: "Todos", test: () => true },
  { id: "zero", label: "E = 0", test: (c) => Number(c.engagementScore) === 0 },
  { id: "low", label: "E ≤ 20", test: (c) => Number(c.engagementScore) <= 20 },
  { id: "mid", label: "21–60", test: (c) => Number(c.engagementScore) > 20 && Number(c.engagementScore) <= 60 },
  { id: "high", label: "E > 60", test: (c) => Number(c.engagementScore) > 60 },
];

const M_BANDS = [
  { id: "all", label: "Todos", test: () => true },
  { id: "zero", label: "M = 0", test: (c) => Number(c.mechanismScore) === 0 },
  { id: "mid", label: "M = 60", test: (c) => Number(c.mechanismScore) === 60 },
  { id: "high", label: "M = 100", test: (c) => Number(c.mechanismScore) === 100 },
];

export function filterAccompanimentRows(clients, filters = {}) {
  const q = String(filters.search || "")
    .trim()
    .toLowerCase();
  const health = filters.healthLevel || "all";
  const program = filters.program || "all";
  const ep = filters.ep || "all";
  const quality = filters.quality || "all";
  const eBand = E_BANDS.find((b) => b.id === (filters.engagement || "all")) || E_BANDS[0];
  const mBand = M_BANDS.find((b) => b.id === (filters.mechanism || "all")) || M_BANDS[0];

  return (clients || []).filter((c) => {
    if (health !== "all" && c.finalClass !== health) return false;
    if (program !== "all" && (c.program || "Não informado") !== program) return false;
    if (ep !== "all" && (c.engineer || "Não informado") !== ep) return false;
    if (quality !== "all") {
      const ql = c.hs2a?.qualidadeCodigo || c.hs2a?.qualidadeLabel || "";
      if (quality !== ql && quality !== c.hs2a?.qualidadeLabel) return false;
    }
    if (!eBand.test(c)) return false;
    if (!mBand.test(c)) return false;
    if (q) {
      const hay = [c.clientName, c.program, c.engineer, c.finalClass, primaryObservedFactor(c)]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function accompanimentDefaultRows(clients) {
  const priority = ["Crítico", "Atenção", "Em implantação", "Sem registro", "Saudável"];
  return [...(clients || [])].sort((a, b) => {
    const pa = priority.indexOf(a.finalClass);
    const pb = priority.indexOf(b.finalClass);
    if (pa !== pb) return pa - pb;
    return (a.healthScore ?? 999) - (b.healthScore ?? 999);
  });
}

/** Compara dois mapas client_ref → snapshot (HS congelado 50/50 no BD). */
export function compareSnapshotPopulations(prevMap, nextMap, { minDelta = 0.5 } = {}) {
  const refs = new Set([...prevMap.keys(), ...nextMap.keys()]);
  let improved = 0;
  let worsened = 0;
  let stable = 0;
  let eSum = 0;
  let mSum = 0;
  let pairs = 0;
  const prevDist = new Map();
  const nextDist = new Map();

  for (const ref of refs) {
    const p = prevMap.get(ref);
    const n = nextMap.get(ref);
    if (p?.classe) bump(prevDist, p.classe);
    if (n?.classe) bump(nextDist, n.classe);
    if (!p || !n) continue;
    if (!Number.isFinite(p.hs) || !Number.isFinite(n.hs)) continue;
    pairs += 1;
    const d = n.hs - p.hs;
    if (d >= minDelta) improved += 1;
    else if (d <= -minDelta) worsened += 1;
    else stable += 1;
    if (Number.isFinite(p.e) && Number.isFinite(n.e)) eSum += n.e - p.e;
    if (Number.isFinite(p.m) && Number.isFinite(n.m)) mSum += n.m - p.m;
  }

  const prevHs = [...prevMap.values()].map((v) => v.hs).filter(Number.isFinite);
  const nextHs = [...nextMap.values()].map((v) => v.hs).filter(Number.isFinite);

  const distRows = (map) => {
    const total = [...map.values()].reduce((s, v) => s + v, 0);
    return HEALTH_LEVEL_ORDER.map((label) => ({
      label,
      count: map.get(label) || 0,
      percent: pct(map.get(label) || 0, total || 1),
    })).filter((r) => r.count > 0);
  };

  return {
    comparable: true,
    pairedClients: pairs,
    avgHsPrev: avg(prevHs),
    avgHsNext: avg(nextHs),
    avgHsDelta: prevHs.length && nextHs.length ? round1(avg(nextHs) - avg(prevHs)) : null,
    improved,
    worsened,
    stable,
    avgEDelta: pairs ? round1(eSum / pairs) : null,
    avgMDelta: pairs ? round1(mSum / pairs) : null,
    distributionPrev: distRows(prevDist),
    distributionNext: distRows(nextDist),
  };
}

export function evolutionInsufficientMessage(snapshotCount) {
  if (!snapshotCount || snapshotCount < 1) {
    return "Histórico em formação. A evolução será exibida após medições persistidas no Business Data.";
  }
  return "Histórico em formação. A evolução será exibida após uma nova medição comparável.";
}

export { E_BANDS, M_BANDS };
