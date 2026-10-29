# Finalizar integração (checklist mínimo)

## Já pronto no código

- Pipeline Node: BASE QV (leitura) → HS V1 / 2.0A → snapshot local → `persistMonitoringToBusinessData`.
- 7 tabelas em `_dash_health_score`.
- APIs: `/api/monitoring-history`, `/api/client-snapshot-history`, `POST /api/monitoring/pipeline/run`.
- Dashboard: histórico via Business Data quando configurado.
- n8n: workflow `0gRJGp39YOXrXEZY` (inativo, Schedule desligado).

## 2 passos manuais (obrigatórios)

1. **`.env`** — adicionar **uma** linha (projeto Business Data `rckpuebaiswrxzmywllv`):

   `BUSINESS_SUPABASE_SERVICE_ROLE_KEY=<service_role do Dashboard → API>`

   (ou `AUTH_SUPABASE_SERVICE_ROLE_KEY` no mesmo projeto.)

2. **Supabase Business Data → Settings → API → Exposed schemas** — incluir `_dash_health_score` (sem remover schemas de outros apps).

## Comandos

```bash
npm run monitoring:ensure-secrets   # pseudônimo + token pipeline (só se faltarem)
npm run monitoring:check-bd       # exit 0 quando OK
npm run monitoring:persist-test   # 1ª execução grava; 2ª idempotente
```

## n8n (simples e seguro)

- **Não** recalcular HS no n8n.
- Credencial **Header Auth**: `Authorization: Bearer <MONITORING_PIPELINE_TOKEN>`.
- Variável de instância: `MONITORING_PIPELINE_URL` = URL **pública** do backend (VM, Cloud Run, etc. — **não** `localhost:3010`).
- Workflow chama `POST …/api/monitoring/pipeline/run` com `{ "persistBusinessData": true }`.
- Ativar Schedule **somente** após `monitoring:check-bd` OK e persistência dupla validada.

## Automação

| Item | Estado |
|------|--------|
| Schedule n8n | **Desligado** (`active: false`, nó Schedule disabled) |
| Persistência BD | **Bloqueada** até service role + schema exposto |
