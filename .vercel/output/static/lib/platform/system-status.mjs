/**
 * Mensagens dinâmicas do painel — derivadas do estado real, sem copy fixa contraditória.
 * @param {object} ctx
 */

export function buildSystemStatus(ctx = {}) {
  const items = [];
  const push = (level, title, detail, kind = level) => {
    items.push({ level, title, detail, kind });
  };

  const baseQv = ctx.baseQv || {};
  if (baseQv.ready === false) {
    push("error", "BASE QV indisponível", baseQv.message || "Configure DATA_SUPABASE_* no servidor.", "dados");
  } else if (baseQv.ready === true) {
    push("info", "Dados operacionais", "Snapshot ao vivo da BASE QV (somente leitura).", "dados");
  }

  const bd = ctx.businessData || {};
  if (bd.configured === false) {
    push("attention", "Histórico central", "Business Data não configurado — evolução persistida limitada ao ambiente local.", "persistencia");
  } else if (bd.ok === true && (bd.validRuns || 0) > 0) {
    push(
      "info",
      "Persistência confirmada",
      `${bd.validRuns} execução(ões) válida(s) no schema _dash_health_score${bd.lastReference ? ` · última ref. ${bd.lastReference}` : ""}.`,
      "persistencia",
    );
  } else if (bd.configured === true && bd.ok === false) {
    push("attention", "Business Data", bd.error || "Consulta falhou — operacional segue pela BASE QV.", "persistencia");
  } else if (bd.configured === true && (bd.validRuns || 0) === 0) {
    push("attention", "Persistência pendente", "Credenciais OK, mas ainda sem runs success gravadas.", "persistencia");
  }

  const temporal = ctx.temporal || {};
  if (temporal.comparable) {
    push("info", "Evolução temporal", `Comparação ${temporal.de || "—"} → ${temporal.para || "—"} disponível.`, "evolucao");
  } else if (temporal.snapshotCount >= 1) {
    push(
      "attention",
      "Evolução temporal",
      temporal.reason || "Aguardando 2+ snapshots comparáveis em dias distintos.",
      "evolucao",
    );
  }

  const auto = ctx.automation || {};
  if (auto.githubActions?.schedule?.active) {
    push("info", "Automação", `Pipeline mensal via GitHub Actions (${auto.githubActions.schedule.labelLocal || "cron"}).`, "automacao");
  } else if (auto.githubActions?.workflow) {
    push(
      "attention",
      "Automação",
      auto.githubActions.message || "Workflow presente no repositório; cron pode estar desativado no YAML.",
      "automacao",
    );
  } else if (auto.n8nConfigured) {
    push(
      "attention",
      "Orquestração n8n",
      "Workflow configurado — não implica execução ativa nem persistência BD.",
      "automacao",
    );
  }

  const research = ctx.research || {};
  if (research.state === "models_trained_not_operational") {
    push(
      "experimental",
      "Laboratório preditivo",
      "Modelos A–E treinados offline — não usar probabilidade individual em operação.",
      "pesquisa",
    );
  } else if (research.state === "artifacts_missing") {
    push("attention", "Laboratório preditivo", "Artefatos de pesquisa ausentes neste ambiente.", "pesquisa");
  }

  const weightStudy = ctx.weightStudy || {};
  if (weightStudy.recommendation) {
    push(
      "experimental",
      "Estudo de pesos E/M",
      weightStudy.recommendationSummary || weightStudy.recommendation,
      "pesquisa",
    );
  }

  const hsFuture = ctx.hsFuture || {};
  if (hsFuture.feasible === false) {
    push(
      "attention",
      "Projeção de HS",
      hsFuture.reason || "Base longitudinal insuficiente para projeção validada.",
      "projecao",
    );
  } else if (hsFuture.feasible === true && !hsFuture.modelValidated) {
    push(
      "experimental",
      "Projeção de HS",
      "Série histórica parcial — apenas simulador de cenários no perfil do cliente.",
      "projecao",
    );
  }

  if (ctx.warnings?.length) {
    for (const w of ctx.warnings.slice(0, 3)) {
      push("attention", "Aviso do ambiente", typeof w === "string" ? w : w?.message || String(w), "ambiente");
    }
  }

  return {
    version: "system-status-v1",
    generatedAt: new Date().toISOString(),
    items,
  };
}
