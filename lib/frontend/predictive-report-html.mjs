/**
 * Relatório executivo completo — Laboratório Preditivo (HTML).
 */
import { buildExecutiveConclusion, LIMITATIONS_PLAIN } from "../../public/research-executive.mjs";
function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function pct(rate) {
  if (rate == null || !Number.isFinite(Number(rate))) return "—";
  return `${(Number(rate) * 100).toFixed(1).replace(".", ",")}%`;
}

function bandTable(bands, title) {
  const rows = (bands || [])
    .filter((b) => b.band !== "insuficiente")
    .map(
      (b) =>
        `<tr><td>${escHtml(b.band)}</td><td class="num">${b.n ?? "—"}</td><td class="num">${pct(b.churnRate)}</td></tr>`,
    )
    .join("");
  return `<h3>${escHtml(title)}</h3><table><thead><tr><th>Faixa</th><th class="num">Observações</th><th class="num">Churn obs. 90d</th></tr></thead><tbody>${rows || "<tr><td colspan='3'>—</td></tr>"}</tbody></table>`;
}

function modelComparisonTable(panorama) {
  return (panorama.models || [])
    .map((m) => {
      const ci =
        m.ciLow != null && m.ciHigh != null
          ? `${Number(m.ciLow).toFixed(3)} – ${Number(m.ciHigh).toFixed(3)}`
          : "—";
      return `<tr><td>${escHtml(m.id)}</td><td>${escHtml(m.label || "—")}</td><td class="num">${m.rocAuc ?? "—"}</td><td class="num">${m.prAuc ?? "—"}</td><td class="num">${ci}</td><td class="num">${m.nTest ?? "—"}</td></tr>`;
    })
    .join("");
}

function weightGridTable(grid) {
  return (grid || [])
    .slice(0, 21)
    .map(
      (g) =>
        `<tr><td class="num">${g.engagementPercent}/${g.mechanismPercent}${g.official ? " ★" : ""}</td><td class="num">${g.rocAucTest ?? "—"}</td><td class="num">${g.prAucTest ?? "—"}</td></tr>`,
    )
    .join("");
}

function logisticCoefBlocks(modeling) {
  if (!modeling?.models) {
    return `<p><strong>Equações estimadas:</strong> artefato <code>modeling_results_etapa4.json</code> indisponível neste ambiente. Não apresentamos coeficientes inventados.</p>`;
  }
  const ids = ["A", "B", "C", "D", "E"];
  return ids
    .map((id) => {
      const m = modeling.models[id];
      if (!m) return "";
      const coefRows = (m.coef_top || [])
        .map((c) => `<tr><td><code>${escHtml(c.feature)}</code></td><td class="num">${Number(c.coef).toFixed(4)}</td></tr>`)
        .join("");
      return `<h3>Modelo ${id} — ${escHtml(m.label || "")}</h3>
        <p>Variáveis de entrada (pipeline congelado): ${escHtml((m.features || []).join(", ") || "—")}</p>
        <p class="note">Estrutura geral: P(churn 90d | X) = 1 / (1 + exp(−z)), z = β₀ + Σ βᵢXᵢ. O intercepto β₀ e transformações (escala, codificação) não estão exportados neste artefato — abaixo, coeficientes lineares principais (<code>coef_top</code>) do modelo treinado.</p>
        <table><thead><tr><th>Termo</th><th class="num">β estimado</th></tr></thead><tbody>${coefRows || "<tr><td colspan='2'>—</td></tr>"}</tbody></table>`;
    })
    .join("");
}

const OPERATIONAL_LIMITS = [
  {
    title: "Histórico temporal curto",
    text: "Poucos meses com rótulo completo de 90 dias restringe a estabilidade das taxas e a generalização dos modelos.",
  },
  {
    title: "Hold-out temporal estreito",
    text: "Um único bloco de teste (ex.: mês congelado) não substitui validação prospectiva repetida.",
  },
  {
    title: "Sobreposição de clientes treino/teste",
    text: "Observações do mesmo cliente em meses distintos podem aparecer em treino e teste — inflaciona confiança se interpretado como clientes independentes.",
  },
  {
    title: "Sem validação prospectiva independente",
    text: "Não há acompanhamento forward aprovado — uso operacional individual permanece proibido.",
  },
  {
    title: "Cobertura de reuniões e mecanismos",
    text: "Parte da base sem reuniões ou sem vínculo de mecanismos limita a interpretação de E e M no passado.",
  },
  {
    title: "Qualidade informacional heterogênea",
    text: "Migrações cadastrais e histórico insuficiente distorcem comparações entre clientes.",
  },
  {
    title: "Conflitos de data de churn",
    text: "Indícios e datas divergentes exigem governança — afeta rótulos Y.",
  },
  {
    title: "Calibração não confirmada",
    text: "Probabilidades estimadas no hold-out não foram calibradas para uso em produção.",
  },
];

