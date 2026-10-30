/**
 * Relatório executivo — Laboratório Preditivo (Health Analytics).
 * Estrutura acadêmica no apêndice; comunicação executiva no corpo.
 */
import { LIMITATIONS_PLAIN } from "../../research-executive.mjs";

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

function num3(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return Number(v).toFixed(3).replace(".", ",");
}

function bandTable(bands, title) {
  const rows = (bands || [])
    .filter((b) => b.band !== "insuficiente")
    .map(
      (b) =>
        `<tr><td>${escHtml(b.band)}</td><td class="num">${b.n ?? "—"}</td><td class="num">${pct(b.churnRate)}</td></tr>`,
    )
    .join("");
  return `<h4>${escHtml(title)}</h4><table class="table-compact"><thead><tr><th>Faixa</th><th class="num">Obs.</th><th class="num">Churn obs. 90d</th></tr></thead><tbody>${rows || "<tr><td colspan='3'>—</td></tr>"}</tbody></table>`;
}

function modelComparisonTable(panorama) {
  return (panorama.models || [])
    .map((m) => {
      const ci =
        m.ciLow != null && m.ciHigh != null
          ? `${Number(m.ciLow).toFixed(3)} – ${Number(m.ciHigh).toFixed(3)}`
          : "—";
      return `<tr><td>${escHtml(m.id)}</td><td>${escHtml(m.label || "—")}</td><td class="num">${num3(m.rocAuc)}</td><td class="num">${num3(m.prAuc)}</td><td class="num">${ci}</td><td class="num">${m.nTest ?? "—"}</td></tr>`;
    })
    .join("");
}

function logisticCoefBlocks(modeling) {
  if (!modeling?.models) {
    return `<p>Coeficientes: artefato <code>modeling_results_etapa4.json</code> indisponível.</p>`;
  }
  return ["A", "B", "C", "D", "E"]
    .map((id) => {
      const m = modeling.models[id];
      if (!m) return "";
      const coefRows = (m.coef_top || [])
        .map((c) => `<tr><td><code>${escHtml(c.feature)}</code></td><td class="num">${Number(c.coef).toFixed(4)}</td></tr>`)
        .join("");
      return `<h4>Modelo ${id} — ${escHtml(m.label || "")}</h4>
        <table class="table-compact"><thead><tr><th>Termo</th><th class="num">β</th></tr></thead><tbody>${coefRows || "<tr><td colspan='2'>—</td></tr>"}</tbody></table>`;
    })
    .join("");
}

function renderAppendixV15(study) {
  if (!study || study.status !== "ok") {
    return `<h3>Etapa 15</h3><p class="note">Artefato indisponível.</p>`;
  }
  const fair = study.fair_comparison || {};
  const e = fair.model_E_refit || {};
  const v2 = fair.model_V2_logistic_refit || {};
  const p = fair.paired_v2_minus_E_auc || {};
  return `<h3>Etapa 15 — comparação alinhada E vs V2</h3>
<table><thead><tr><th>Modelo</th><th class="num">ROC</th><th class="num">PR</th><th class="num">Brier</th></tr></thead>
<tbody>
<tr><td>E refit</td><td class="num">${num3(e.roc_auc)}</td><td class="num">${num3(e.pr_auc)}</td><td class="num">${num3(e.brier)}</td></tr>
<tr><td>V2 refit</td><td class="num">${num3(v2.roc_auc)}</td><td class="num">${num3(v2.pr_auc)}</td><td class="num">${num3(v2.brier)}</td></tr>
</tbody></table>
<p>V2−E AUC: ${num3(p.diff_mean)} · IC95% [${num3(p.ci_low)}, ${num3(p.ci_high)}]</p>
<p>${escHtml(study.methodological_recommendation || "")}</p>`;
}

