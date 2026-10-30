/** Relatórios executivos — download + visualização para PDF. */

import { buildPredictiveExecutiveReportHtml, escHtml, wrapReportDocument } from "../lib/frontend/executive-report-core.mjs";
import { deliverReport } from "./report-delivery.mjs";
import { fetchJsonArtifact } from "/lib/http/fetch-json.mjs";

function deliverFromParts({ title, bodyHtml, filename }) {
  if (!bodyHtml) return { ok: false, error: "Relatório sem conteúdo." };
  return deliverReport({ title, bodyHtml, filename });
}

export function openHealthPortfolioReport({ summary, rows, weights, filters, meta, healthDistribution }) {
  const date = meta?.generatedAt ? new Date(meta.generatedAt).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR");
  const program = filters?.program && filters.program !== "all" ? filters.program : "Todos os programas";
  const official = weights?.engagement === 50 && weights?.mechanism === 50;
  const distRows = (healthDistribution || [])
    .map((d) => `<tr><td>${escHtml(d.label)}</td><td class="num">${d.count}</td><td class="num">${d.percent}%</td></tr>`)
    .join("");
  const clientRows = (rows || [])
    .slice(0, 200)
    .map(
      (r) =>
        `<tr><td>${escHtml(r.clientName)}</td><td>${escHtml(r.program)}</td><td class="num">${r.healthScore ?? "—"}</td><td>${escHtml(r.finalClass)}</td><td class="num">${r.engagementScore ?? "—"}</td><td class="num">${r.mechanismScore ?? "—"}</td></tr>`,
    )
    .join("");
  const body = `
<section class="cover">
  <p class="eyebrow">Health Analytics</p>
  <h1>Relatório de Saúde dos Clientes</h1>
  <p class="meta">Data da análise: ${escHtml(date)}</p>
  <p class="meta">Recorte: ${escHtml(program)} · ${escHtml(summary?.totalClients || rows?.length || 0)} clientes</p>
</section>
<h2>1. Resumo executivo</h2>
<ul>
  <li>Total: <strong>${summary?.totalClients ?? rows?.length ?? 0}</strong> clientes</li>
  <li>HS médio: <strong>${summary?.averageScore ?? "—"}</strong></li>
  <li>Saudáveis: ${summary?.healthy ?? 0} (${summary?.healthyPercent ?? 0}%)</li>
  <li>Em atenção: ${summary?.attention ?? 0} · Críticos: ${summary?.critical ?? 0}</li>
</ul>
<h2>2. O que é Health Score</h2>
<p>Indicador composto de engajamento (reuniões) e mecanismos implantados, em escala 0–100, para priorizar relacionamento — não é previsão de cancelamento.</p>
<h2>3. Fórmula utilizada</h2>
<p><strong>HS = (E × peso_E) + (M × peso_M)</strong></p>
<p>Pesos nesta sessão: Engajamento ${weights?.engagement ?? 50}% · Mecanismos ${weights?.mechanism ?? 50}%</p>
<p>${official ? "Cenário alinhado ao HS oficial V1 (50/50)." : "Cenário experimental — difere do HS oficial 50/50 documentado."}</p>
<h2>4. Situação da carteira</h2>
<table><thead><tr><th>Nível</th><th class="num">Qtd</th><th class="num">%</th></tr></thead><tbody>${distRows || "<tr><td colspan='3'>—</td></tr>"}</tbody></table>
<h2>5. Engajamento e mecanismos</h2>
<p><strong>E</strong> resume reuniões válidas; <strong>M</strong> resume mecanismos implantados.</p>
<h2>6. Clientes (amostra)</h2>
<table><thead><tr><th>Cliente</th><th>Programa</th><th class="num">HS</th><th>Nível</th><th class="num">E</th><th class="num">M</th></tr></thead><tbody>${clientRows || "<tr><td colspan='6'>—</td></tr>"}</tbody></table>
<h2>7. Limitações</h2>
<p>Health Score não equivale automaticamente à probabilidade de churn.</p>
<p class="footer">Health Analytics 3.0 · ${escHtml(date)}</p>`;
  return deliverFromParts({ title: "Relatório de Saúde dos Clientes", bodyHtml: body, filename: "health-analytics-saude-clientes" });
}