function renderStudyV16ReportSection(study) {
  if (!study || study.status !== "ok") {
    return `<h3>Etapa 16</h3><p class="note">Resultado da Etapa 16 pendente ou indisponível neste ambiente — números não foram estimados neste relatório.</p>`;
  }
  const tv = study.temporal_validation || {};
  const rec = study.recommendation || {};
  const lim = study.operational_limitations || {};
  const models = (study.models_compared || [])
    .map((c) => {
      const t = c.test || {};
      return `<tr><td>${escHtml(c.id)}</td><td class="num">${t.roc_auc ?? "—"}</td><td class="num">${t.pr_auc ?? "—"}</td><td class="num">${t.brier ?? "—"}</td></tr>`;
    })
    .join("");
  const packs = (study.feature_pack_comparison || [])
    .filter((p) => !p.skipped)
    .map((p) => `<tr><td>${escHtml(p.pack_id)}</td><td class="num">${p.inner_val_roc_auc ?? "—"}</td></tr>`)
    .join("");
  const limRows = (lim.limitations_demonstrated || [])
    .map((l) => `<li><strong>${escHtml(l.limitation)}</strong>: ${escHtml(l.evidence)} — ${escHtml(l.impact)}</li>`)
    .join("");
  return `<h2>Etapa 16 — Modelagem avançada (relatório definitivo)</h2>
<p><strong>Objetivo:</strong> ${escHtml(study.objective?.goal || "Churn 90d")} · hold-out exploratório: ${escHtml(tv.holdout_month || "—")} · jun/2026: ${escHtml(tv.june_2026_role || "referência")}.</p>
<h3>Dados e churn</h3>
<ul>
  <li>Observações elegíveis: ${study.dataset_audit?.observations_eligible_90d ?? "—"}</li>
  <li>Episódios churn_consolidado: ${study.dataset_audit?.churn_episode_rows ?? "—"}</li>
  <li>Clientes únicos: ${study.dataset_audit?.unique_clients_in_model_frame ?? "—"}</li>
  <li>Nota: reactivated_proxy pre_audit (${study.dataset_audit?.pre_audit_crosswalk?.reactivated_proxy_multi_month_span ?? "—"}) ≠ episódios de churn</li>
</ul>
<h3>Engenharia de variáveis</h3>
<p>Pacote selecionado: ${escHtml(study.selected_feature_pack?.id || "—")}</p>
<table><thead><tr><th>Pacote</th><th class="num">ROC val. interna</th></tr></thead><tbody>${packs || "—"}</tbody></table>
<h3>Validação temporal</h3>
<p>${escHtml(tv.split_note || "")}</p>
<h3>Comparação de modelos</h3>
<table><thead><tr><th>Modelo</th><th class="num">ROC</th><th class="num">PR</th><th class="num">Brier</th></tr></thead><tbody>${models}</tbody></table>
<p>${escHtml(rec.rationale || "")} · Status: ${escHtml(rec.validation_status || "exploratory")}</p>
<h3>Limitações e uso operacional</h3>
${lim.show_highlight ? `<p><strong>${escHtml(lim.title || "")}</strong></p>` : ""}
<ul>${limRows}</ul>
<p>${escHtml(lim.executive_conclusion || "")}</p>
<p class="note">Hash dataset: ${escHtml(study.manifest?.dataset_hash_sha256_16 || "—")} · ${escHtml(study.manifest?.processed_at || study.generatedAt || "")}</p>`;
}

