from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from src.data import bool_col, load_csv


def load_readiness(data_dir: Path) -> dict:
    path = data_dir / "predictive_readiness.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def prospective_validation_plan(df: pd.DataFrame, data_dir: Path, cfg: dict) -> dict:
    readiness = load_readiness(data_dir)
    as_of = readiness.get("asOf") or (df["data_observacao_asof"].iloc[0] if "data_observacao_asof" in df.columns else None)

    labeled = df[df["y"].notna()].copy() if "y" in df.columns else df
    months = sorted(labeled["mes"].unique()) if "mes" in labeled.columns else []

    # Meses com janela 90d completa (negativos ou positivos rotulados)
    if "janela_90d_completa" in df.columns:
        complete = df[bool_col(df["janela_90d_completa"])]
        months_complete = sorted(complete["mes"].unique())
    else:
        months_complete = months

    used_test = ["2026-06"]
    used_train = ["2026-02"]
    unused_labeled = [m for m in months_complete if m not in used_test and m not in used_train]

    horizon = int(cfg.get("purge_horizon_days", 90))
    protocol = [
        "Congelar fórmulas HS 2.0 e features candidatas (hash/version em repositório).",
        f"Escolher mês de teste com ref+{horizon}d <= as-of dos rótulos e sem uso prévio em seleção.",
        "Não reajustar hiperparâmetros no período de teste.",
        "Avaliar ROC/PR, calibração (Brier, bins) e estabilidade por programa/permanência.",
        "Critérios operacionais: melhoria PR-AUC vs baseline E com IC pareado > 0; calibração ECE abaixo de limiar acordado; aprovação negócio.",
    ]

    can_confirm = len(unused_labeled) >= 1 and len(months_complete) >= 4
    note = (
        f"Meses rotulados 90d completos: {months_complete}. Candidatos não usados em hold-out documentado: {unused_labeled or 'nenhum'}. "
        + (
            "Possível validação adicional se população for suficiente por mês."
            if can_confirm
            else "Sem período independente adequado hoje — avaliação prospectiva forward-only."
        )
    )

    churn_path = data_dir / "distribuicao_churn_mes.csv"
    churn_events = []
    if churn_path.exists():
        churn_events = load_csv(churn_path).to_dict(orient="records")

    return {
        "version": "etapa7-v1",
        "as_of_dados": as_of,
        "meses_com_rotulo": months,
        "meses_janela_90d_completa": months_complete,
        "periodos_ja_utilizados": {"treino_documentado": used_train, "teste_documentado": used_test},
        "candidatos_validacao_futura": unused_labeled,
        "validacao_confirmatoria_viavel_agora": can_confirm,
        "protocolo": protocol,
        "nota": note,
        "evolucao_cobertura": {
            "readiness_training_ready": readiness.get("trainingReady"),
            "audit_hs_integral": readiness.get("audit", {}).get("hsIntegral"),
            "churn_por_mes_export": churn_events[-6:] if churn_events else [],
        },
        "caminho_risco_operacional": [
            "Manter HS (saúde) e qualidade informacional separados de score de risco.",
            "Publicar risco apenas após val confirmatória + calibração + governança (sem PII/scores individuais na UI operacional inicial).",
            "Monitorar drift de cobertura M e migração cadastral.",
        ],
    }