export function openHealthEvolutionReport(ctx) {
  const {
    summary,
    rows,
    weights,
    filters,
    meta,
    healthDistribution,
    composition,
    programStats,
    evolution,
  } = ctx;
  const date = meta?.generatedAt ? new Date(meta.generatedAt).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR");
  const program = filters?.program && filters.program !== "all" ? filters.program : "Todos os programas";
  const official = weights?.engagement === 50 && weights?.mechanism === 50;
  const distRows = (healthDistribution || [])
    .map((d) => `<tr><td>${escHtml(d.label)}</td><td class="num">${d.count}</td><td class="num">${d.percent}%</td></tr>`)
    .join("");
  const compRows = (composition?.levels || [])
    .map(
      (l) =>
        `<tr><td>${escHtml(l.label)}</td><td class="num">${l.n}</td><td class="num">${l.avgE ?? "—"}</td><td class="num">${l.avgM ?? "—"}</td></tr>`,
    )
    .join("");
  const progRows = (programStats || [])
    .slice(0, 12)
    .map((p) => `<tr><td>${escHtml(p.program)}</td><td class="num">${p.n}</td><td class="num">${p.hsMedio ?? "—"}</td></tr>`)
    .join("");
  const evoBlock = evolution?.comparable
    ? `<h2>Evolução temporal</h2><p>Referências ${escHtml(evolution.prevDay)} → ${escHtml(evolution.nextDay)} · Δ HS ${evolution.avgHsDelta ?? "—"}.</p>`
    : `<h2>Evolução temporal</h2><p>${escHtml(evolution?.message || "Histórico em formação.")}</p>`;
  const body = `
<section class="cover">
  <p class="eyebrow">Health Analytics</p>
  <h1>Saúde e Evolução — Relatório gerencial</h1>
  <p class="meta">${escHtml(date)} · ${escHtml(program)}</p>
</section>
<h2>Resumo</h2>
<ul>
  <li>HS médio: ${summary?.averageScore ?? "—"}</li>
  <li>Saudáveis: ${summary?.healthy ?? 0}% · Atenção: ${summary?.attention ?? 0} · Críticos: ${summary?.critical ?? 0}</li>
</ul>
<h2>Fórmula</h2>
<p>Engajamento ${weights?.engagement ?? 50}% · Mecanismos ${weights?.mechanism ?? 50}% — ${official ? "oficial V1" : "experimental"}.</p>
<h2>Distribuição</h2>
<table><thead><tr><th>Nível</th><th class="num">Qtd</th><th class="num">%</th></tr></thead><tbody>${distRows}</tbody></table>
<h2>Composição E/M</h2>
<table><thead><tr><th>Nível</th><th class="num">n</th><th class="num">E</th><th class="num">M</th></tr></thead><tbody>${compRows}</tbody></table>
<h2>Programas</h2>
<table><thead><tr><th>Programa</th><th class="num">n</th><th class="num">HS</th></tr></thead><tbody>${progRows}</tbody></table>
${evoBlock}
<p class="footer">Health Analytics 3.0 · ${escHtml(date)}</p>`;
  return deliverFromParts({ title: "Saúde e Evolução", bodyHtml: body, filename: "health-analytics-saude-evolucao" });
}

async function loadStudyArtifact(url) {
  const parsed = await fetchJsonArtifact(url);
  if (parsed.ok && parsed.data?.status === "ok") return parsed.data;
  return null;
}

async function fetchResearchArtifacts() {
  const out = { modeling: null, preAudit: null, studyV2: null, studyV15: null, studyV16: null, studyV17: null, labPack: null };
  try {
    const [mRes, pRes, v2, v15, v16, v17, labRes] = await Promise.all([
      fetch("/api/modeling-results-etapa4"),
      fetch("/api/pre-audit"),
      loadStudyArtifact("/api/predictive-study-v2"),
      loadStudyArtifact("/api/predictive-study-v15"),
      loadStudyArtifact("/api/predictive-study-v16"),
      loadStudyArtifact("/api/predictive-study-v17"),
      fetch("/api/predictive-lab-reference"),
    ]);
    if (mRes.ok) {
      const ct = (mRes.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("json")) out.modeling = await mRes.json();
    }
    if (pRes.ok) {
      const ct = (pRes.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("json")) out.preAudit = await pRes.json();
    }
    out.studyV2 = v2;
    out.studyV15 = v15;
    out.studyV16 = v16;
    out.studyV17 = v17;
    if (labRes.ok) {
      const ctLab = (labRes.headers.get("content-type") || "").toLowerCase();
      if (ctLab.includes("json")) out.labPack = await labRes.json();
    }
  } catch {
    /* relatório segue com panorama apenas */
  }
  return out;
}

/** @returns {Promise<{ ok: boolean, error?: string, method?: string }>} */
export async function openPredictiveExecutiveReport(panorama, weights) {
  const artifacts = await fetchResearchArtifacts();
  const built = buildPredictiveExecutiveReportHtml(panorama, weights, artifacts);
  if (!built.ok) {
    return { ok: false, error: built.error };
  }
  return deliverFromParts({
    title: built.title,
    bodyHtml: built.bodyHtml,
    filename: built.filename,
  });
}


export { wrapReportDocument, buildPredictiveExecutiveReportHtml };
