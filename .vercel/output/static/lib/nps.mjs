/** Regras e agregações de NPS para a aba de correlações. */

const NPS_CLASSES = [
  { key: "detractor", label: "Detratores" },
  { key: "passive", label: "Neutros" },
  { key: "promoter", label: "Promotores" },
];

function validScore(value) {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 10 ? score : null;
}

function responseDate(row) {
  const value = row?.submitted_at || row?.created_at;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export function classifyNpsScore(value) {
  const score = validScore(value);
  if (score == null) return null;
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

export function latestNpsByClient(rows = []) {
  const latest = new Map();
  for (const row of rows) {
    const clientId = row?.client_id == null ? "" : String(row.client_id);
    const score = validScore(row?.score);
    const date = responseDate(row);
    if (!clientId || score == null || !date) continue;
    const current = latest.get(clientId);
    if (!current || date > current.date || (date.getTime() === current.date.getTime() && String(row.id) > String(current.id))) {
      latest.set(clientId, {
        id: row.id,
        score,
        npsClass: classifyNpsScore(score),
        submittedAt: date.toISOString(),
        date,
      });
    }
  }
  return latest;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function pearsonCorrelation(pairs = []) {
  if (pairs.length < 3) return null;
  const xs = pairs.map((pair) => pair[0]);
  const ys = pairs.map((pair) => pair[1]);
  const meanX = average(xs);
  const meanY = average(ys);
  let numerator = 0;
  let spreadX = 0;
  let spreadY = 0;
  for (let i = 0; i < pairs.length; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    numerator += dx * dy;
    spreadX += dx * dx;
    spreadY += dy * dy;
  }
  if (spreadX === 0 || spreadY === 0) return null;
  return Math.round((numerator / Math.sqrt(spreadX * spreadY)) * 1000) / 1000;
}

function ranks(values) {
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const result = Array(values.length);
  let start = 0;
  while (start < sorted.length) {
    let end = start + 1;
    while (end < sorted.length && sorted[end].value === sorted[start].value) end += 1;
    const rank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) result[sorted[index].index] = rank;
    start = end;
  }
  return result;
}

export function spearmanCorrelation(pairs = []) {
  if (pairs.length < 3) return null;
  const xRanks = ranks(pairs.map((pair) => pair[0]));
  const yRanks = ranks(pairs.map((pair) => pair[1]));
  return pearsonCorrelation(xRanks.map((rank, index) => [rank, yRanks[index]]));
}

function correlationFor(rows, key, label) {
  const pairs = rows
    .filter((row) => Number.isFinite(row.npsScore) && Number.isFinite(row[key]))
    .map((row) => [row.npsScore, row[key]]);
  return {
    key,
    label,
    sampleSize: pairs.length,
    pearson: pearsonCorrelation(pairs),
    spearman: spearmanCorrelation(pairs),
  };
}

export function buildNpsAnalysis(rows = []) {
  const totalClients = rows.length;
  const respondents = rows.filter((row) => Number.isFinite(row.npsScore));
  const renewedRespondents = respondents.filter((row) => row.hasRenewed);
  const renewalByClass = NPS_CLASSES.map((npsClass) => {
    const members = respondents.filter((row) => row.npsClass === npsClass.key);
    const renewed = members.filter((row) => row.hasRenewed).length;
    return {
      ...npsClass,
      respondents: members.length,
      renewed,
      renewalRate: members.length ? Math.round((renewed / members.length) * 1000) / 10 : null,
      shareOfRenewed: renewedRespondents.length ? Math.round((renewed / renewedRespondents.length) * 1000) / 10 : null,
    };
  });

  return {
    totalClients,
    respondents: respondents.length,
    coveragePercent: totalClients ? Math.round((respondents.length / totalClients) * 1000) / 10 : 0,
    correlations: [
      correlationFor(respondents, "engagementScore", "NPS x Engajamento"),
      correlationFor(respondents, "mechanismScore", "NPS x Mecanismos"),
    ],
    renewalByClass,
  };
}
