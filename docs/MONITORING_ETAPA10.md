# Etapa 10 — Monitoramento automatizado e gestão da qualidade

## 1. Armazenamento persistente (estratégia)

| Camada | Uso | Persistência |
|--------|-----|----------------|
| **Local** `research/monitoring/` | Desenvolvimento e execução manual | Disco local / pasta sincronizada (gitignore) |
| **Mirror filesystem** `MONITORING_MIRROR_PATH` | Cópia durável em NAS/OneDrive corporativo | Responsabilidade do time de infra |
| **Supabase Storage** (projeto **separado** da BASE QV) | Bucket dedicado `MONITORING_*` | Controle de acesso no projeto de pesquisa |
| **GitHub Actions artifact** | Backup opcional pós-`workflow_dispatch` | Retenção limitada (90d) — não substituir mirror primário |

A **BASE QV** permanece **somente leitura**. Nenhum snapshot grava PII (apenas `clientRef` `m_*`).

Verificação: `npm run monitoring:check-env`

## 2. Execução periódica (estratégia)

- **Modo configurável:** `MONITORING_SCHEDULE=daily|weekly|manual` (default `weekly`).
- **Habilitar automação:** `MONITORING_AUTOMATION_APPROVED=1` **e** destino durável **e** ambiente **não-Vercel**.
- **Comando:** `npm run monitoring:pipeline` (idempotente; `--force` para reexecução controlada).
- **Agendamento:** workflow `.github/workflows/monitoring-pipeline.yml` — apenas `workflow_dispatch` até aprovação explícita de destino + secrets.
- **Não afirmar automação operacional** sem run log + arquivo no mirror aprovado.

## 3. Pipeline validado

1. Carga read-only BASE QV → HS V1 + 2.0A + diagnósticos  
2. Snapshot pseudonimizado + hash de integridade  
3. Freeze mensal prospectivo (`research/monitoring/prospective/`)  
4. Relatórios em `output/`  
5. Run log em `runs/run-log.json`  
6. Mirror opcional  

## 4. Retenção

- Manifesto: até **120** snapshots  
- Run log: até **400** entradas  
- Prospective freeze: **1 arquivo/mês/população/versão transform**  
- Política completa: `research/monitoring/SNAPSHOT_PROCEDURE.md`

## 5. Recuperação de snapshots

1. Consultar `manifest.json` (ordem por `writtenAt`)  
2. Validar `integrity` com `verifySnapshotIntegrity` (pipeline Etapa 10)  
3. Restaurar de mirror Supabase/NAS se local corrompido  
4. Reexecutar com `--force` **somente** após investigar causa (não sobrescrever série válida)

## 6. Validação prospectiva (vínculo churn)

- Chave: `clientRef` + `referenceMonth` no freeze mensal  
- Rótulo 90d: consolidar churn read-only após maturação  
- **Proibido** recalcular features congeladas com dados posteriores  

## 7. Limitações

- Deploy Vercel: sem persistência confiável — pipeline deve rodar local/CI  
- Comparação temporal exige ≥2 dias distintos e mesma versão V1/2.0A  
- Mirror Supabase requer credenciais **dedicadas** (não reutilizar service role da BASE QV em escrita)  
- Automação cron **desligada** até `monitoring:check-env` exit 0 + aprovação  

## 8. Testes

`npm test` inclui `tests/etapa10-monitoring.test.mjs`
