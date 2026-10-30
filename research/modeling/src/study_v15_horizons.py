"""Horizontes de desfecho — 90d e 180d no export validado."""
from __future__ import annotations

import pandas as pd

from src.data import bool_col, numeric_col
from src.models import fit_model, predict_proba
from src.metrics import classification_metrics, safe_auc
from src.splits import assign_temporal_split


def prepare_horizon_frame(df: pd.DataFrame, cfg: dict, days: int) -> pd.DataFrame:
    if days == 90:
        target, elig, cens = "desfecho_churn_90d", "elegivel_modelagem_90d", "censura_90d"
    elif days == 180:
        target, elig, cens = "desfecho_churn_180d", "elegivel_modelagem_180d", "censura_180d"
    else:
        raise ValueError("Horizonte não exportado — apenas 90 e 180 disponíveis no CSV validado.")
    out = df.copy()
    out["y"] = bool_col(out[target]).astype(int)
    out["eligible"] = bool_col(out[elig])
    out["censored"] = bool_col(out[cens])
    out["mes"] = out[cfg["reference_col"]].astype(str)
    out["ref_dt"] = pd.to_datetime(out[cfg["reference_date_col"]], utc=True, errors="coerce")
    for col in ["hs_historico", "engajamento_historico", "mecanismos_historico"]:
        if col in out.columns:
            out[col] = numeric_col(out[col])
    return out[out["eligible"] & ~out["censored"]].copy()


def horizon_summary(df_raw: pd.DataFrame, cfg: dict) -> list[dict]:
    rows = []
    for days in (90, 180):
        try:
            m = prepare_horizon_frame(df_raw, cfg, days)
        except ValueError as e:
            rows.append({"horizon_days": days, "error": str(e)})
            continue
        pos = int(m["y"].sum())
        rows.append(
            {
                "horizon_days": days,
                "labeled_rows": int(len(m)),
                "unique_clients": int(m[cfg["client_col"]].nunique()),
                "positive_rows": pos,
                "observed_rate": float(m["y"].mean()) if len(m) else None,
                "note_30_60": "Horizontes 30d/60d exigem extensão do export (janelas no build-validated); não inferidos aqui.",
            }
        )
    return rows


def model_e_auc_by_horizon(df_raw: pd.DataFrame, cfg: dict) -> list[dict]:
    """Modelo E refit no mesmo split temporal — somente métrica exploratória por horizonte."""
    out = []
    for days in (90, 180):
        m = prepare_horizon_frame(df_raw, cfg, days)
        if m.empty:
            continue
        split = assign_temporal_split(m, cfg)
        if split.test.empty or split.train.empty:
            out.append({"horizon_days": days, "roc_auc_test": None, "note": split.note})
            continue
        fit_train = pd.concat([split.train, split.val], ignore_index=True) if not split.val.empty else split.train
        model = fit_model("E", fit_train, cfg)
        prob = predict_proba(model, split.test)
        metrics = classification_metrics(split.test["y"], prob)
        out.append(
            {
                "horizon_days": days,
                "test_months": split.test_months,
                "roc_auc_test": metrics.get("roc_auc"),
                "pr_auc_test": metrics.get("pr_auc"),
                "prevalence_test": metrics.get("prevalence"),
                "n_test": metrics.get("n"),
                "note": "Mesmo protocolo de split; jun/2026 não é validação confirmatória.",
            }
        )
    return out
