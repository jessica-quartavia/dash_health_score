from __future__ import annotations

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    log_loss,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
    precision_recall_curve,
)


def safe_auc(y_true, y_score) -> float | None:
    y_true = np.asarray(y_true)
    if len(np.unique(y_true)) < 2:
        return None
    return float(roc_auc_score(y_true, y_score))


def classification_metrics(y_true, y_prob, threshold: float = 0.5) -> dict:
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)
    y_pred = (y_prob >= threshold).astype(int)
    auc = safe_auc(y_true, y_prob)
    pr_auc = average_precision_score(y_true, y_prob) if len(np.unique(y_true)) > 1 else None
    out = {
        "roc_auc": auc,
        "pr_auc": float(pr_auc) if pr_auc is not None else None,
        "brier": float(brier_score_loss(y_true, y_prob)),
        "log_loss": float(log_loss(y_true, np.clip(y_prob, 1e-6, 1 - 1e-6))),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "threshold": threshold,
        "prevalence": float(y_true.mean()),
        "n": int(len(y_true)),
        "positives": int(y_true.sum()),
    }
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel()
    out["confusion"] = {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)}
    return out


def lift_at_top(y_true, y_score, fractions=(0.05, 0.10, 0.20)) -> dict:
    y_true = np.asarray(y_true)
    y_score = np.asarray(y_score)
    order = np.argsort(-y_score)
    base = y_true.mean() if len(y_true) else 0.0
    out = {}
    for frac in fractions:
        k = max(1, int(len(y_true) * frac))
        idx = order[:k]
        rate = float(y_true[idx].mean()) if k else 0.0
        out[f"top_{int(frac * 100)}pct_capture"] = float(y_true[idx].sum() / max(1, y_true.sum()))
        out[f"top_{int(frac * 100)}pct_rate"] = rate
        out[f"top_{int(frac * 100)}pct_lift"] = float(rate / base) if base > 0 else None
    return out


def curve_points(y_true, y_prob, max_points: int = 40) -> dict:
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)
    if len(np.unique(y_true)) < 2:
        return {"roc": [], "pr": []}
    fpr, tpr, _ = roc_curve(y_true, y_prob)
    prec, rec, _ = precision_recall_curve(y_true, y_prob)
    step = max(1, len(fpr) // max_points)
    roc = [{"fpr": float(a), "tpr": float(b)} for a, b in zip(fpr[::step], tpr[::step])]
    step2 = max(1, len(prec) // max_points)
    pr = [{"recall": float(r), "precision": float(p)} for p, r in zip(prec[::step2], rec[::step2])]
    return {"roc": roc, "pr": pr}


def calibration_bins(y_true, y_prob, n_bins: int = 10) -> list[dict]:
    y_true = np.asarray(y_true)
    y_prob = np.asarray(y_prob)
    bins = np.linspace(0, 1, n_bins + 1)
    rows = []
    for i in range(n_bins):
        lo, hi = bins[i], bins[i + 1]
        mask = (y_prob >= lo) & (y_prob < hi if i < n_bins - 1 else y_prob <= hi)
        if not mask.any():
            continue
        rows.append(
            {
                "bin_lo": float(lo),
                "bin_hi": float(hi),
                "pred_mean": float(y_prob[mask].mean()),
                "observed": float(y_true[mask].mean()),
                "n": int(mask.sum()),
            }
        )
    return rows


def bootstrap_auc_by_client(df, y_prob, client_col: str, n_boot: int, seed: int) -> dict:
    rng = np.random.default_rng(seed)
    clients = df[client_col].unique()
    aucs = []
    for _ in range(n_boot):
        sample = rng.choice(clients, size=len(clients), replace=True)
        idx = df[client_col].isin(sample)
        y = df.loc[idx, "y"].values
        s = y_prob[idx]
        auc = safe_auc(y, s)
        if auc is not None:
            aucs.append(auc)
    if not aucs:
        return {"mean": None, "ci_low": None, "ci_high": None, "n": 0}
    arr = np.array(aucs)
    return {
        "mean": float(arr.mean()),
        "ci_low": float(np.percentile(arr, 2.5)),
        "ci_high": float(np.percentile(arr, 97.5)),
        "n": int(len(arr)),
    }
