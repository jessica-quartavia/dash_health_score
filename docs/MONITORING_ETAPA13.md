# Etapa 13 — Ativação controlada n8n

## Executor escolhido

**Servidor Node long-running** (`scripts/dev-server.mjs` ou PM2/systemd em VM) expondo `POST /api/monitoring/pipeline/run`.

| Critério | Avaliação |
|----------|-----------|
| Duração típica | ~12–35 s (1.578 clientes) |
| Vercel serverless | **Não recomendado** — sem `vercel.json`; timeout padrão insuficiente |
| n8n | Orquestra HTTP apenas; **não** calcula HS |
| BASE QV | Somente leitura via `DATA_*` |
| Business Data | Escrita via PostgREST + `Accept-Profile` / `Content-Profile` |

## Endpoint

- **Auth:** `Authorization: Bearer MONITORING_PIPELINE_TOKEN` (ou header `X-Pipeline-Token`)
- **Concorrência:** 409 `ALREADY_RUNNING` se segunda chamada simultânea
- **Idempotência:** mesma referência/versão → `200` com `idempotent: true` e `businessData.skipped`
- **Resposta:** sanitizada (`lib/api/pipeline-run-response.mjs`) — sem service keys

## n8n workflow `0gRJGp39YOXrXEZY`

- **7 nós:** manual + schedule (OFF) → validar URL → HTTP POST → interpretar → IF → stop on error
- **Credencial:** Header Auth na instância n8n (token **não** no JSON do repo)
- **Env n8n:** `MONITORING_PIPELINE_URL` (URL pública, não localhost)
- **Schedule:** dia 1, 06:00, `America/Bahia` — nó **disabled**; workflow **inactive**
- **Ativar:** `MONITORING_N8N_SCHEDULE_ACTIVE=1` no backend + habilitar schedule/workflow após teste remoto OK

## Testes

```bash
npm run monitoring:check-bd
node scripts/dev-server.mjs
node scripts/test-pipeline-trigger.mjs   # simula n8n → localhost
npm test
```

## Dashboard

Qualidade e Monitoramento: card **Agendamento n8n** + histórico Business Data (`lastValidRun`, falhas recentes).
