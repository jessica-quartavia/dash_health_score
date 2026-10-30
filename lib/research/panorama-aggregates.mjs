import { existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { assertNoInvalidNumbers, finiteNumber, sanitizeRate } from "../frontend/display-format.mjs";
import { probePanoramaArtifacts, reasonMessage } from "./panorama-artifacts.mjs";
import { buildChurnRateAudit, extendModelMetrics } from "./churn-rate-audit.mjs";
import { buildDatasetReconciliation } from "./dataset-reconciliation.mjs";
import { buildPredictiveLabReference } from "./predictive-lab-reference.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CSV_PATH = join(ROOT, "exports", "predictive-study", "dataset_preditivo_validado.csv");
const MIN_CELL_N = 30;
const HS_BAND_ORDER = ["0-20", "20-40", "40-60", "60-80", "80-100", "insuficiente"];

function sortHsBands(bands) {
  return [...(bands || [])].sort(
    (a, b) => HS_BAND_ORDER.indexOf(a.band) - HS_BAND_ORDER.indexOf(b.band) || String(a.band).localeCompare(String(b.band)),
  );
}

function normalizeBandCell(raw) {
  const n = finiteNumber(raw.n) ?? 0;
  const pos = finiteNumber(raw.pos) ?? 0;
  const uniqueClients = finiteNumber(raw.uniqueClients);
  const churnRate = sanitizeRate(raw.churnRate ?? (n ? pos / n : null));
  const ciLow = sanitizeRate(raw.ciLow);
  const ciHigh = sanitizeRate(raw.ciHigh);
  return {
    band: raw.band,
    n,
    uniqueClients: uniqueClients ?? (n ? 0 : null),
    churnRate,
    ciLow,
    ciHigh,
    lowSample: Boolean(raw.lowSample ?? n < MIN_CELL_N),
  };
}

let csvCache = { key: "", rows: null };

function readJson(rel) {
  const path = join(ROOT, rel);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ";") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function loadValidatedRows() {
  if (!existsSync(CSV_PATH)) return { ok: false, reason: "csv_missing", rows: [] };
  const st = statSync(CSV_PATH);
  const key = `${st.mtimeMs}-${st.size}`;
  if (csvCache.key === key && csvCache.rows) return { ok: true, rows: csvCache.rows, source: "csv" };
  const text = readFileSync(CSV_PATH, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { ok: false, reason: "csv_empty", rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => {
      row[h] = vals[j] ?? "";
    });
    rows.push(row);
  }
  csvCache = { key, rows };
  return { ok: true, rows, source: "csv" };
}

function truthy(v) {
  return v === true || v === "true" || v === "1" || v === 1;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function hsBand(score) {
  const n = num(score);
  if (n == null) return "insuficiente";
  if (n < 20) return "0-20";
  if (n < 40) return "20-40";
  if (n < 60) return "40-60";
  if (n < 80) return "60-80";
  return "80-100";
}

function eBand(score) {
  const n = num(score);
  if (n == null) return "insuficiente";
  if (n <= 0) return "0 (crítico)";
  if (n <= 20) return "20 (crítico)";
  if (n <= 60) return "60 (atenção)";
  return "100 (saudável)";
}

function mBand(score, row) {
  const n = num(score);
  const cov = row.cobertura_mecanismos || "";
  if (n == null) return "insuficiente";
  if (n <= 0) {
    if (cov === "sem_vinculo") return "0 — sem vínculo";
    if (cov === "parcial") return "0 — histórico insuficiente";
    return "0 — ausência comprovada";
  }
  if (n <= 20) return "20 (crítico)";
  if (n <= 60) return "60 (atenção)";
  return "100 (saudável)";
}

function wilsonCi(pos, n, z = 1.96) {
  if (!n) return { low: null, high: null };
  const p = pos / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

function aggregateLabeled(rows, filters = {}) {
  let base = rows.filter(
    (r) => truthy(r.elegivel_modelagem_90d) && !truthy(r.censura_90d) && r.desfecho_churn_90d !== "",
  );
  if (filters.programa && filters.programa !== "all") {
    base = base.filter((r) => String(r.programa).toUpperCase() === filters.programa.toUpperCase());
  }
  if (filters.quality === "sem_vinculo") {
    base = base.filter((r) => r.cobertura_mecanismos === "sem_vinculo");
  } else if (filters.quality === "completa") {
    base = base.filter((r) => r.cobertura_mecanismos === "completa");
  }
  if (filters.phase === "implantacao") {
    base = base.filter((r) => String(r.classificacao_historica).includes("implantação"));
  } else if (filters.phase === "pos") {
    base = base.filter((r) => !String(r.classificacao_historica).includes("implantação"));
  }
  const clients = new Set(base.map((r) => r.cliente_ref));
  const positives = base.filter((r) => truthy(r.desfecho_churn_90d));
  const rate = base.length ? positives.length / base.length : null;

  function bandAgg(getBand) {
    const map = new Map();
    for (const r of base) {
      const band = getBand(r);
      const cell = map.get(band) || { band, n: 0, pos: 0, clients: new Set() };
      cell.n += 1;
      cell.clients.add(r.cliente_ref);
      if (truthy(r.desfecho_churn_90d)) cell.pos += 1;
      map.set(band, cell);
    }
    return [...map.values()].map((c) => {
      const ci = wilsonCi(c.pos, c.n);
      return normalizeBandCell({
        band: c.band,
        n: c.n,
        pos: c.pos,
        uniqueClients: c.clients.size,
        churnRate: c.n ? c.pos / c.n : null,
        ciLow: ci.low,
        ciHigh: ci.high,
        lowSample: c.n < MIN_CELL_N,
      });
    });
  }

  const eScores = [0, 20, 60, 100];
  const mScores = [0, 20, 60, 100];
  const matrix = [];
  for (const e of eScores) {
    for (const m of mScores) {
      const cellRows = base.filter((r) => num(r.engajamento_historico) === e && num(r.mecanismos_historico) === m);
      const pos = cellRows.filter((r) => truthy(r.desfecho_churn_90d)).length;
      const n = cellRows.length;
      const ci = wilsonCi(pos, n);
      matrix.push({
        e,
        m,
        n,
        uniqueClients: new Set(cellRows.map((r) => r.cliente_ref)).size,
        churnRate: sanitizeRate(n ? pos / n : null),
        ciLow: sanitizeRate(ci.low),
        ciHigh: sanitizeRate(ci.high),
        suppressed: n > 0 && n < MIN_CELL_N,
      });
    }
  }

  return {
    filterLabel: filters.programa && filters.programa !== "all" ? `Programa ${filters.programa}` : "Amostra rotulada 90d (Etapa 3)",
    observations: base.length,
    uniqueClients: clients.size,
    churnEvents: positives.length,
    observedChurnRate: sanitizeRate(rate),
    hsBands: sortHsBands(bandAgg((r) => hsBand(r.hs_historico))),
    eBands: bandAgg((r) => eBand(r.engajamento_historico)),
    mBands: bandAgg((r) => mBand(r.mecanismos_historico, r)),
    emMatrix: matrix,
    source: "csv",
  };
}

function mapRobustnessHsBands(bands) {
  return sortHsBands(
    (bands || []).map((b) =>
      normalizeBandCell({
        band: b.hs_faixa,
        n: b.observacoes,
        pos: (b.taxa_por_observacao ?? 0) * (b.observacoes ?? 0),
        uniqueClients: b.clientes_unicos,
        churnRate: b.taxa_por_observacao,
        ciLow: b.taxa_ci_low,
        ciHigh: b.taxa_ci_high,
        lowSample: (b.observacoes || 0) < MIN_CELL_N,
      }),
    ),
  );
}

export function buildResearchPanorama(query = {}, options = {}) {
  const artifactsProbe = options.artifactsProbe || probePanoramaArtifacts(ROOT);
  const preAudit = readJson("research/modeling/output/pre_audit.json");
  const robustness = readJson("research/modeling/output/robustness_results.json");
  const modeling = readJson("research/modeling/output/modeling_results_etapa4.json") || readJson("research/modeling/output/modeling_results.json");
  const profiles = readJson("research/modeling/output/hs_profiles_analysis.json");
  const weightStudy = readJson("research/modeling/output/hs_weight_study.json");
  const csv = loadValidatedRows();

  const filters = {
    programa: query.programa || "all",
    quality: query.quality || "all",
    phase: query.phase || "all",
  };

  const totalHistoricalRows =
    finiteNumber(preAudit?.hs_distribution?.count) ?? (csv.ok ? csv.rows.length : null);
  const labeledRows = preAudit
    ? finiteNumber((preAudit.positive_rows_90d || 0) + (preAudit.negative_rows_90d || 0))
    : null;
  let censored90 = null;
  if (totalHistoricalRows != null && labeledRows != null) {
    const c = totalHistoricalRows - labeledRows;
    censored90 = Number.isFinite(c) ? c : null;
  }

  let descriptive = null;
  let descriptiveAvailability = {
    ok: false,
    reason: csv.ok ? "pending" : csv.reason || "csv_missing",
    message: reasonMessage(csv.ok ? "pending" : csv.reason || "csv_missing"),
    missingArtifacts: artifactsProbe.missing,
  };
  if (csv.ok) {
    try {
      descriptive = aggregateLabeled(csv.rows, filters);
      descriptiveAvailability = {
        ok: true,
        source: "csv",
        rows: csv.rows.length,
        message: "Agregados descritivos calculados a partir do dataset validado.",
      };
    } catch (err) {
      descriptiveAvailability = {
        ok: false,
        reason: "processing_error",
        message: reasonMessage("processing_error"),
        detail: err.message,
      };
    }
  } else if (robustness?.hs_bands?.bands) {
    descriptive = {
      filterLabel: "Artefato Etapa 5 (sem CSV local)",
      observations: robustness.hs_bands.bands.reduce((s, b) => s + (b.observacoes || 0), 0),
      uniqueClients: finiteNumber(preAudit?.unique_clients_labeled_90d),
      churnEvents: finiteNumber(preAudit?.positive_rows_90d),
      observedChurnRate: labeledRows ? sanitizeRate((preAudit.positive_rows_90d || 0) / labeledRows) : null,
      hsBands: mapRobustnessHsBands(robustness.hs_bands.bands),
      eBands: [],
      mBands: [],
      emMatrix: [],
      csvMissing: true,
      partial: true,
      partialNote:
        "Faixas E, M e matriz E×M exigem exports/predictive-study/dataset_preditivo_validado.csv — regenere com o pipeline de exportação validada.",
    };
    descriptiveAvailability = {
      ok: "partial",
      source: "robustness_hs_only",
      reason: "csv_missing",
      message: reasonMessage("csv_missing"),
      missingArtifacts: artifactsProbe.missing,
      regenerateCommand: "npm run build:predictive-validated",
    };
  } else {
    const reason = !existsSync(join(ROOT, "research/modeling/output/pre_audit.json"))
      ? "pre_audit_missing"
      : csv.reason || "artifacts_missing";
    descriptiveAvailability = {
      ok: false,
      reason,
      message: reasonMessage(reason),
      missingArtifacts: artifactsProbe.missing,
      hint: "Copie exports/ (gitignored) ou gere: npm run build:predictive-validated. Modelos congelados permanecem em research/modeling/output/.",
      regenerateCommand: "npm run build:predictive-validated",
    };
  }

  const ranking = modeling?.ranking_test || [];
  const best = ranking[0];
  let models = ranking.map((row) => {
    const test = modeling?.models?.[row.model_id]?.test || {};
    const boot = test.bootstrap_roc_auc || {};
    return {
      id: row.model_id,
      label: row.label,
      rocAuc: test.roc_auc ?? null,
      prAuc: test.pr_auc ?? null,
      nTest: test.n ?? modeling?.sample?.test ?? null,
      ciLow: boot.ci_low ?? null,
      ciHigh: boot.ci_high ?? null,
    };
  });
  models = extendModelMetrics(models, modeling);
  const churnRateAudit = buildChurnRateAudit(preAudit, modeling);

  const weightGrid = (weightStudy?.grid || [])
    .filter((g) => g.rocAucTest != null)
    .map((g) => ({
      engagementPercent: g.engagementPercent,
      mechanismPercent: g.mechanismPercent,
      official: g.official,
      rocAucTest: g.rocAucTest,
      prAucTest: g.prAucTest,
      source: g.source,
    }));

  const profileRows = (profiles?.perfis || []).map((p) => ({
    id: p.perfil,
    label: p.definicao?.slice(0, 80) || p.perfil,
    observations: p.observacoes,
    uniqueClients: p.clientes_unicos,
    churnRate: p.churn_90d?.taxa ?? null,
    ciLow: p.churn_90d?.ci_low ?? null,
    ciHigh: p.churn_90d?.ci_high ?? null,
  }));

  const fp = existsSync(CSV_PATH) ? statSync(CSV_PATH) : null;
  const versionKey = createHash("sha256")
    .update(
      JSON.stringify({
        csv: fp ? `${fp.mtimeMs}-${fp.size}` : "none",
        modeling: modeling?.generatedAt,
        robustness: robustness?.generatedAt,
      }),
    )
    .digest("hex")
    .slice(0, 16);

  const kpis = {
    uniqueClientsResearch: finiteNumber(preAudit?.unique_clients_all),
    uniqueClientsChurnConfirmed: finiteNumber(preAudit?.unique_clients_with_churn_outcome),
    observationsHistorical: totalHistoricalRows,
    observationsLabeled90d: labeledRows,
    censored90d: censored90,
    churnEvents90d: finiteNumber(preAudit?.positive_rows_90d),
    observedChurnRate90d: labeledRows ? sanitizeRate((preAudit?.positive_rows_90d || 0) / labeledRows) : null,
    bestModelId: best?.model_id ?? null,
    bestModelLabel: best?.label ?? null,
    referenceModelId: "E",
    referenceModelLabel: "Baseline experimental congelado (Etapa 4)",
    evaluationPeriod: modeling?.split?.test_months?.join(", ") || "—",
    horizonDays: finiteNumber(modeling?.problem?.horizon_days) ?? 90,
  };

  const payload = {
    version: "panorama-v1",
    versionKey,
    generatedAt: new Date().toISOString(),
    dataSources: {
      csv: csv.ok ? "exports/predictive-study/dataset_preditivo_validado.csv" : null,
      preAudit: preAudit ? "research/modeling/output/pre_audit.json" : null,
      modeling: modeling ? "modeling_results_etapa4.json" : null,
      robustness: robustness ? "robustness_results.json" : null,
    },
    descriptiveAvailability,
    kpis,
    descriptive,
    models,
    weightGrid,
    weightRecommendation: weightStudy?.recommendation?.summaryPlain ?? null,
    profiles: profileRows,
    churnRateAudit,
    datasetReconciliation: buildDatasetReconciliation(preAudit, {
      root: ROOT,
      descriptiveObservations: descriptive?.observations ?? null,
      descriptiveRate: descriptive?.observedChurnRate ?? null,
      descriptiveFilterLabel: descriptive?.filterLabel ?? null,
    }),
    labReference: buildPredictiveLabReference(ROOT),
    learnings: robustness?.hs20_recommendations || [],
    limitations: [
      ...(modeling?.limitations || []),
      "Taxas observadas ≠ probabilidade individual de churn.",
      "Modelos A–E exploratórios — hold-out jun/2026 não substitui validação operacional.",
      "Perfis e HS históricos são point-in-time na exportação validada.",
    ],
    methodologyNote: preAudit?.m_retrospective_note || null,
  };
  const contractIssues = assertNoInvalidNumbers(payload);
  if (contractIssues.length) payload.contractIssues = contractIssues;
  return payload;
}
