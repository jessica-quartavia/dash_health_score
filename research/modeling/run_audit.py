#!/usr/bin/env python3
"""Auditoria pré-modelagem (Etapa 4)."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import yaml

from src.data import bool_col, load_datasets, modeling_frame, numeric_col, prepare_labeled


ROOT = Path(__file__).resolve().parent


def main() -> None:
    cfg = yaml.safe_load((ROOT / "config.yaml").read_text(encoding="utf-8"))
    data_dir = (ROOT / cfg["data_dir"]).resolve()
    out_dir = (ROOT / cfg["output_dir"]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    tables = load_datasets(data_dir)
    df = tables["validated"]
    churn = tables["churn"]
    labeled = prepare_labeled(df, cfg)
    model_df = modeling_frame(df, cfg)

    conflict_clients = set()
    if "conflito_datas" in churn.columns:
        mask = bool_col(churn["conflito_datas"]) & bool_col(churn.get("churn_confirmado", pd.Series(["true"] * len(churn))))
        conflict_clients = set(churn.loc[mask, "cliente_ref"].astype(str))

    pos = model_df[model_df["y"] == 1]
    pos_per_client = pos.groupby("cliente_ref").size()
    reactivated_hint = labeled.groupby("cliente_ref")["mes"].nunique()

    hs_numeric = numeric_col(labeled["hs_historico"]) if "hs_historico" in labeled.columns else pd.Series(dtype=float)
    audit = {
        "unique_clients_all": int(labeled["cliente_ref"].nunique()),
        "unique_clients_labeled_90d": int(model_df["cliente_ref"].nunique()),
        "unique_clients_with_churn_outcome": int(pos["cliente_ref"].nunique()),
        "positive_rows_90d": int(len(pos)),
        "negative_rows_90d": int((model_df["y"] == 0).sum()),
        "positive_months_per_client_mean": float(pos_per_client.mean()) if len(pos_per_client) else 0.0,
        "positive_months_per_client_max": int(pos_per_client.max()) if len(pos_per_client) else 0,
        "positive_by_ref_month": pos.groupby("mes").size().astype(int).to_dict(),
        "negative_by_ref_month": model_df[model_df["y"] == 0].groupby("mes").size().astype(int).to_dict(),
        "coverage_by_month": labeled.groupby("mes").size().astype(int).to_dict(),
        "date_conflict_clients": len(conflict_clients),
        "date_conflict_client_refs_sample": list(sorted(conflict_clients))[:10],
        "reactivated_proxy_multi_month_span": int((reactivated_hint > 6).sum()),
        "hs_distribution": {
            "count": int(hs_numeric.notna().sum()),
            "mean": float(hs_numeric.mean()) if hs_numeric.notna().any() else None,
            "p25": float(hs_numeric.quantile(0.25)) if hs_numeric.notna().any() else None,
            "p50": float(hs_numeric.quantile(0.50)) if hs_numeric.notna().any() else None,
            "p75": float(hs_numeric.quantile(0.75)) if hs_numeric.notna().any() else None,
        },
        "missing_rates_labeled": {
            c: float(model_df[c].isna().mean()) for c in model_df.columns if c.startswith(("engajamento", "mecanismos_historico", "hs_historico", "recencia"))
        },
        "constant_columns_labeled": [
            c
            for c in model_df.columns
            if model_df[c].nunique(dropna=True) <= 1 and c not in ("y", "eligible", "censored")
        ],
        "m_retrospective_note": (
            "M usa status snapshot; linhas cobertura_mecanismos=parcial podem ter viés retrospectivo. "
            "Não assumir confiabilidade_reconstrucao=integral como prova histórica perfeita."
        ),
        "confiabilidade_counts": labeled["confiabilidade_reconstrucao"].value_counts(dropna=False).astype(int).to_dict()
        if "confiabilidade_reconstrucao" in labeled.columns
        else {},
        "cobertura_mecanismos_counts": labeled["cobertura_mecanismos"].value_counts(dropna=False).astype(int).to_dict()
        if "cobertura_mecanismos" in labeled.columns
        else {},
    }

    sens = model_df[~model_df["cliente_ref"].isin(conflict_clients)]
    audit["sensitivity_exclude_conflicts"] = {
        "rows": int(len(sens)),
        "positives": int(sens["y"].sum()),
        "prevalence": float(sens["y"].mean()) if len(sens) else None,
    }

    (out_dir / "pre_audit.json").write_text(json.dumps(audit, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"pre_audit.json -> {out_dir}")


if __name__ == "__main__":
    main()
