"""Engenharia de variáveis point-in-time — Estudo Preditivo 2.0."""
from __future__ import annotations

import pandas as pd

NUMERIC_PIT = [
    "engajamento_historico",
    "mecanismos_historico",
    "freq_media_mes",
    "reunioes_acumuladas",
    "reunioes_30d",
    "reunioes_90d",
    "reunioes_180d",
    "recencia_dias",
    "mecanismos_implantados",
]

CATEGORICAL_PIT = [
    "programa",
    "classificacao_historica",
    "cobertura_engajamento",
    "cobertura_mecanismos",
    "confiabilidade_reconstrucao",
]

# HS separado — não combinar com E e M na mesma equação (colinearidade).
HS_ONLY = ["hs_historico"]


def enrich_frame(df: pd.DataFrame, client_col: str) -> pd.DataFrame:
    out = df.copy()
    out["em_implantacao"] = out["classificacao_historica"].astype(str).eq("Em implantação").astype(int)
    out["pos_implantacao"] = out["classificacao_historica"].astype(str).ne("Em implantação").astype(int)
    if "recencia_dias" in out.columns:
        out["recencia_ausente"] = out["recencia_dias"].isna().astype(int)
    else:
        out["recencia_ausente"] = 1
    if "reunioes_acumuladas" in out.columns:
        out["sem_reunioes_estrutural"] = (out["reunioes_acumuladas"].fillna(0) <= 0).astype(int)
    else:
        out["sem_reunioes_estrutural"] = 0
    if "cobertura_mecanismos" in out.columns:
        out["mec_sem_vinculo"] = out["cobertura_mecanismos"].astype(str).str.contains("sem_vinculo", case=False, na=False).astype(int)
    else:
        out["mec_sem_vinculo"] = 0
    # Tempo de painel: ordem do mês de referência por cliente (proxy de maturidade no export).
    if "mes" in out.columns:
        out["_mes_ord"] = pd.to_datetime(out["mes"] + "-01", utc=True, errors="coerce")
        out["meses_desde_primeira_obs"] = (
            out.groupby(client_col)["_mes_ord"].transform(lambda s: (s - s.min()).dt.days / 30.44)
        )
    else:
        out["meses_desde_primeira_obs"] = 0.0
    out.drop(columns=["_mes_ord"], errors="ignore", inplace=True)
    return out


def feature_catalog(df: pd.DataFrame) -> list[dict]:
    rows = []
    all_cols = NUMERIC_PIT + CATEGORICAL_PIT + HS_ONLY + [
        "em_implantacao",
        "recencia_ausente",
        "sem_reunioes_estrutural",
        "mec_sem_vinculo",
        "meses_desde_primeira_obs",
    ]
    for name in all_cols:
        if name not in df.columns:
            rows.append({"name": name, "usable": False, "coverage": 0.0, "note": "coluna ausente no export"})
            continue
        if name in CATEGORICAL_PIT:
            cov = float((df[name].astype(str).str.len() > 0).mean())
        else:
            cov = float(df[name].notna().mean())
        rows.append(
            {
                "name": name,
                "usable": cov > 0.05,
                "coverage": round(cov, 4),
                "note": "point-in-time no export validado",
            }
        )
    return rows


def logistic_v2_columns() -> tuple[list[str], list[str]]:
    numeric = [c for c in NUMERIC_PIT + ["meses_desde_primeira_obs", "em_implantacao", "recencia_ausente", "sem_reunioes_estrutural", "mec_sem_vinculo"]]
    categorical = [c for c in CATEGORICAL_PIT if c]
    return numeric, categorical


def survival_v2_columns() -> tuple[list[str], list[str]]:
    numeric, categorical = logistic_v2_columns()
    return numeric + ["meses_desde_primeira_obs"], categorical


def hgb_v2_columns() -> tuple[list[str], list[str]]:
    return logistic_v2_columns()
