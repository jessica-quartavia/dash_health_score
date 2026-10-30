/** Aba "Como funciona" — Laboratório Preditivo (sócios). */

export function renderResearchLabHow(ui) {
  return `
    <section class="research-hero card research-hero-compact">
      <p class="research-hero-eyebrow">Laboratório Preditivo</p>
      <h1 class="research-hero-title">Como funciona esta pesquisa</h1>
      <p class="research-hero-lead">Leitura didática — separada do Health Score que o time usa no dia a dia.</p>
    </section>
    <section class="card">
      <h2 class="research-section-title">O que é churn neste estudo?</h2>
      <p>Registramos <strong>cancelamento efetivo</strong> do relacionamento contratual dentro de uma janela de <strong>90 dias</strong> após a data de referência (cliente-mês). Reativações, congelamentos e conflitos de data são tratados na consolidação de episódios — ver auditoria na visão executiva.</p>
    </section>
    <section class="card">
      <h2 class="research-section-title">Health Score (HS) — fórmula 50/50 no histórico</h2>
      <p class="formula-block"><strong>HS = 0,50 × E + 0,50 × M</strong></p>
      <p><strong>E (Engajamento):</strong> presença em reuniões válidas, resumida em nota 0–100.</p>
      <p><strong>M (Mecanismos):</strong> quantidade implantada na jornada (0 / 60 / 100 conforme cobertura).</p>
      <p>O painel operacional pode simular outros pesos; a pesquisa histórica congela <strong>50/50</strong> para comparabilidade.</p>
    </section>
    <section class="card">
      <h2 class="research-section-title">HS ≠ probabilidade de churn</h2>
      <p>O HS mede <strong>saúde do relacionamento hoje</strong>. O modelo preditivo pergunta, no passado: “dado o que sabíamos na data de referência, quem cancelou nos 90 dias seguintes?”. Associação histórica não autoriza publicar risco individual por cliente.</p>
    </section>
    <section class="card">
      <h2 class="research-section-title">Horizonte de 90 dias</h2>
      <p>Cada observação espera três meses de calendário para saber se houve churn. Sem janela completa, a linha é <strong>censurada</strong> — não entra como “não cancelou” automático.</p>
    </section>
    <section class="card">
      <h2 class="research-section-title">Variáveis utilizadas (Modelo E de referência)</h2>
      <ul class="plain-list">
        <li>Engajamento e frequência de reuniões (30/90/180d, recência, acumulado)</li>
        <li>Mecanismos históricos e implantados</li>
        <li>Programa (cadastro estruturado)</li>
        <li>HS entra em experimentos separados (modelo C) — no Modelo E usamos E e M diretamente</li>
      </ul>
      <p class="sub">NPS, suporte e tenure contratual completo ainda não estão no export point-in-time — Etapas 15/16 documentam a ausência.</p>
    </section>
    <section class="card">
      <h2 class="research-section-title">Regressão logística (referência)</h2>
      <p class="formula-block">P(Y=1 | X) = 1 / (1 + exp(−z)), &nbsp; z = β₀ + Σ βᵢ Xᵢ</p>
      <p>Estimamos pesos β no treino para separar, em média, meses com churn observado dos demais. Métricas como ROC-AUC medem <strong>ordenação</strong>, não “% de acerto”.</p>
    </section>
    <section class="card">
      <h2 class="research-section-title">Análise de sobrevivência (contexto)</h2>
      <p>Modelos de tempo até o evento (Cox, hazard discreto) tratam censura de forma nativa. Exploramos variantes nas Etapas 2 e 16; com histórico curto e dependência entre meses do mesmo cliente, mantemos a <strong>logística regularizada</strong> como baseline experimental mais interpretável.</p>
    </section>`;
}
