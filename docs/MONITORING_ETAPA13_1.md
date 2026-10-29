# Etapa 13.1 — Execução mensal simplificada

## 1. Infraestrutura existente (auditoria)

| Componente | Evidência no repo / MCP |
|------------|-------------------------|
| **Dashboard** | `node scripts/dev-server.mjs` (porta 3010) — app Node estático + APIs; **sem** `vercel.json` |
| **Vercel** | Código detecta `VERCEL` e marca FS efêmero; automação **bloqueada** em serverless (`storage-backend.mjs`) |
| **n8n** | Instância remota Easypanel: `https://n8n-n8n.orsh7l.easypanel.host` — **não** alcança `localhost:3010` |
| **GitHub** | Repo `jessica-quartavia/dash_health_score` + workflow `.github/workflows/monitoring-pipeline.yml` |
| **Pipeline** | ~15–35 s, ~1.578 clientes; pico de memória moderado (Node 20, leitura BASE QV + PostgREST) |
| **Persistência durável** | Business Data `_dash_health_score` (primário); mirror local opcional |

**HTTP permanente:** necessário **somente** se a orquestração for `POST /api/monitoring/pipeline/run`. **Não** é obrigatório para rodar o job mensal.

## 2. Alternativas (objetivo)

| Opção | Viável? | Componentes | Custo / limite |
|-------|---------|-------------|----------------|
| **A. Job Node agendado (GitHub Actions)** | **Sim** | Repo + secrets | GHA free: 2.000 min/mês (conta free); job ~2–5 min/mês |
| **B. HTTP em servidor Node público** | Sim, se já houver VM | PM2 + URL + token | Custo da VM existente; manutenção contínua |
| **C. n8n executa pipeline** | **Só orquestração** | n8n → (HTTP **ou** GitHub dispatch) | n8n já pago/hosted; **não** calcular HS nos nós |
| **D. Manual mensal** | **Sim** | `npm run monitoring:persist-test` ou GHA `workflow_dispatch` | Zero infra extra |

### Recomendação (menor complexidade)

**Primária: A — GitHub Actions** com `schedule` mensal (dia 1, 06:00 UTC−3 ≈ cron `0 9 1 * *` UTC) + secrets já usados no `.env` local.

**Orquestração n8n (opcional):** workflow `0gRJGp39YOXrXEZY` dispara **`workflow_dispatch`** na Actions (HTTP para `api.github.com`), sem expor o pipeline na internet.

**Não usar Vercel** para o job completo (timeout + FS efêmero).

## 3. Arquitetura preservada

Inalterada: BASE QV leitura, Business Data escrita, HS V1 / 2.0A, modelos experimentais.

## 4. Testes

| Teste | Estado |
|-------|--------|
| CLI / HTTP local + BD | OK (Etapa 12–13) |
| GHA remoto | Requer secrets no GitHub + 1× `workflow_dispatch` manual |
| n8n → localhost | **Inviável** |
| n8n → GHA dispatch | Viável após PAT + secret no n8n |

## 5. Ativar execução mensal

1. GitHub → Settings → Secrets → `DATA_SUPABASE_*`, `BUSINESS_SUPABASE_*`, `HS_MONITORING_PSEUDONYM_SECRET`.
2. Actions → **Monitoring pipeline** → **Run workflow** (validar persistência).
3. Se OK: descomentar `schedule` em `monitoring-pipeline.yml` **ou** n8n mensal chamando dispatch.
4. **Não** ativar Schedule n8n para HTTP até existir `MONITORING_PIPELINE_URL` pública.

## 6. O que falta

- Secrets GHA alinhados à Etapa 12 (workflow atualizado nesta etapa).
- Uma execução manual bem-sucedida no GitHub.
- (Opcional) PAT read-only + nó HTTP no n8n para dispatch — substitui servidor público.
