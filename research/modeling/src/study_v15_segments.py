"""Auditoria de churn observado por segmento — Etapa 15."""
from __future__ import annotations

import pandas as pd

from src.cluster_bootstrap import cluster_rate_ci


def _hs_band(hs: pd.Series) -> pd.Series:
    return pd.cut(
        hs,
        bins=[-0.1, 20, 40, 60, 80, 100.1],
        labels=["0-20", "20-40", "40-60", "60-80", "80-100"],
    )


def segment_churn_table(df: pd.DataFrame, client_col: str, y_col: str = "y", seed: int = 42) -> list[dict]:
    rows = []
    specs = [
        ("implantacao", df["classificacao_historica"].astype(str).eq("Em implantação")),
        ("pos_implantacao", ~df["classificacao_historica"].astype(str).eq("Em implantação")),
        ("sem_reunioes", df.get("reunioes_acumuladas", pd.Series(0, index=df.index)).fillna(0) <= 0),
        (
            "sem_vinculo_mec",
            df.get("cobertura_mecanismos", pd.Series("", index=df.index)).astype(str).str.contains("sem_vinculo", case=False, na=False),
        ),
        (
            "historico_integral",
            df.get("confiabilidade_reconstrucao", pd.Series("", index=df.index)).astype(str).str.contains("integral", case=False, na=False),
        ),
        (
            "historico_parcial_ou_pior",
            ~df.get("confiabilidade_reconstrucao", pd.Series("", index=df.index)).astype(str).str.contains("integral", case=False, na=False),
        ),
    ]
    if "hs_historico" in df.columns:
        hs = pd.to_numeric(df["hs_historico"], errors="coerce")
        specs.extend(
            [
                ("hs_0_20", _hs_band(hs).astype(str).eq("0-20")),
                ("hs_20_plus", _hs_band(hs).astype(str).isin(["20-40", "40-60", "60-80", "80-100"])),
            ]
        )
    for seg_id, mask in specs:
        sub = df.loc[mask]
        if len(sub) < 30:
            rows.append(
                {
                    "segment": seg_id,
                    "n_obs": int(len(sub)),
                    "n_clients": int(sub[client_col].nunique()) if len(sub) else 0,
                    "churn_rate": None,
                    "ci_low": None,
                    "ci_high": None,
                    "insufficient": True,
                }
            )
            continue
        ci = cluster_rate_ci(sub, y_col, client_col, n_boot=400, seed=seed)
        rows.append(
            {
                "segment": seg_id,
                "n_obs": ci["n_obs"],
                "n_clients": ci["n_clients"],
                "churn_rate": ci["rate"],
                "ci_low": ci["ci_low"],
                "ci_high": ci["ci_high"],
                "insufficient": False,
            }
        )
    return rows


def hs_churn_by_phase(df: pd.DataFrame, client_col: str, y_col: str = "y", seed: int = 42) -> list[dict]:
    if "hs_historico" not in df.columns:
        return []
    out = []
    df = df.copy()
    df["_hs_band"] = _hs_band(pd.to_numeric(df["hs_historico"], errors="coerce"))
    for phase in ["Em implantação", "Saudável", "Atenção", "Crítico", "Sem registro"]:
        base = df[df["classificacao_historica"].astype(str).eq(phase)]
        if len(base) < 50:
            continue
        for band, g in base.groupby("_hs_band", observed=False):
            if pd.isna(band) or len(g) < 25:
                continue
            ci = cluster_rate_ci(g, y_col, client_col, n_boot=300, seed=seed)
            out.append(
                {
                    "phase": phase,
                    "hs_band": str(band),
                    "n_obs": ci["n_obs"],
                    "churn_rate": ci["rate"],
                    "ci_low": ci["ci_low"],
                    "ci_high": ci["ci_high"],
                }
            )
    return out