function renderStudyV15ReportSection(study) {
  if (!study || study.status !== "ok") {
    return `<h3>Etapa 15</h3><p class="note">Diagnóstico Etapa 15 indisponível — comparação alinhada E vs V2 não incluída.</p>`;
  }
  const fair = study.fair_comparison || {};
  const e = fair.model_E_refit || {};
  const v2 = fair.model_V2_logistic_refit || {};
  const p = fair.paired_v2_minus_E_auc || {};
  const bullets = (study.diagnosis?.bullets || []).map((t) => `<li>${escHtml(t.replace(/\*\*/g, ""))}</li>`).join("");
  return `<h2>Anexo — Por que o modelo ainda não melhorou? (Etapa 15)</h2>
<p>Comparação justa: treino/teste alinhados à Etapa 4 · C fixo · sem tuning em jun/2026.</p>
<table><thead><tr><th>Modelo</th><th class="num">ROC</th><th class="num">PR</th><th class="num">Brier</th><th class="num">Log loss</th></tr></thead>
<tbody>
<tr><td>E refit</td><td class="num">${e.roc_auc ?? "—"}</td><td class="num">${e.pr_auc ?? "—"}</td><td class="num">${e.brier ?? "—"}</td><td class="num">${e.log_loss ?? "—"}</td></tr>
<tr><td>V2 refit</td><td class="num">${v2.roc_auc ?? "—"}</td><td class="num">${v2.pr_auc ?? "—"}</td><td class="num">${v2.brier ?? "—"}</td><td class="num">${v2.log_loss ?? "—"}</td></tr>
</tbody></table>
<p>V2−E AUC (bootstrap cliente): ${p.diff_mean ?? "—"} · IC95% [${p.ci_low ?? "—"}, ${p.ci_high ?? "—"}]</p>
<ul>${bullets}</ul>
<p>${escHtml(study.methodological_recommendation || "")}</p>`;
}

function renderStudyV2ReportSection(studyV2) {
  if (!studyV2 || studyV2.status !== "ok") {
    return "";
  }
  const m = studyV2.manifest || {};
  const base = studyV2.baseline_etapa4?.test || {};
  const rows = (studyV2.candidates || [])
    .map((c) => {
      const t = c.test || {};
      return `<tr><td>${escHtml(c.id)}</td><td class="num">${t.roc_auc ?? "—"}</td><td class="num">${t.pr_auc ?? "—"}</td><td class="num">${t.brier ?? "—"}</td><td class="num">${t.log_loss ?? "—"}</td></tr>`;
    })
    .join("");
  const audit = (studyV2.audit?.conclusions || []).slice(0, 6).map((t) => `<li>${escHtml(t)}</li>`).join("");
  const sel = studyV2.selection || {};
  return `<h2>Anexo — Estudo Preditivo 2.0 (${escHtml(m.state || "exploratory")})</h2>
<p>Processado: ${escHtml(m.processed_at || studyV2.generatedAt || "—")} · hash dataset ${escHtml(m.dataset_hash_sha256_16 || "—")}</p>
<p><strong>Baseline Etapa 4 (${escHtml(studyV2.baseline_etapa4?.model_id || "—")}):</strong> ROC ${base.roc_auc ?? "—"}, PR ${base.pr_auc ?? "—"}, Brier ${base.brier ?? "—"}.</p>
<table><thead><tr><th>Candidato</th><th class="num">ROC</th><th class="num">PR</th><th class="num">Brier</th><th class="num">Log loss</th></tr></thead><tbody>${rows}</tbody></table>
<p>${escHtml(sel.rationale || "")}</p>
<ul>${audit}</ul>
<p class="note">Jun/2026 não é teste confirmatório. Sem probabilidade individual publicada. Aprovação: ${escHtml(m.approval || "none")}.</p>`;
}

