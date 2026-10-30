# Estudo de pesos E/M — Health Score

Gerado: 2026-10-29T21:39:11.790Z

## Fórmula

HS(w) = w × E + (1 − w) × M, w ∈ [0,1]

## Auditoria (pré-otimização)

- **pointInTime**: hs_historico_mensal disponível no export validado
- **eligible90**: 18638
- **positives90**: 3855
- **censored90**: 6042
- **clientDependency**: observações repetidas por cliente — usar IC cluster / bootstrap
- **mHistoricalReliability**: sensibilidade M documentada (Etapa 5)
- **holdoutNote**: Conjunto teste 2026-06 já usado em experimentos — não usar como validação confirmatória de novos pesos.

## Recomendação

- **Decisão**: `maintain_50_50`
- Manter 50/50 como HS operacional. Grid completo de 21 pesos exige refit no dataset validado; jun/2026 não serve como teste confirmatório.
- Resultados condicionados a cobertura, censura e vieses documentados na pesquisa. Sem validação temporal independente adicional.

## Grid de pesos (21 combinações)

| E% | M% | ROC-AUC (teste) | PR-AUC | Fonte |
|---:|---:|---:|---:|---|
| 0 | 100 | 0.6004180398140647 | 0.1691215246107764 | model_B_proxy |
| 5 | 95 | — | — | requires_row_level_refit |
| 10 | 90 | — | — | requires_row_level_refit |
| 15 | 85 | — | — | requires_row_level_refit |
| 20 | 80 | — | — | requires_row_level_refit |
| 25 | 75 | — | — | requires_row_level_refit |
| 30 | 70 | — | — | requires_row_level_refit |
| 35 | 65 | — | — | requires_row_level_refit |
| 40 | 60 | — | — | requires_row_level_refit |
| 45 | 55 | — | — | requires_row_level_refit |
| 50 | 50 | 0.6740793685750466 | 0.20452357446249092 | model_C_holdout_jun2026_exploratory |
| 55 | 45 | — | — | requires_row_level_refit |
| 60 | 40 | — | — | requires_row_level_refit |
| 65 | 35 | — | — | requires_row_level_refit |
| 70 | 30 | — | — | requires_row_level_refit |
| 75 | 25 | — | — | requires_row_level_refit |
| 80 | 20 | — | — | requires_row_level_refit |
| 85 | 15 | — | — | requires_row_level_refit |
| 90 | 10 | — | — | requires_row_level_refit |
| 95 | 5 | — | — | requires_row_level_refit |
| 100 | 0 | 0.5992441462628106 | 0.18026963160318282 | model_A_proxy |

## Baselines de modelos (A–E)

Ver `research/modeling/output/modeling_results.json` para curvas, calibração e limitações.

