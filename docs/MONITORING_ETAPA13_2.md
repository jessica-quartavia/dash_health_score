# Etapa 13.2 — GitHub Actions

## Workflow

Arquivo: `.github/workflows/monitoring-pipeline.yml`

| Item | Valor |
|------|--------|
| Node | 20 |
| Install | `npm ci` |
| Raiz git | `dash-health-score/` (package.json na raiz do repo) |
| Pipeline | `node scripts/run-monitoring-pipeline.mjs --persist-business-data` |
| Pós-check | `node scripts/verify-bd-after-pipeline.mjs` |
| Timeout | 30 min |
| Permissões | `contents: read` |
| Concorrência | `hs-monitoring-pipeline` (sem cancelar run em andamento) |

Falha de CI se Business Data não persistir (exit code do runner).

## Secrets (Settings → Secrets and variables → Actions)

| Secret | Uso |
|--------|-----|
| `DATA_SUPABASE_URL` | BASE QV leitura |
| `DATA_SUPABASE_SERVICE_ROLE_KEY` | BASE QV leitura |
| `BUSINESS_SUPABASE_URL` | `https://rckpuebaiswrxzmywllv.supabase.co` |
| `BUSINESS_SUPABASE_SERVICE_ROLE_KEY` | Escrita `_dash_health_score` |
| `HS_MONITORING_PSEUDONYM_SECRET` | **Mesmo valor** do 1º snapshot real (não rotacionar) |

Nunca logar secrets. Workflow não imprime env.

## Execução manual

1. Configurar secrets.
2. Actions → **Monitoring pipeline** → **Run workflow**.
3. Verificar job verde + passo **Verify Business Data counts**.
4. Confirmar no Supabase: `pipeline_runs.status = success`, `snapshot_rows = client_count`.

## Agendamento mensal (após manual OK)

Descomentar no YAML:

```yaml
schedule:
  - cron: "0 9 1 * *"
```

Opcional no servidor do dashboard: `MONITORING_GHA_SCHEDULE_ACTIVE=1` (só informativo na UI).

**Aviso:** GitHub pode atrasar cron; não é horário exato.

## Idempotência

Segunda execução no mesmo dia/referência → exit **0**, `idempotent: true`, sem duplicar run.
