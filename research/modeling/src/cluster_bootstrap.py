from __future__ import annotations

import numpy as np


def cluster_rate_ci(
    df,
    y_col: str,
    client_col: str,
    mask=None,
    n_boot: int = 400,
    seed: int = 42,
) -> dict:
    """Taxa de desfecho com IC por reamostragem de clientes."""
    data = df if mask is None else df.loc[mask]
    if data.empty:
        return {"rate": None, "ci_low": None, "ci_high": None, "n_obs": 0, "n_clients": 0}
    clients = data[client_col].unique()
    rng = np.random.default_rng(seed)
    rates = []
    for _ in range(n_boot):
        pick = rng.choice(clients, size=len(clients), replace=True)
        sample = data[data[client_col].isin(pick)]
        if len(sample):
            rates.append(float(sample[y_col].mean()))
    arr = np.array(rates) if rates else np.array([float(data[y_col].mean())])
    return {
        "rate": float(data[y_col].mean()),
        "ci_low": float(np.percentile(arr, 2.5)),
        "ci_high": float(np.percentile(arr, 97.5)),
        "n_obs": int(len(data)),
        "n_clients": int(len(clients)),
    }


def paired_auc_diff_ci(
    df,
    y_col: str,
    score_a,
    score_b,
    client_col: str,
    n_boot: int = 200,
    seed: int = 42,
) -> dict:
    from src.metrics import safe_auc

    clients = df[client_col].unique()
    rng = np.random.default_rng(seed)
    diffs = []
    for _ in range(n_boot):
        pick = rng.choice(clients, size=len(clients), replace=True)
        idx = df[client_col].isin(pick)
        y = df.loc[idx, y_col].values
        if len(np.unique(y)) < 2:
            continue
        auc_a = safe_auc(y, score_a[idx])
        auc_b = safe_auc(y, score_b[idx])
        if auc_a is not None and auc_b is not None:
            diffs.append(auc_a - auc_b)
    if not diffs:
        return {"diff_mean": None, "ci_low": None, "ci_high": None}
    arr = np.array(diffs)
    return {
        "diff_mean": float(arr.mean()),
        "ci_low": float(np.percentile(arr, 2.5)),
        "ci_high": float(np.percentile(arr, 97.5)),
        "n": int(len(arr)),
    }
