import { hsBand } from "../hs2a-interpretation.mjs";

function indexRows(snapshot) {
  const map = new Map();
  for (const row of snapshot?.rows || []) map.set(row.clientRef, row);
  return map;
}

function issueSet(row) {
  return new Set(row?.issueKeys || []);
}

export function compareSnapshots(current, previous) {
  if (!current || !previous) {
    return { comparable: false, reason: "snapshots_insuficientes" };
  }
  if (current.referenceDay === previous.referenceDay) {
    return { comparable: false, reason: "mesma_data_referencia", nota: "Não comparar snapshots do mesmo dia." };
  }
  if (current.schema !== previous.schema) return { comparable: false, reason: "schema_diferente" };
  if (current.formulaVersion !== previous.formulaVersion || current.hs2aVersion !== previous.hs2aVersion) {
    return {
      comparable: false,
      reason: "versao_regras_diferente",
      methodologyChange: true,
      de: previous.referenceDay,
      para: current.referenceDay,
      nota: "Mudança de versão — diferenças podem ser metodológicas, não comportamentais.",
    };
  }

  const cur = indexRows(current);
  const prev = indexRows(previous);
  const allRefs = new Set([...cur.keys(), ...prev.keys()]);

  let hsBandChange = 0;
  let classChange = 0;
  let eDrop = 0;
  let eRise = 0;
  let mChange = 0;
  let profileChange = 0;
  let qualityImproved = 0;
  let qualityWorse = 0;
  let entered = 0;
  let left = 0;
  let inconsistenciasNovas = 0;
  let inconsistenciasResolvidas = 0;
  const hsDeltas = [];

  for (const ref of allRefs) {
    const a = cur.get(ref);
    const b = prev.get(ref);
    if (a && !b) {
      entered += 1;
      continue;
    }
    if (!a && b) {
      left += 1;
      continue;
    }
    if (hsBand(a.hs) !== hsBand(b.hs)) hsBandChange += 1;
    if (a.classificacao !== b.classificacao) classChange += 1;
    if (Number.isFinite(a.hs) && Number.isFinite(b.hs)) hsDeltas.push(a.hs - b.hs);
    if (Number.isFinite(a.e) && Number.isFinite(b.e)) {
      if (a.e < b.e - 5) eDrop += 1;
      if (a.e > b.e + 5) eRise += 1;
    }
    if (a.m !== b.m) mChange += 1;
    if (a.perfil !== b.perfil) profileChange += 1;
    const qRank = { historico_insuficiente: 0, confiabilidade_parcial: 1, alta_confiabilidade: 2 };
    if ((qRank[a.qualidade] || 0) > (qRank[b.qualidade] || 0)) qualityImproved += 1;
    if ((qRank[a.qualidade] || 0) < (qRank[b.qualidade] || 0)) qualityWorse += 1;

    const curIssues = issueSet(a);
    const prevIssues = issueSet(b);
    for (const k of curIssues) {
      if (!prevIssues.has(k)) inconsistenciasNovas += 1;
    }
    for (const k of prevIssues) {
      if (!curIssues.has(k)) inconsistenciasResolvidas += 1;
    }
  }

  const compared = [...allRefs].filter((r) => cur.has(r) && prev.has(r)).length;
  hsDeltas.sort((x, y) => x - y);
  const hsDeltaMediana = hsDeltas.length
    ? hsDeltas.length % 2
      ? hsDeltas[Math.floor(hsDeltas.length / 2)]
      : (hsDeltas[hsDeltas.length / 2 - 1] + hsDeltas[hsDeltas.length / 2]) / 2
    : null;

  return {
    comparable: true,
    de: previous.referenceDay,
    para: current.referenceDay,
    clientesComparados: compared,
    mudancas: {
      faixa_hs: hsBandChange,
      classificacao: classChange,
      queda_e: eDrop,
      melhora_e: eRise,
      alteracao_m: mChange,
      perfil: profileChange,
      qualidade_melhor: qualityImproved,
      qualidade_pior: qualityWorse,
      inconsistencias_novas: inconsistenciasNovas,
      inconsistencias_resolvidas: inconsistenciasResolvidas,
      hs_delta_mediana: hsDeltaMediana,
    },
    fluxo_carteira: { entradas: entered, saidas: left },
    nota: "Diferenças podem refletir pipeline/cadastro — não atribuir só a comportamento.",
  };
}

export function coverageTrendFromManifest(manifestEntries) {
  const seen = new Set();
  return (manifestEntries || [])
    .filter((e) => {
      if (seen.has(e.referenceDay)) return false;
      seen.add(e.referenceDay);
      return true;
    })
    .slice(0, 12)
    .map((e) => ({
      dia: e.referenceDay,
      clientes: e.rowCount,
      integrity: e.integrity ? "ok" : "—",
    }));
}
