# Etapa 4 — Validação estatística (pesquisa)

**Não operacional.** Gera métricas e artefatos locais a partir de `exports/predictive-study/`.

## Pré-requisitos

1. `npm run build:predictive-validated` (dataset validado).
2. Python 3.11+ e dependências:

```bash
cd research/modeling
python -m pip install -r requirements.txt
```

## Execução

```bash
python run_audit.py
python run_experiments.py
```

Ou na raiz do projeto:

```bash
npm run model:audit
npm run model:experiments
```

Saídas em `research/modeling/output/`:

- `pre_audit.json`
- `modeling_results.json`
- `models/*.joblib`

Notebook exploratório: `eda.ipynb` (mesma pasta de dados).

## Problema (90 dias)

- **População:** `elegivel_modelagem_90d=true` e `censura_90d=false`
- **Desfecho:** `desfecho_churn_90d`
- **Split:** cronológico por `mes_referencia` + purga de 90d antes da validação
- **Sensibilidade:** exclui clientes com `conflito_datas` no churn consolidado (config)

## Etapa 6 — HS 2.0 (pesquisa)

```bash
npm run model:etapa6
npm run test:etapa6
```

Saídas adicionais em `output/`: `hs_profiles_analysis.json`, `hs_data_quality.json`, `early_churn_audit.json`, `hs_sensitivity_results.json`, `HS_2_0_SPEC.md`, `RELATORIO_ETAPA6.md`, `etapa6_manifest.json`.

Recomendado: `npm run build:predictive-validated` para gerar `cancelamento_sinais.csv` (auditoria de intenção de saída).

## Etapa 7 — Laboratório HS 2.0

```bash
npm run model:etapa7
npm run test:etapa7
```

Saídas: `HS_2_0_PROTOTYPE.md`, `hs2_*.json`, `prospective_validation_plan.md`, `etapa7_manifest.json`.
