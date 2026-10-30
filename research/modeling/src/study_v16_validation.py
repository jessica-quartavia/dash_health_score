"""Validação temporal Etapa 16 — jun/2026 não é hold-out confirmatório de seleção."""
from __future__ import annotations

from datetime import timedelta

import pandas as pd

from src.splits import TemporalSplit, month_sort_key


JUNE_REFERENCE_ONLY = ["2026-06"]
DEFAULT_HOLDOUT_CANDIDATES = ["2026-07", "2026-08", "2026-05"]


def pick_holdout_month(df: pd.DataFrame, candidates: list[str] | None = None, min_test: int = 150) -> tuple[str | None, str]:
    months = set(df["mes"].astype(str))
    for m in candidates or DEFAULT_HOLDOUT_CANDIDATES:
        if m in JUNE_REFERENCE_ONLY:
            continue
        if m not in months:
            continue
        n = int((df["mes"].astype(str) == m).sum())
        if n >= min_test:
            return m, f"Hold-out exploratório principal: {m} (jun/2026 reservado apenas como referência histórica Etapa 4)."
    return None, "Nenhum mês posterior com amostra suficiente — usar backtests mensais apenas."


def temporal_split_holdout(
    df: pd.DataFrame,
    holdout_month: str,
    horizon_days: int,
) -> TemporalSplit:
    months = sorted(df["mes"].unique(), key=month_sort_key)
    test_start = pd.Timestamp(f"{holdout_month}-01", tz="UTC")
    cutoff = test_start - timedelta(days=horizon_days)
    before = df[df["mes"].isin([m for m in months if m < holdout_month])]
    purged = before[before["ref_dt"] <= cutoff]
    purged_n = len(before) - len(purged)
    train = purged.copy()
    test = df[df["mes"].astype(str) == holdout_month].copy()
    train_months = sorted(train["mes"].unique(), key=month_sort_key)
    note = (
        f"Treino purgado {horizon_days}d até {holdout_month}: meses {train_months}; "
        f"teste {holdout_month}; excluídos {purged_n} por purga. "
        f"Jun/2026 não usado como hold-out de seleção nesta etapa."
    )
    return TemporalSplit(train, df.iloc[0:0].copy(), test, train_months, [], [holdout_month], purged_n, note)


def inner_val_months(train_months: list[str], n_val: int = 2) -> tuple[list[str], list[str]]:
    ordered = sorted(train_months, key=month_sort_key)
    if len(ordered) <= n_val + 2:
        split_at = max(1, len(ordered) - 1)
    else:
        split_at = len(ordered) - n_val
    return ordered[:split_at], ordered[split_at:]


def walk_forward_backtests(df: pd.DataFrame, cfg: dict, fit_predict_fn, exclude: set[str] | None = None) -> list[dict]:
    """Backtests mensais exploratórios (sem tuning no mês alvo)."""
    exclude = exclude or set(JUNE_REFERENCE_ONLY)
    months = sorted(df["mes"].unique(), key=month_sort_key)
    rows = []
    horizon = int(cfg.get("purge_horizon_days", 90))
    for hm in months:
        if hm in exclude:
            continue
        split = temporal_split_holdout(df, hm, horizon)
        if len(split.train) < 400 or len(split.test) < 120:
            continue
        met = fit_predict_fn(split.train, split.test)
        if met:
            met["holdout_month"] = hm
            met["purpose"] = "exploratory_walk_forward"
            rows.append(met)
    return rows