function renderAppendixV16(study) {
  if (!study || study.status !== "ok") {
    return `<h3>Etapa 16</h3><p class="note">Artefato indisponível.</p>`;
  }
  const tv = study.temporal_validation || {};
  const models = (study.models_compared || [])
    .map((c) => {
      const t = c.test || {};
      return `<tr><td>${escHtml(c.id)}</td><td class="num">${num3(t.roc_auc)}</td><td class="num">${num3(t.pr_auc)}</td><td class="num">${num3(t.brier)}</td></tr>`;
    })
    .join("");
  return `<h3>Etapa 16 — validação temporal</h3>
<p>Hold-out: ${escHtml(tv.holdout_month || "—")} · ${escHtml(tv.june_2026_role || "")}</p>
<p class="note">${escHtml(tv.split_note || "")}</p>
<table><thead><tr><th>Modelo</th><th class="num">ROC</th><th class="num">PR</th><th class="num">Brier</th></tr></thead><tbody>${models}</tbody></table>
<p>${escHtml(study.recommendation?.rationale || "")}</p>
<p class="note">Hash: ${escHtml(study.manifest?.dataset_hash_sha256_16 || "—")}</p>`;
}

function renderAppendixV17(v17Raw, labE17) {
  if (!v17Raw || v17Raw.status !== "ok") {
    return `<h3>Etapa 17</h3><p class="note">${escHtml(labE17?.summary || "Execute npm run model:study-v17.")}</p>`;
  }
  const rows = (v17Raw.experiments || [])
    .map((e) => {
      const t = e.test || {};
      return `<tr><td>${escHtml(e.label || e.id)}</td><td class="num">${num3(t.roc_auc)}</td><td class="num">${num3(t.brier)}</td><td class="num">${num3(t.log_loss)}</td><td class="num">${pct(t.prevalence)}</td><td class="num">${pct(t.probability_summary?.prob_mean)}</td></tr>`;
    })
    .join("");
  const c = v17Raw.conclusion_abc || {};
  return `<h3>Etapa 17 — calibração (detalhe)</h3>
<p><strong>Conclusão ${escHtml(c.letter || "—")}:</strong> ${escHtml(c.summary || "")}</p>
<p class="note">${escHtml(v17Raw.temporal_audit?.note || "")}</p>
<table><thead><tr><th>Variante</th><th class="num">ROC</th><th class="num">Brier</th><th class="num">Log loss</th><th class="num">Prev. teste</th><th class="num">Média prevista</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function buildVersionBlock(labPack, panorama, artifacts) {
  const src = labPack.sources || {};
  const lines = [
    `Gerado: ${new Date().toLocaleString("pt-BR")}`,
    `Panorama: ${panorama.versionKey || "—"}`,
    src.etapa4?.ok ? `Etapa 4: ${src.etapa4.path} (${src.etapa4.versionKey || "ok"})` : "Etapa 4: ausente",
    src.v15?.ok ? `Etapa 15: ok` : "Etapa 15: ausente",
    src.v16?.ok ? `Etapa 16: ${src.v16.versionKey || "ok"}` : "Etapa 16: ausente",
    src.v17?.ok ? `Etapa 17: ${src.v17.versionKey || "ok"}` : "Etapa 17: ausente",
  ];
  if (artifacts.modeling?.generatedAt) lines.push(`Modelagem Etapa 4: ${artifacts.modeling.generatedAt}`);
  return lines.map((l) => escHtml(l)).join("<br/>");
}

function pickExperiment(experiments, id) {
  const list = experiments || [];
  const raw = list.find((e) => e.id === id);
  if (!raw) return null;
  const t = raw.test || raw;
  return {
    roc: t.roc_auc ?? raw.rocAuc,
    pr: t.pr_auc ?? raw.prAuc,
    brier: t.brier ?? raw.brier,
    n: t.n ?? raw.n,
    prevalence: t.prevalence ?? raw.prevalence,
    probMean: t.probability_summary?.prob_mean ?? raw.probMean,
  };
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
  const v15Lab = labPack.etapa15;
  const v16Lab = labPack.etapa16;
  const v17Lab = labPack.etapa17;
  const v17Raw = artifacts.studyV17?.status === "ok" ? artifacts.studyV17 : null;
  const opAudit = labPack.operationalAudit || {};

  const junRoc = refM.roc_auc ?? refJune?.rocAuc;
  const junPr = refM.pr_auc ?? refJune?.prAuc;
  const junBrier = refM.brier ?? refJune?.brier;
  const julRoc = refV16?.rocAuc;
  const julPr = refV16?.prAuc;
  const julBrier = refV16?.brier;

  const v17Diag = v17Lab?.diagnosis || v17Raw?.diagnosis || {};
  const v17Prev = v17Diag.test_prevalence ?? v17Diag.probability_summary_E_balanced?.prevalence_observed;
  const v17Mean = v17Diag.probability_summary_E_balanced?.prob_mean;
  const v17Letter = v17Lab?.conclusionLetter || v17Raw?.conclusion_abc?.letter;
  const v17Summary = v17Lab?.conclusionSummary || v17Raw?.conclusion_abc?.summary;

  const reconRows = (panorama.datasetReconciliation?.rows || [])
    .map(
      (r) =>
        `<tr><td>${escHtml(r.label)}</td><td class="num">${r.observations ?? "—"}</td><td class="num">${r.rate != null ? pct(r.rate) : "—"}</td><td>${escHtml(r.population)}</td></tr>`,
    )
    .join("");

  const dateLabel = panorama.generatedAt
    ? new Date(panorama.generatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("pt-BR");

  const body = `
<header class="report-running-header">
  <span class="brand">Health Analytics · QuartaVia</span>
  <span class="doc-title">Estudo preditivo de churn</span>
</header>

<nav class="toc no-print" aria-label="Sumário">
  <p class="toc-title">Sumário</p>
  <ol>
    <li>Resumo executivo</li>
    <li>Contextualização e objetivo</li>
    <li>Dados e indicadores</li>
    <li>Modelo estatístico</li>
    <li>Principais resultados</li>
    <li>Avaliação de calibração (Etapa 17)</li>
    <li>Por que ainda não atingimos o resultado esperado?</li>
    <li>Base histórica e infraestrutura</li>
    <li>Perspectivas de modelagem</li>
    <li>Plano de evolução</li>
    <li>Conclusão executiva</li>
    <li>Apêndice técnico</li>
  </ol>
</nav>

<section class="cover page-break-after">
  <p class="eyebrow">Health Analytics 3.0</p>
  <h1>Estudo preditivo de churn</h1>
  <p class="cover-sub">Relatório executivo para sócios</p>
  <p class="meta">Referência: ${escHtml(dateLabel)} · Horizonte ${k.horizonDays ?? 90} dias · Pesquisa experimental</p>
  <p class="meta version-line">${buildVersionBlock(labPack, panorama, artifacts)}</p>
  <div class="tag-experimental-cover">Sem probabilidades individuais publicadas · HS operacional V1 50/50 inalterado</div>
</section>

<section class="report-section" id="sec-1">
  <h2>1. Resumo executivo</h2>
  <div class="callout callout-primary">
    <p><strong>Mensagem central:</strong> a pesquisa identificou sinais associados ao churn e modelos com discriminação moderada no histórico analisado, porém <strong>ainda não há validação suficiente para uso operacional de probabilidades individuais</strong>.</p>
  </div>
  <div class="kpi-cards">
    <article class="kpi-card"><span class="kpi-label">Modelo de referência</span><span class="kpi-value">Modelo E</span><span class="kpi-hint">Regressão logística L2</span></article>
    <article class="kpi-card"><span class="kpi-label">ROC-AUC (jul/2026)*</span><span class="kpi-value">${num3(julRoc ?? junRoc)}</span><span class="kpi-hint">*exploratório, não acurácia</span></article>
    <article class="kpi-card"><span class="kpi-label">Obs. rotuladas 90d</span><span class="kpi-value">${k.observationsLabeled90d ?? pre?.labeled_rows_90d ?? "—"}</span><span class="kpi-hint">pre_audit (cliente-mês)</span></article>
    <article class="kpi-card"><span class="kpi-label">Etapa 17</span><span class="kpi-value">${v17Letter ? `Conclusão ${escHtml(v17Letter)}` : "Pendente"}</span><span class="kpi-hint">Calibração probabilística</span></article>
  </div>
  <ul class="executive-list">
    <li><strong>Objetivo:</strong> antecipar, com rigor estatístico, cancelamentos em 90 dias a partir de engajamento, mecanismos e cadastro — sem substituir o Health Score operacional.</li>
    <li><strong>Desenvolvido:</strong> pipeline de export validado, estudos Etapas 4–17, laboratório com quatro abas, relatório versionado e schema <code>_dash_health_score</code> para snapshots futuros.</li>
    <li><strong>Resultado:</strong> Modelo E mantém discriminação competitiva (ROC ≈ ${num3(junRoc)} em jun/2026; ≈ ${num3(julRoc)} em jul/2026 exploratório), mas calibração fraca (Brier elevado; Etapa 17).</li>
    <li><strong>Limitação principal:</strong> histórico longitudinal incompleto (NPS/suporte PIT, tenure, padrões temporais) e hold-outs já utilizados — não confirmatórios.</li>
    <li><strong>Próximos passos:</strong> snapshots mensais auditados, novos períodos congelados, recalibração e validação prospectiva antes de qualquer uso individual.</li>
  </ul>
</section>

<section class="report-section page-break-before" id="sec-2">
  <h2>2. Contextualização e objetivo</h2>
  <p><strong>Churn</strong> é o cancelamento efetivo do relacionamento contratual, registrado no histórico analisado. <strong>Health Score (HS)</strong> sintetiza, de 0 a 100, engajamento em reuniões (E) e mecanismos implantados (M) — indicador de saúde do relacionamento, <em>não</em> probabilidade de cancelamento.</p>
  <p>A QuartaVia acompanha a saúde da carteira para priorizar relacionamento. Há duas lentes complementares:</p>
  <ul>
    <li><strong>Descritiva:</strong> taxas observadas de churn por faixas de HS, E e M no passado (o que aconteceu).</li>
    <li><strong>Preditiva:</strong> modelos que estimam risco de churn em 90 dias condicionado às informações na data de referência (o que os dados permitem inferir).</li>
  </ul>
  <div class="callout">
    <p><strong>Pergunta central:</strong> “Com base nas informações disponíveis sobre um cliente em determinada data, é possível antecipar a ocorrência de cancelamento nos 90 dias seguintes?”</p>
  </div>
  <p>Observações sem janela completa de 90 dias são <strong>censuradas</strong> — não são tratadas automaticamente como “não churn”.</p>
  <p class="note">HS oficial V1: <strong>HS = 0,50 × E + 0,50 × M</strong> (pesos simulados no painel: ${weights?.engagement ?? 50}% / ${weights?.mechanism ?? 50}% — experimentos históricos usaram 50/50 congelado).</p>
</section>

<section class="report-section page-break-before" id="sec-3">
  <h2>3. Dados e indicadores utilizados</h2>
  <p>Cada linha de análise preditiva é uma <strong>observação cliente-mês</strong> (cliente × data de referência). Um mesmo cliente pode contribuir com várias linhas ao longo do tempo — métricas não devem ser lidas como clientes independentes sem ajuste.</p>
  <div class="two-col">
    <div>
      <h3>População e janela (export validado / pre_audit)</h3>
      <ul>
        <li>Clientes únicos no export: ${pre?.unique_clients_all ?? k.uniqueClientsResearch ?? "—"}</li>
        <li>Observações com HS histórico: ${k.observationsHistorical ?? "—"}</li>
        <li>Observações rotuladas 90d: ${k.observationsLabeled90d ?? "—"} · eventos positivos: ${k.churnEvents90d ?? pre?.positive_rows_90d ?? "—"}</li>
        <li>Taxa por linha (pre_audit): ${pct(k.observedChurnRate90d ?? pre?.positive_rate_90d)}</li>
        <li>Censuradas 90d: ${k.censored90d ?? pre?.censored_rows_90d ?? "—"}</li>
        <li>Período analisado: ${escHtml(k.evaluationPeriod || "export validado congelado")}</li>
      </ul>
    </div>
    <div>
      <h3>Indicadores nas features (Modelo E)</h3>
      <ul>
        <li>Engajamento histórico, frequência e recência de reuniões</li>
        <li>Mecanismos históricos e implantados</li>
        <li>Programa (PHARUS, DAVOS, LANDLORD, etc.)</li>
      </ul>
      <h3>Ausentes ou parciais no treino PIT</h3>
      <ul>
        <li>NPS e suporte point-in-time (cobertura operacional parcial: snapshot ~${opAudit.clientsWithNpsHistory ?? "—"} clientes com NPS exportado)</li>
        <li>Tenure contratual completo e alguns sinais de deterioração temporal fina</li>
      </ul>
    </div>
  </div>
  <h3>Reconciliação de denominadores (tabela técnica)</h3>
  <p class="note">Cada linha declara população e uso — não somar pre_audit, frame Etapa 16 e snapshot operacional como se fossem a mesma amostra.</p>
  <table><thead><tr><th>Fonte</th><th class="num">Observações</th><th class="num">Taxa</th><th>População / uso</th></tr></thead><tbody>${reconRows || "<tr><td colspan='4'>—</td></tr>"}</tbody></table>
  <p class="note">Snapshot operacional (${opAudit.clientsInSnapshot ?? "—"} clientes): auditoria de cobertura em ${escHtml(opAudit.snapshotFile || "exports")} — <strong>não</strong> substitui o painel temporal de treinamento.</p>
</section>

<section class="report-section page-break-before" id="sec-4">
  <h2>4. Modelo estatístico utilizado</h2>
  <p>Referência atual: <strong>Modelo E — regressão logística regularizada L2</strong> (${escHtml(ref.algorithm || "class_weight balanced no treino Etapa 4")}).</p>
  <div class="formula-block">
    <p>P(churn em 90 dias | X) = 1 / (1 + exp(−z))</p>
    <p>z = β₀ + Σ βᵢ Xᵢ</p>
  </div>
  <p><strong>Em linguagem acessível:</strong> Xᵢ são medidas do cliente na data de referência (reuniões, mecanismos, programa…); βᵢ quantificam quanto cada sinal empurra o log-odds de cancelamento; a função logística transforma z em uma probabilidade entre 0 e 1.</p>
  <h3>Por que regressão logística?</h3>
  <ul>
    <li>Desfecho binário (cancelou / não cancelou em 90d).</li>
    <li>Combina variáveis heterogêneas com interpretação relativamente transparente.</li>
    <li>Referência sólida para comparar engajamento, mecanismos e cadastro (modelos A–E).</li>
    <li>Discriminação competitiva nos hold-outs exploratórios — <strong>não implica</strong> ser o melhor modelo possível.</li>
  </ul>
  <p><code>class_weight="balanced"</code> compensa desbalanceamento de classes no treino, favorecendo o <strong>ranking</strong> (ROC), mas pode <strong>inflar probabilidades médias</strong> e piorar o Brier — tema central da Etapa 17.</p>
  <p class="note">${escHtml(ref.statusPlain || "Referência experimental — não operacional.")}</p>
</section>

<section class="report-section page-break-before" id="sec-5">
  <h2>5. Principais resultados</h2>
  <p>ROC-AUC mede <strong>capacidade de ordenação</strong> (quem churnou tende a score mais alto). <strong>Não</strong> é percentual de acerto: ROC 0,681 ≠ 68,1% de clientes classificados corretamente.</p>
  <p>PR-AUC enfatiza desempenho sobre a classe rara (churn). Brier mede erro quadrático das probabilidades — quanto menor, melhor alinhamento com taxas observadas.</p>
  <div class="results-grid">
    <article class="result-card">
      <h3>Etapa 4 · hold-out jun/2026</h3>
      <p class="result-meta">Exploratório · mesmo split modelos A–E</p>
      <table class="table-compact"><tbody>
        <tr><td>ROC-AUC</td><td class="num">${num3(junRoc)}</td></tr>
        <tr><td>PR-AUC</td><td class="num">${num3(junPr)}</td></tr>
        <tr><td>Brier</td><td class="num">${num3(junBrier)}</td></tr>
        <tr><td>n teste</td><td class="num">${refM.n ?? modeling?.sample?.test ?? "—"}</td></tr>
      </tbody></table>
    </article>
    <article class="result-card">
      <h3>Etapa 16 · hold-out jul/2026</h3>
      <p class="result-meta">Exploratório · seleção de candidatos</p>
      <table class="table-compact"><tbody>
        <tr><td>ROC-AUC</td><td class="num">${num3(julRoc)}</td></tr>
        <tr><td>PR-AUC</td><td class="num">${num3(julPr)}</td></tr>
        <tr><td>Brier</td><td class="num">${num3(julBrier)}</td></tr>
        <tr><td>n teste</td><td class="num">${refV16?.n ?? "—"}</td></tr>
      </tbody></table>
    </article>
  </div>
  <h3>Síntese Etapas 15 e 16</h3>
  <p>${v15Lab?.status === "ok" ? escHtml(v15Lab.summary) : "Etapa 15: comparação E vs V2 indisponível neste ambiente."}</p>
  <p>${v16Lab?.status === "ok" ? escHtml(v16Lab.recommendation?.rationale || selection.rationale) : escHtml(v16Lab?.summary || "Etapa 16 pendente.")}</p>
  <p class="note">Detalhes tabulares: Apêndice técnico (§12). Jun/2026 e jul/2026 não devem ser reinterpretados como novos testes confirmatórios.</p>
</section>

<section class="report-section page-break-before" id="sec-6">
  <h2>6. Avaliação de calibração — Etapa 17</h2>
  ${v17Lab?.status === "ok" || v17Raw ? `
  <p><strong>Conclusão ${escHtml(v17Letter || "—")}:</strong> ${escHtml(v17Summary || "")}</p>
  <ul>
    <li>Modelo E: discriminação moderada, porém Brier ainda elevado frente a baselines simples em recortes exploratórios.</li>
    <li>Variantes sem balanceamento e calibração Platt/isotônica (ajuste só na validação interna) melhoraram aspectos probabilísticos em experimentos, <strong>sem superioridade operacional conclusiva</strong>.</li>
    <li>Calibração permanece limitação central para uso de percentuais de risco.</li>
  </ul>
  ${v17Prev != null && v17Mean != null ? `<div class="callout callout-warn">
    <p>No hold-out de <strong>diagnóstico</strong> da Etapa 17 (n≈${pickExperiment(v17Raw?.experiments, "model_E_balanced")?.n ?? v17Lab?.experiments?.find((e) => e.id === "model_E_balanced")?.n ?? "—"}, mesmo mês exploratório jul/2026): prevalência observada ≈ <strong>${pct(v17Prev)}</strong>, enquanto a média prevista pelo Modelo E balanceado foi ≈ <strong>${pct(v17Mean)}</strong>.</p>
    <p class="note">Isso indica possível <strong>superestimação agregada de risco</strong> nessa amostra — não generalizar para a carteira atual nem para operação.</p>
  </div>` : ""}
  <p>${escHtml(String(v17Diag.class_weight_balanced || v17Diag.why_high_auc_low_brier_vs_prevalence || "").replace(/\*\*/g, ""))}</p>
  <table><thead><tr><th>Variante (Etapa 17)</th><th class="num">ROC-AUC</th><th class="num">Brier</th><th class="num">Média prevista</th></tr></thead><tbody>
  ${["model_E_balanced", "model_E_balanced_platt", "model_E_unbalanced", "hgb_best_pack", "baseline_prevalence"]
    .map((id) => {
      const e = pickExperiment(v17Raw?.experiments, id) || (v17Lab?.experiments || []).find((x) => x.id === id);
      if (!e) return "";
      const label = (v17Lab?.experiments || []).find((x) => x.id === id)?.label || id;
      return `<tr><td>${escHtml(label)}</td><td class="num">${num3(e.roc ?? e.rocAuc)}</td><td class="num">${num3(e.brier)}</td><td class="num">${e.probMean != null ? pct(e.probMean) : "—"}</td></tr>`;
    })
    .join("")}
  </tbody></table>
  <p class="note">${escHtml(v17Lab?.temporalNote || v17Raw?.temporal_audit?.note || "")}</p>
  ` : `<p class="note">Etapa 17 não carregada — execute <code>npm run model:study-v17</code>. Métricas de calibração no corpo dependem deste artefato.</p>`}
</section>

<section class="report-section page-break-before" id="sec-7">
  <h2>7. Por que ainda não atingimos o resultado esperado?</h2>
  <p>O Health Analytics já possui estrutura preditiva construída a partir de engajamento, reuniões, mecanismos e cadastro. Os experimentos mostram <strong>associações relevantes</strong> com churn — existem sinais no histórico.</p>
  <p>Entretanto, o desempenho atual <strong>não sustenta probabilidades individuais</strong> com confiabilidade operacional. As causas são múltiplas:</p>
  <ul>
    <li><strong>Dados longitudinais incompletos:</strong> nem sempre reconstruímos com precisão a evolução antes do cancelamento (queda de reuniões, mudança de M, satisfação).</li>
    <li><strong>Cobertura heterogênea:</strong> reuniões recentes em parte da base; NPS e suporte ainda não integrados point-in-time no treino.</li>
    <li><strong>Validação temporal curta:</strong> hold-outs reutilizados (jun/jul 2026) são exploratórios — não substituem meses futuros congelados.</li>
    <li><strong>Dependência cliente-mês:</strong> repetição do mesmo cliente infla confiança se ignorada.</li>
    <li><strong>Calibração:</strong> balanceamento de classes e heterogeneidade (implantação vs pós) distorcem probabilidades médias (Etapa 17).</li>
  </ul>
  <p>O desafio não é apenas trocar algoritmo: é <strong>base longitudinal confiável + validação prospectiva</strong>. Parte da dificuldade também pode refletir <strong>limites intrínsecos de previsibilidade</strong> do fenômeno — não atribuímos todo o gap aos dados.</p>
  <p class="note">Evidências: Etapa 15 (E vs V2 inconclusivo), Etapa 16 (sem candidato superior pareado), Etapa 17 (conclusão ${escHtml(v17Letter || "pendente")}).</p>
</section>

<section class="report-section page-break-before" id="sec-8">
  <h2>8. Construção da base histórica e evolução da infraestrutura analítica</h2>
  <p>Foi criado o schema <code>_dash_health_score</code> no Supabase <strong>Business Data</strong> (separado da BASE QV operacional, somente leitura na origem).</p>
  <p>A estrutura registra periodicamente, entre outros:</p>
  <ul>
    <li><code>client_snapshots</code> — situação do cliente, HS, engajamento, mecanismos e metadados por data de referência</li>
    <li><code>snapshot_components</code> — componentes E/M/reuniões ligados a cada snapshot</li>
    <li><code>prospective_freezes</code> / <code>prospective_features</code> — congelamentos mensais para validação futura</li>
    <li><code>pipeline_runs</code> — rastreio de execuções e integridade</li>
  </ul>
  <p>Isso permitirá comparar, em cada data de referência, o que se sabia com cancelamentos observados depois — base para validação prospectiva.</p>
  <div class="callout">
    <p><strong>Distinção importante:</strong> schema e tabelas <em>criados</em>; primeiros registros dependem de execuções do pipeline (<code>npm run monitoring:pipeline</code>). Recorrência mensal automatizada exige agendamento (n8n/GitHub Actions) <strong>ativo e monitorado</strong> — não assumimos automação plena sem verificação operacional.</p>
  </div>
</section>

<section class="report-section page-break-before" id="sec-9">
  <h2>9. Perspectivas de evolução da modelagem</h2>
  <p>Hoje a regressão logística permanece referência porque relaciona risco a características do cliente na data de referência. Com histórico longitudinal acumulado, outros métodos podem ser explorados — sempre com validação.</p>
  <h3>ARIMA</h3>
  <p>Modelo de séries temporais que projeta uma variável a partir de sua própria dinâmica passada. Aplicações potenciais: volume mensal de cancelamentos, taxa agregada de churn, HS médio da carteira. <strong>Não</strong> substitui risco individual.</p>
  <h3>SARIMA</h3>
  <p>Extensão com componente sazonal — útil se houver sazonalidade comprovada e histórico longo o suficiente.</p>
  <h3>Análise de sobrevivência</h3>
  <p>Estima tempo até cancelamento com covariáveis que evoluem — alternativa natural quando o foco é “quando”, não apenas “se em 90d”.</p>
  <table class="table-compact"><thead><tr><th>Abordagem</th><th>Pergunta típica</th></tr></thead><tbody>
    <tr><td>Logística / sobrevivência</td><td>Risco ou tempo até churn por cliente</td></tr>
    <tr><td>ARIMA / SARIMA</td><td>Previsão de indicadores agregados mensais</td></tr>
  </tbody></table>
  <p class="note">Novos estudos dependem de períodos acumulados, estabilidade das séries e validação — sem prazo garantido para maturidade operacional.</p>
</section>

<section class="report-section page-break-before" id="sec-10">
  <h2>10. Plano de evolução</h2>
  <h3>Curto prazo</h3>
  <ul>
    <li>Validar execução recorrente do pipeline de snapshots</li>
    <li>Auditar integridade, cobertura e idempotência</li>
    <li>Aperfeiçoar calibração do Modelo E (Platt/isotônica com hold-out independente futuro)</li>
  </ul>
  <h3>Médio prazo</h3>
  <ul>
    <li>Acumular novos meses congelados</li>
    <li>Incorporar NPS e suporte point-in-time; tenure contratual</li>
    <li>Validar previsões em janelas futuras completas; investigar sobrevivência</li>
  </ul>
  <h3>Longo prazo</h3>
  <ul>
    <li>Séries temporais agregadas (ARIMA/SARIMA) quando o histórico justificar</li>
    <li>Comparar candidatos a baselines simples</li>
    <li>Eventual aplicação operacional somente após validação prospectiva aprovada</li>
  </ul>
</section>

<section class="report-section page-break-before" id="sec-11">
  <h2>11. Conclusão executiva</h2>
  <div class="callout callout-primary">
    <p><strong>O que desenvolvemos?</strong> Um laboratório preditivo versionado, Modelo E como referência experimental, estudos até a Etapa 17 e infraestrutura <code>_dash_health_score</code> para histórico confiável.</p>
    <p><strong>O que os resultados mostram?</strong> Associação estatística moderada entre sinais de relacionamento e churn; discriminação útil para pesquisa agregada, não para scores individuais calibrados.</p>
    <p><strong>Por que não operacional?</strong> Dados longitudinais incompletos, calibração insuficiente, validação temporal limitada e conclusão Etapa 17 (${escHtml(v17Letter || "—")}).</p>
    <p><strong>Como evoluir?</strong> Snapshots mensais auditados, enriquecimento PIT, hold-outs futuros congelados e comparação disciplinada de modelos — sem assumir que mais dados sozinhos garantem previsão confiável.</p>
  </div>
  <p>O Health Score V1 50/50 permanece indicador operacional de relacionamento. Este estudo <strong>não publica probabilidades de churn por cliente</strong>.</p>
</section>

<section class="report-section appendix page-break-before" id="sec-12">
  <h2>12. Apêndice técnico</h2>
  <p class="note">Conteúdo para auditoria e reprodução — não repetido no corpo principal.</p>

  <h3>Comparação modelos A–E (Etapa 4)</h3>
  <table><thead><tr><th>ID</th><th>Descrição</th><th class="num">ROC</th><th class="num">PR</th><th class="num">IC ROC</th><th class="num">n</th></tr></thead><tbody>${modelComparisonTable(panorama) || "—"}</tbody></table>
  <p class="note">${escHtml(modeling?.split?.note || "")}</p>
  ${modeling?.split?.client_overlap ? `<p>Treino×teste: ${modeling.split.client_overlap.train_test ?? "—"} clientes sobrepostos.</p>` : ""}

  ${renderAppendixV15(artifacts.studyV15)}
  ${renderAppendixV16(artifacts.studyV16)}
  ${renderAppendixV17(v17Raw, v17Lab)}

  <h3>Churn observado por faixas (descritivo congelado)</h3>
  <p>${escHtml(d.filterLabel || "export validado")} · ${d.observations ?? "—"} observações nas faixas.</p>
  ${bandTable(d.hsBands, "HS")}
  ${bandTable(d.eBands, "Engajamento")}
  ${bandTable(d.mBands, "Mecanismos")}

  <h3>Coeficientes logísticos (coef_top exportado)</h3>
  ${logisticCoefBlocks(modeling)}

  <h3>Metodologia de particionamento e censura</h3>
  <ul>
    <li>População: ${escHtml(modeling?.problem?.population || "elegivel_modelagem_90d")}</li>
    <li>Horizonte: ${modeling?.problem?.horizon_days ?? 90} dias</li>
    <li>Meses treino → teste: ${escHtml((modeling?.split?.train_months || []).join(", "))} → ${escHtml((modeling?.split?.test_months || []).join(", "))}</li>
    <li>Prevalência teste Etapa 4: ${pct(modeling?.sample?.prevalence_test)}</li>
    <li>Seed / sklearn: ${escHtml(modeling?.environment?.sklearn || "—")}</li>
  </ul>
  <ul>${LIMITATIONS_PLAIN.map((l) => `<li>${escHtml(l)}</li>`).join("")}</ul>

  <footer class="report-footer">
    <p>Health Analytics 3.0 · QuartaVia · Estudo experimental</p>
    <p class="version-line">${buildVersionBlock(labPack, panorama, artifacts)}</p>
  </footer>
</section>`;

  return {
    ok: true,
    title: "Estudo Preditivo de Churn — Relatório executivo",
    bodyHtml: body,
    filename: "health-analytics-estudo-preditivo-churn",
  };
}