export function buildPredictiveExecutiveReportHtml(panorama, weights, artifacts = {}) {
  if (!panorama?.kpis) {
    return {
      ok: false,
      error: "Dados do estudo indisponíveis. Carregue o Panorama no Laboratório Preditivo.",
      title: "Laboratório Preditivo",
      bodyHtml: "",
    };
  }
  const k = panorama.kpis;
  const d = panorama.descriptive || {};
  const modeling = artifacts.modeling || null;
  const pre = artifacts.preAudit || null;
  const labPack = artifacts.labPack || panorama.labReference || {};
  const ref = labPack.referenceModel || {};
  const refJune = ref.metrics?.june2026Exploratory || null;
  const refV16 = ref.metrics?.v16Holdout || null;
  const refM = refJune
    ? { roc_auc: refJune.rocAuc, pr_auc: refJune.prAuc, brier: refJune.brier, n: refJune.n, prevalence: refJune.prevalence }
    : modeling?.models?.E?.test || {};
  const selection = labPack.selection || {};
  const v15 = labPack.etapa15 || (artifacts.studyV15?.status === "ok" ? { status: "ok", pairedAucDiff: artifacts.studyV15.fair_comparison?.paired_v2_minus_E_auc, eRefit: artifacts.studyV15.fair_comparison?.model_E_refit, v2Refit: artifacts.studyV15.fair_comparison?.model_V2_logistic_refit, summary: "Ver artefato Etapa 15." } : { status: "pending" });
  const v16 = labPack.etapa16 || (artifacts.studyV16?.status === "ok" ? { status: "ok", recommendation: artifacts.studyV16.recommendation, holdout: artifacts.studyV16.temporal_validation?.holdout_month } : { status: "pending" });
  const v17 = labPack.etapa17 || (artifacts.studyV17?.status === "ok" ? { status: "ok", conclusionSummary: artifacts.studyV17.conclusion_abc?.summary, conclusionLetter: artifacts.studyV17.conclusion_abc?.letter, experiments: artifacts.studyV17.experiments } : { status: "pending" });
  const date = panorama.generatedAt ? new Date(panorama.generatedAt).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR");
  const conclusion = buildExecutiveConclusion(panorama);
  const reconRows = (panorama.datasetReconciliation?.rows || [])
    .map(
      (r) =>
        `<tr><td>${escHtml(r.label)}</td><td class="num">${r.observations ?? "—"}</td><td class="num">${r.rate != null ? pct(r.rate) : "—"}</td><td>${escHtml(r.population)}</td></tr>`,
    )
    .join("");
  const limitsPlain = LIMITATIONS_PLAIN.map((l) => `<li>${escHtml(l)}</li>`).join("");
  const opLimits = OPERATIONAL_LIMITS.map((x) => `<li><strong>${escHtml(x.title)}:</strong> ${escHtml(x.text)}</li>`).join("");
  const profiles = (panorama.profiles || [])
    .slice(0, 10)
    .map(
      (p) =>
        `<tr><td>${escHtml(String(p.id || "").replace(/_/g, " "))}</td><td class="num">${p.observations ?? "—"}</td><td class="num">${pct(p.churnRate)}</td></tr>`,
    )
    .join("");
  const splitNote = modeling?.split?.note ? escHtml(modeling.split.note) : "—";
  const overlap = modeling?.split?.client_overlap;
  const overlapText = overlap
    ? `Treino×teste: ${overlap.train_test ?? "—"} clientes sobrepostos (observações repetidas).`
    : "—";

  const body = `
<nav class="toc no-print"><strong>Sumário</strong><ol>
<li>Resumo para sócios</li><li>Objetivo e horizonte</li><li>Fontes e qualidade</li><li>Fórmula do HS</li><li>Modelo preditivo</li><li>Variáveis</li><li>Referência e justificativa</li><li>Faixas históricas</li><li>Comparação válida</li><li>Etapas 15 e 16</li><li>Calibração</li><li>Limitações</li><li>Não operacional</li><li>Plano de aperfeiçoamento</li><li>Conclusão</li><li>Apêndice estatístico</li>
</ol></nav>

<section class="cover">
  <p class="eyebrow">Health Analytics</p>
  <h1>Estudo Preditivo de Churn</h1>
  <p class="meta">Relatório executivo · ${escHtml(date)}</p>
  <p class="meta">Versão: pesquisa experimental congelada · Panorama ${escHtml(panorama.versionKey || "—")}</p>
  <p class="meta">Período histórico analisado: ${escHtml(k.evaluationPeriod || "export validado")} · Horizonte ${k.horizonDays ?? 90} dias</p>
  <p class="tag-experimental-cover">Estudo experimental — não operacional</p>
</section>

<h2>1. Resumo para sócios</h2>
<p><strong>Objetivo:</strong> entender se sinais históricos de relacionamento (E, M, HS) associam-se ao cancelamento nos 90 dias seguintes — pesquisa agregada, sem score de risco por cliente.</p>
<ul>
  <li><strong>Observações rotuladas (pre_audit):</strong> ${k.observationsLabeled90d ?? "—"} · taxa histórica ${pct(k.observedChurnRate90d)} por linha cliente-mês.</li>
  <li><strong>Referência experimental:</strong> Modelo ${escHtml(selection.chosenId || k.referenceModelId || "E")} — ${escHtml(selection.status || "baseline_experimental")}, não operacional.</li>
  <li><strong>Etapas 15/16:</strong> ${escHtml(selection.rationale || v16.recommendation?.rationale || "Alternativas testadas; ver seções 10–11.")}</li>
  <li><strong>Decisão:</strong> HS operacional V1 50/50 permanece; previsão individual de churn não publicada.</li>
</ul>
<p>${escHtml(conclusion)}</p>

<h2>2. Objetivo e horizonte de 90 dias</h2>
<p><strong>Churn</strong> (cancelamento) é a saída efetiva do cliente do relacionamento contratual, registrada no histórico analisado.</p>
<p><strong>Health Score (HS)</strong> resume, em 0–100, engajamento em reuniões (E) e mecanismos implantados (M) — indicador de relacionamento, não probabilidade de cancelamento.</p>
<p>Antecipar sinais de fragilidade ajuda a priorizar contato humano, mas <strong>associação no passado ≠ previsão validada para cada cliente hoje</strong>.</p>
<p>Analisar um <strong>horizonte de 90 dias</strong> pergunta: “nos 90 dias após esta data de referência, houve churn confirmado?” Observações sem janela completa são <strong>censuradas</strong> — não entram como Y=0 automático.</p>

<h2>3. Fontes e qualidade dos dados</h2>
<ul>
  <li>Clientes únicos (export): ${pre?.unique_clients_all ?? k.uniqueClientsResearch ?? "—"}</li>
  <li>Observações históricas com HS (pre_audit): ${k.observationsHistorical ?? "—"}</li>
  <li>Observações rotuladas 90d (pre_audit): ${k.observationsLabeled90d ?? "—"} · positivas ${k.churnEvents90d ?? pre?.positive_rows_90d ?? "—"}</li>
  <li>Censuradas: ${k.censored90d ?? "—"} · conflitos de data: ${pre?.date_conflict_clients ?? "—"} clientes</li>
  <li>Manifesto Panorama: ${escHtml(panorama.versionKey || "—")} · hash Etapa 16: ${escHtml(v16.status === "ok" ? v16.datasetHash || panorama.datasetReconciliation?.manifest?.datasetHashV16 : "—")}</li>
</ul>
<h3>Reconciliação de denominadores</h3>
<table><thead><tr><th>Fonte</th><th class="num">Obs.</th><th class="num">Taxa</th><th>População</th></tr></thead><tbody>${reconRows || "—"}</tbody></table>
<p class="note">Não misturar 12.596 rotuladas (~30,6%) com 14.609 do frame Etapa 16 (~28,2%) ou ~18.638 linhas HS — cada linha da tabela declara população e uso.</p>
<p>Fontes: ${escHtml(panorama.dataSources?.csv || "CSV validado")}; ${escHtml(panorama.dataSources?.modeling || "modelagem congelada")}; ${escHtml(panorama.dataSources?.preAudit || "pre_audit.json")}.</p>

<h2>4. Fórmula do Health Score (histórico na pesquisa)</h2>
<p class="formula-block"><strong>HS = 0,50 × E + 0,50 × M</strong></p>
<p><strong>E (Engajamento):</strong> derivado da frequência de reuniões válidas (regras V1 — faixas 0 / 20 / 60 / 100 conforme média mensal).</p>
<p><strong>M (Mecanismos):</strong> quantidade implantada (0 / 60 / 100 conforme 0, 1–2 ou ≥3 mecanismos).</p>
<p>Ausência de reuniões e de mecanismos produz notas baixas — distinto de “alto risco preditivo”.</p>
<p>O painel operacional permite simular outros pesos E/M; <strong>experimentos históricos usaram HS 50/50 congelado</strong> (pesos operacionais atuais: ${weights?.engagement ?? 50}% / ${weights?.mechanism ?? 50}%).</p>

<h2>5. Fórmula e tipo do modelo preditivo de referência</h2>
<p><strong>Tipo:</strong> ${escHtml(ref.algorithm || "Regressão logística L2")}</p>
<p class="formula-block">${escHtml(ref.formula || "P(churn 90d | X) = 1 / (1 + exp(−z)), z = β₀ + Σ βᵢ Xᵢ")}</p>
<p>${escHtml(ref.statusPlain || "Baseline experimental congelado — não operacional.")}</p>

<h2>6. Variáveis efetivamente utilizadas (Modelo E)</h2>
<p><strong>Numéricas:</strong> ${escHtml((ref.features?.numeric || []).join(", ") || "engajamento, reuniões, mecanismos, recência")}</p>
<p><strong>Categóricas:</strong> ${escHtml((ref.features?.categorical || []).join(", ") || "programa")}</p>
<p class="note">NPS e suporte operacional ainda não integrados historicamente no export point-in-time.</p>

<h2>7. Modelo de referência e justificativa</h2>
<p>${escHtml(labPack.whyChosenPlain || "Modelo E combina cadastro estruturado, engajamento e mecanismos.")}</p>
<p><strong>Decisão (Etapa 16 quando disponível):</strong> ${escHtml(selection.rationale || "—")}</p>
<h3>Métricas Modelo E — hold-out jun/2026 (Etapa 4, exploratório)</h3>
<table><thead><tr><th>Métrica</th><th class="num">Valor</th></tr></thead>
<tbody>
<tr><td>ROC-AUC</td><td class="num">${refM.roc_auc ?? "—"}</td></tr>
<tr><td>PR-AUC</td><td class="num">${refM.pr_auc ?? "—"}</td></tr>
<tr><td>Brier</td><td class="num">${refM.brier ?? "—"}</td></tr>
<tr><td>n teste</td><td class="num">${refM.n ?? modeling?.sample?.test ?? "—"}</td></tr>
</tbody></table>
${refV16 ? `<h3>Métricas Modelo E — hold-out ${escHtml(refV16.period || v16.holdout || "Etapa 16")} (separado — não somar com jun/2026)</h3>
<table><thead><tr><th>Métrica</th><th class="num">Valor</th></tr></thead>
<tbody>
<tr><td>ROC-AUC</td><td class="num">${refV16.rocAuc ?? "—"}</td></tr>
<tr><td>PR-AUC</td><td class="num">${refV16.prAuc ?? "—"}</td></tr>
<tr><td>Brier</td><td class="num">${refV16.brier ?? "—"}</td></tr>
<tr><td>n teste</td><td class="num">${refV16.n ?? "—"}</td></tr>
</tbody></table>` : ""}

<h2>8. Resultados históricos por faixa (descritivo)</h2>
<p class="note">Recorte gráficos: ${escHtml(d.filterLabel || "export validado")} · ${d.observations ?? "—"} observações somadas nas faixas abaixo.</p>
${bandTable(d.hsBands, "Churn observado por faixa de HS")}
${bandTable(d.eBands, "Churn observado por faixa de E")}
${bandTable(d.mBands, "Churn observado por faixa de M")}
<h3>Perfis exploratórios</h3>
<table><thead><tr><th>Perfil</th><th class="num">Obs.</th><th class="num">Taxa obs.</th></tr></thead><tbody>${profiles || "—"}</tbody></table>
<p class="note">Gráficos do dashboard resumem estas faixas — taxas são históricas e agregadas.</p>

<h2>9. Comparação metodologicamente válida (A–E, hold-out Etapa 4)</h2>
<p>Comparação exploratória no mesmo split — não implica aprovação operacional.</p>
<table><thead><tr><th>ID</th><th>Descrição</th><th class="num">ROC-AUC</th><th class="num">PR-AUC</th><th class="num">IC ROC*</th><th class="num">n teste</th></tr></thead><tbody>${modelComparisonTable(panorama) || "—"}</tbody></table>
<p class="note">* Bootstrap por cliente quando disponível. ${splitNote}</p>
<p>${escHtml(overlapText)}</p>

<h2>10. Resultados Etapas 15 e 16</h2>
${v15.status === "ok" ? `<p>${escHtml(v15.summary || "")}</p><p>V2−E AUC: ${v15.pairedAucDiff?.diff_mean ?? "—"} · IC [${v15.pairedAucDiff?.ci_low ?? "—"}, ${v15.pairedAucDiff?.ci_high ?? "—"}]</p>` : `<p class="note">Etapa 15: ${escHtml(v15.summary || "pendente")}</p>`}
${v16.status === "ok" ? `<p>Etapa 16 — hold-out ${escHtml(v16.holdout || "—")}: ${escHtml(v16.recommendation?.rationale || "")}</p>` : `<p class="note">Etapa 16: ${escHtml(v16.summary || "pendente")}</p>`}
${renderStudyV15ReportSection(artifacts.studyV15)}
${renderStudyV16ReportSection(artifacts.studyV16)}

<h2>11. Avaliação de calibração (Etapa 17)</h2>
${v17.status === "ok" ? `<p><strong>Conclusão ${escHtml(v17.conclusionLetter || "—")}:</strong> ${escHtml(v17.conclusionSummary || "")}</p>
<p>${escHtml(labPack.etapa17?.diagnosis?.class_weight_balanced || "")}</p>
<table><thead><tr><th>Variante</th><th class="num">ROC-AUC</th><th class="num">Brier</th><th class="num">Log loss</th><th class="num">Prevalência</th><th class="num">Média prevista</th></tr></thead><tbody>${(v17.experiments || []).map((e) => `<tr><td>${escHtml(e.label || e.id)}</td><td class="num">${e.rocAuc ?? e.test?.roc_auc ?? "—"}</td><td class="num">${e.brier ?? e.test?.brier ?? "—"}</td><td class="num">${e.logLoss ?? e.test?.log_loss ?? "—"}</td><td class="num">${e.prevalence != null ? pct(e.prevalence) : "—"}</td><td class="num">${e.probMean != null ? pct(e.probMean) : "—"}</td></tr>`).join("")}</tbody></table>
<p class="note">${escHtml(labPack.etapa17?.temporalNote || "Jun/jul 2026 não são novos testes confirmatórios; calibração ajustada só na validação interna.")}</p>` : `<p>Brier Modelo E (jun/2026 Etapa 4): <strong>${refM.brier ?? "—"}</strong>. Etapa 17 pendente — execute npm run model:study-v17.</p>`}
<p>Probabilidades individuais não publicadas. HS operacional V1 50/50 inalterado.</p>

<h2>12. Limitações dos dados e impactos</h2>
<ul>${opLimits}</ul>
<ul>${limitsPlain}</ul>

<h2>13. Por que o modelo não está operacional</h2>
<p>Histórico curto, dependência entre meses do mesmo cliente, implantação vs pós-implantação, mecanismos e reuniões incompletos, NPS/suporte ausentes, conflitos de churn e ausência de validação prospectiva independente impedem publicar probabilidade individual confiável.</p>

<h2>14. Plano de aperfeiçoamento</h2>
<ul>${(labPack.improvementRoadmap || [{ step: "Dados", text: "Export point-in-time: NPS, suporte, tenure contratual." }, { step: "Validação", text: "Meses novos congelados, sem reutilizar hold-out final." }, { step: "Calibração", text: "Recalibração e monitoramento de drift." }, { step: "Governança", text: "Estratificação por fase com amostra suficiente." }]).map((r) => `<li><strong>${escHtml(r.step)}:</strong> ${escHtml(r.text)}</li>`).join("")}</ul>

<h2>15. Conclusão executiva</h2>
<p>${escHtml(conclusion)} O Modelo E permanece referência experimental; o HS V1 50/50 continua indicador operacional.</p>

<h2>16. Apêndice estatístico</h2>
${logisticCoefBlocks(modeling)}
<p>Experimentos A–E: A engajamento · B mecanismos · C HS · D estruturados · E combinado (referência).</p>
<p>${escHtml(panorama.methodologyNote || modeling?.split?.note || "Ver pre_audit.json e modeling_results_etapa4.json.")}</p>
<ul>
  <li>Elegibilidade: ${escHtml(modeling?.problem?.population || "elegivel_modelagem_90d")}</li>
  <li>Horizonte: ${modeling?.problem?.horizon_days ?? 90} dias</li>
  <li>Treino / teste (meses): ${escHtml((modeling?.split?.train_months || []).join(", "))} → ${escHtml((modeling?.split?.test_months || []).join(", "))}</li>
  <li>Amostra teste: ${modeling?.sample?.test ?? "—"} linhas; prevalência ${pct(modeling?.sample?.prevalence_test)}</li>
  <li>Seed / sklearn: ${escHtml(modeling?.environment?.sklearn || "—")}</li>
</ul>
<p class="footer">Health Analytics 3.0 · Estudo experimental · Gerado ${escHtml(date)}</p>`;

  return {
    ok: true,
    title: "Estudo Preditivo de Churn — Relatório executivo",
    bodyHtml: body,
    filename: "health-analytics-estudo-preditivo-churn",
  };
}
