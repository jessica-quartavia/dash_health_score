from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

import pandas as pd


@dataclass
class TemporalSplit:
    train: pd.DataFrame
    val: pd.DataFrame
    test: pd.DataFrame
    train_months: list[str]
    val_months: list[str]
    test_months: list[str]
    purged_train_rows: int
    note: str


def month_sort_key(m: str) -> tuple[int, int]:
    y, mo = m.split("-")
    return int(y), int(mo)


def assign_temporal_split(df: pd.DataFrame, cfg: dict) -> TemporalSplit:
    months = sorted(df["mes"].unique(), key=month_sort_key)
    horizon = int(cfg.get("purge_horizon_days", 90))
    min_train = 400
    min_test = 200

    if len(months) < 3:
        return TemporalSplit(
            df.iloc[0:0],
            df.iloc[0:0],
            df.iloc[0:0],
            [],
            [],
            [],
            0,
            "Menos de 3 meses com rótulo 90d — impossível hold-out temporal.",
        )

    best = None
    # Escolhe o hold-out de teste mais tardio possível com treino purgado não vazio
    for test_start_idx in range(len(months) - 1, 0, -1):
        test_months = months[test_start_idx:]
        test_start = pd.Timestamp(f"{test_months[0]}-01", tz="UTC")
        cutoff = test_start - timedelta(days=horizon)

        before = df[df["mes"].isin([m for m in months if m < test_months[0]])]
        purged = before[before["ref_dt"] <= cutoff]
        purged_n = len(before) - len(purged)
        test = df[df["mes"].isin(test_months)].copy()

        if len(purged) < min_train or len(test) < min_test:
            continue

        train_months = sorted(purged["mes"].unique(), key=month_sort_key)
        val_months: list[str] = []
        val = df.iloc[0:0].copy()
        # mês imediatamente anterior ao teste, se não invadir treino purgado
        if test_start_idx >= 2:
            candidate = months[test_start_idx - 1]
            val_start = pd.Timestamp(f"{candidate}-01", tz="UTC")
            val_cut = val_start - timedelta(days=horizon)
            val_rows = df[(df["mes"] == candidate) & (df["ref_dt"] <= val_cut)]
            if len(val_rows) >= 50:
                val_months = [candidate]
                val = df[df["mes"] == candidate].copy()

        note = (
            f"Hold-out temporal: treino (ref+{horizon}d < início do teste) meses {train_months}, "
            f"val {val_months or '—'}, teste {test_months}. "
            f"Excluídos {purged_n} registros de meses anteriores ao teste por purga."
        )
        best = TemporalSplit(purged, val, test, train_months, val_months, test_months, purged_n, note)
        break

    if not best:
        return TemporalSplit(
            df.iloc[0:0],
            df.iloc[0:0],
            df.iloc[0:0],
            [],
            [],
            [],
            0,
            f"Cobertura de rótulos 90d ({months}) não permite treino purgado + teste ({horizon}d).",
        )
    return best
