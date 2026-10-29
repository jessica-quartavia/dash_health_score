# Regras interpretativas — HS 2.0A (Etapa 8)

**Status:** experimental · **Score numérico:** idêntico ao HS V1 (`0,5×E + 0,5×M`).

## Conceitos separados

| Conceito | Uso |
|----------|-----|
| HS V1 | Saúde observável (E/M) |
| Qualidade informacional | Confiabilidade/cobertura dos dados |
| Risco preditivo | Apenas pesquisa (modelos A–E) — não exibido por cliente |

## Perfil primário (exclusivo)

Prioridade:

1. Dados inconsistentes (entrada não confiável)
2. Histórico insuficiente (sem registro reconstruível)
3. Em implantação
4. Mecanismos não observáveis (`sem_vinculo`)
5. Baixa atividade observada (≥1 reunião e E≤20)
6. Relacionamento estabelecido (≥3 reuniões ou E>40)
7. Histórico insuficiente (<2 reuniões)
8. Relacionamento estabelecido (default)

## Qualidade informacional

- **Histórico insuficiente:** classificação Sem registro / reconstrução impossível
- **Confiabilidade parcial:** sem vínculo M pós-implantação, sem reuniões pós-implantação, ou entrada cadastral migrada
- **Alta confiabilidade:** demais casos com scores válidos

## Permanência

- Entrada contratual: `data_inicio_ciclo` → `cliente_desde` → `created_at` (somente se não for lote fev/2026 de migração)

## Indicadores observados vs reconstruídos

| Campo | Tipo |
|-------|------|
| HS, E, M atuais | Observados (snapshot) |
| Histórico mensal no detalhe | Reconstruído (export pesquisa) |
| Probabilidade churn | Indisponível operacionalmente |
