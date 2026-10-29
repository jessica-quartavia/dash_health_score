# Etapa 11 — Persistência durável e ativação

## Ambiente detectado (typical)

Execute `npm run monitoring:audit` após configurar `.env`. O relatório redigido fica em `research/monitoring/output/ENV_AUDIT_ETAPA11.json` (fingerprints, sem segredos).

## Destino recomendado

1. **Mirror corporativo** — `MONITORING_MIRROR_PATH` apontando para pasta sincronizada (OneDrive/NAS).
2. **Supabase Storage** — projeto **autorizado separado**, bucket **privado** dedicado; variáveis `MONITORING_SUPABASE_*` + `MONITORING_STORAGE_BUCKET`.

**Proibido:** usar `DATA_SUPABASE_URL` / `DATA_SUPABASE_SERVICE_ROLE_KEY` como destino de escrita.

## Configurações necessárias

```env
MONITORING_MIRROR_PATH=C:\caminho\aprovado\hs-monitoring
# ou
MONITORING_SUPABASE_URL=https://<projeto-autorizado>.supabase.co
MONITORING_SUPABASE_SERVICE_KEY=<service_role_projeto_monitoramento>
MONITORING_STORAGE_BUCKET=hs-monitoring-private

MONITORING_SCHEDULE=weekly
MONITORING_AUTOMATION_APPROVED=1   # só após validar destino
MONITORING_CRON_ACTIVE=1             # só após 1ª execução agendada com sucesso
```

Validação Storage: `npm run monitoring:audit -- --probe-storage` (requer bucket existente e políticas — **não criamos bucket automaticamente**).

## Layout de objetos

`monitoring/{ano}/{mes}/{tipo}/{arquivo}`

Tipos: `snapshots`, `prospective`, `manifest`, `reports`, `runs`, `meta`.

## Recuperação

```bash
npm run monitoring:recovery-test
npm run monitoring:recovery-test -- --remote   # se Supabase configurado
```

Procedimento: localizar objeto → baixar → conferir SHA-256 → validar `integrity` do snapshot → restaurar manifesto se necessário. Sobrescrita bloqueada salvo `--force` no pipeline.

## Automação — situação real

| Estado | Condição |
|--------|----------|
| Local | Pipeline grava em `research/monitoring` |
| Central pendente | Variáveis presentes mas probe falhou |
| Central validada | Mirror gravável ou Storage probe OK |
| Automação aprovada | `MONITORING_AUTOMATION_APPROVED=1` |
| Automação ativa | **Não declarada** até cron + execução comprovada |

Agendamento semanal: GitHub Actions `workflow_dispatch` ou Task Scheduler local — **sem cron ativo por padrão**.

## Próximos requisitos para ativação

1. Autorização explícita para bucket/projeto Storage (se Supabase).
2. Preencher `.env` com destino dedicado.
3. `npm run monitoring:audit -- --probe-storage` exit 0.
4. Executar pipeline e `monitoring:recovery-test` (e `--remote` se aplicável).
5. Definir `MONITORING_AUTOMATION_APPROVED=1` e agendar executor (CI ou servidor).
6. Após primeira execução agendada bem-sucedida: `MONITORING_CRON_ACTIVE=1`.

## Critério de sucesso Etapa 11

Persistência **comprovada** = artefato recuperável do destino central validado, com hash íntegro, independente da máquina origem.
