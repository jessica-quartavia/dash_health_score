"""Diagnóstico de variáveis temporais PIT — Etapa 15."""
from __future__ import annotations

import pandas as pd


TEMPORAL_SPECS = [
    ("reunioes_30d", "Contagem PIT 30d — presente no export"),
    ("reunioes_90d", "Contagem PIT 90d"),
    ("reunioes_180d", "Contagem PIT 180d"),
    ("recencia_dias", "Dias desde última reunião até referência"),
    ("freq_media_mes", "Média mensal acumulada desde ciclo/entrada"),
    ("reunioes_acumuladas", "Total acumulado até referência"),
    ("meses_desde_primeira_obs", "Proxy tenure no painel (1ª obs do cliente no export)"),
    ("mecanismos_implantados", "Contagem implantados até referência"),
]


def temporal_feature_audit(df: pd.DataFrame) -> list[dict]:
    rows = []
    for col, desc in TEMPORAL_SPECS:
        if col not in df.columns:
            rows.append({"feature": col, "coverage": 0.0, "usable": False, "note": desc + " — ausente"})
            continue
        s = pd.to_numeric(df[col], errors="coerce") if col != "meses_desde_primeira_obs" else df[col]
        miss = float(s.isna().mean())
        zero_share = float((s == 0).mean()) if s.notna().any() else None
        rows.append(
            {
                "feature": col,
                "coverage": round(1 - miss, 4),
                "zero_share": round(zero_share, 4) if zero_share is not None else None,
                "usable": (1 - miss) > 0.5,
                "note": desc + "; imputação mediana só no pipeline sklearn — não confundir com churn=0.",
            }
        )
    if len(df) > 1 and "reunioes_90d" in df.columns and "reunioes_30d" in df.columns:
        v30 = pd.to_numeric(df["reunioes_30d"], errors="coerce")
        v90 = pd.to_numeric(df["reunioes_90d"], errors="coerce")
        both = v30.notna() & v90.notna()
        if both.sum() > 100:
            corr = float(v30[both].corr(v90[both]))
            rows.append(
                {
                    "feature": "variacao_reunioes_30_vs_90",
                    "coverage": float(both.mean()),
                    "usable": True,
                    "note": f"Correlação 30d×90d={corr:.3f} — sinal redundante parcial.",
                }
            )
    rows.append(
        {
            "feature": "nps_historico",
            "coverage": 0.0,
            "usable": False,
            "note": "NPS point-in-time não está no dataset_preditivo_validado.csv atual.",
        }
    )
    rows.append(
        {
            "feature": "suporte_pendencias",
            "coverage": 0.0,
            "usable": False,
            "note": "Demandas/suporte históricos não exportados nesta versão.",
        }
    )
    return rows
