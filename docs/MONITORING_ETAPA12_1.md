# Etapa 12.1 — Validação real Business Data

## 1. Configuração (sem expor segredos)

| Variável | Estado local (2026-10-29) |
|----------|---------------------------|
| `BUSINESS_SUPABASE_URL` | **Ausente** — fallback implícito via `AUTH_SUPABASE_URL` → host `rckpuebaiswrxzmywllv.supabase.co` (Business Data, não BASE QV) |
| `BUSINESS_SUPABASE_SERVICE_ROLE_KEY` | **Ausente** → `businessData.ready === false` |
| `HS_MONITORING_PSEUDONYM_SECRET` | **Ausente** (arquivo local `.pseudonym-secret` pode ser usado pelo pipeline) |
| `MONITORING_PIPELINE_TOKEN` | **Ausente** (endpoint n8n ainda não autenticável) |
| `DATA_SUPABASE_URL` | Presente — host `lacinxsvjdwalkchxyeo.supabase.co` (BASE QV leitura) |

- **Git:** `.env` e `.env.local` estão no `.gitignore` e não são versionados.
- **BASE QV:** credencial `DATA_*` não é reutilizada para Business Data (`assertNotBaseQvUrl`).

### Exposed schemas (obrigatório)

Probe PostgREST (`lib/business-data/probe-exposed.mjs`):

- HTTP **406** / `PGRST106` — `_dash_health_score` **não** está na lista exposta.
- Schemas expostos hoje (trecho da mensagem): `api`, `public`, `graphql_public`, `seal`, `Air…` (demais omitidos).

**Ação (Dashboard Supabase → Business Data → Settings → API):**

1. Em **Exposed schemas**, adicionar `_dash_health_score` (sem remover os schemas de outros apps).
2. Salvar e aguardar reload da API.

Comando local (só diagnóstico):

```bash
node scripts/check-business-data-env.mjs
```

## 2. Banco verificado (MCP Business Data)

| Tabela | RLS | Linhas (pós-12.1) |
|--------|-----|-------------------|
| `pipeline_runs` | sim | 0 |
| `client_snapshots` | sim | 0 |
| `snapshot_components` | sim | 0 |
| `quality_issues` | sim | 0 |
| `prospective_freezes` | sim | 0 |
| `prospective_features` | sim | 0 |
| `churn_outcomes` | sim | 0 |

Constraints confirmadas: PK, FK (`client_snapshots`→`pipeline_runs`, `snapshot_components`→`client_snapshots`, etc.), UNIQUE (idempotency, identidade snapshot), CHECK (`status`, `client_ref`, horizonte freeze).

Grants: `service_role` com SELECT/INSERT/UPDATE/DELETE nas tabelas do schema.

## 3. Execuções parciais (correção 12.1)

`persistMonitoringToBusinessData`:

1. Insere `pipeline_runs` com **`running`**.
2. Grava snapshots, componentes, issues, freeze.
3. Valida contagens (`client_count`, snapshots, componentes).
4. Marca **`success`** ou **`failed`** (nunca deixa “sucesso” com contagem incoerente).
5. Idempotência só se run anterior **`success`** com `snapshot_rows === client_count`.

Consultas gerenciais (`business-data-read.mjs`):

- Só runs `success` com `snapshot_rows > 0` e `reference_date < 2090-01-01`.
- Trend/histórico por cliente filtrados por `run_id` desses runs (snapshots de runs `failed`/`running` não aparecem).

## 4. Persistência real

```bash
npm run monitoring:persist-test
```

Resultado **2026-10-29**:

- **BASE QV:** 1578 clientes ativos processados (carteira atual; não assumir 1.586).
- Snapshot local gravado.
- **Business Data:** `skipped` — `BUSINESS_DATA_NOT_CONFIGURED` (sem service role).

**Idempotência BD:** não testada até configurar env + exposed schema.

## 5. Smoke test removido

Removidos somente:

- `pipeline_runs.idempotency_key = 'etapa12-smoke-test-key'`
- `client_snapshots` com `reference_date = '2099-01-01'` e `client_ref = 'm_01234567890123456789'`

## 6. APIs / UI

Com BD não configurado no servidor:

- `GET /api/monitoring-history` → **503** + mensagem clara.
- `GET /api/client-snapshot-history` → idem.
- `GET /api/monitoring-summary` → continua com live local + BASE QV.

Após configurar BD: Qualidade usa histórico BD (runs, trend, falhas recentes); detalhe cliente prioriza snapshots BD.

## 7. n8n

- Workflow criado na instância: **Health Analytics — Pipeline (desativado)** — ID `0gRJGp39YOXrXEZY`.
- **active: false** — Schedule node **disabled**.
- `n8n_validate_workflow`: **valid**, 4 nós, 0 erros.
- Credenciais: Header Auth `Bearer MONITORING_PIPELINE_TOKEN`; env `MONITORING_PIPELINE_URL` (URL pública, não localhost).
- Timeout HTTP: 600s.

## 8. Requisitos para ativar automação

1. `BUSINESS_SUPABASE_SERVICE_ROLE_KEY` (projeto **rckpuebaiswrxzmywllv**, não lacinx…).
2. `BUSINESS_SUPABASE_URL` explícita (recomendado).
3. `HS_MONITORING_PERSIST_BUSINESS_DATA=1` ou `--persist-business-data`.
4. Expor `_dash_health_score` na API.
5. `HS_MONITORING_PSEUDONYM_SECRET` estável entre ambientes.
6. Backend acessível pela internet + `MONITORING_PIPELINE_TOKEN`.
7. Segunda execução do pipeline com mesma referência → idempotência comprovada.
8. Só então habilitar Schedule no n8n.

**Critério de sucesso 12.1:** parcialmente atendido — pipeline real na BASE QV OK; persistência/recuperação BD **bloqueadas** por service role + exposed schema.
