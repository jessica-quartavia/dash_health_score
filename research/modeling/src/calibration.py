"""Calibração probabilística — Etapa 17."""
from __future__ import annotations

import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression


def _logit(p: np.ndarray, eps: float = 1e-6) -> np.ndarray:
    p = np.clip(np.asarray(p, dtype=float), eps, 1 - eps)
    return np.log(p / (1 - p))


def calibration_intercept_slope(y_true, y_prob) -> dict:
    """Intercepto e inclinação na escala logit (calibração de Cox/Hosmer-Lemeshow simplificada)."""
    y = np.asarray(y_true, dtype=float)
    p = np.clip(np.asarray(y_prob, dtype=float), 1e-6, 1 - 1e-6)
    if len(y) < 30 or len(np.unique(y)) < 2:
        return {"intercept": None, "slope": None, "n": int(len(y)), "note": "amostra insuficiente"}
    x = _logit(p).reshape(-1, 1)
    lr = LogisticRegression(penalty="l2", C=1e6, solver="lbfgs", max_iter=500)
    lr.fit(x, y)
    return {
        "intercept": float(lr.intercept_[0]),
        "slope": float(lr.coef_[0][0]),
        "n": int(len(y)),
        "note": "slope≈1 e intercept≈0 indicam calibração agregada razoável na escala logit",
    }


def platt_scale_fit(y_val, p_val) -> LogisticRegression | None:
    y = np.asarray(y_val)
    p = np.asarray(p_val)
    if len(y) < 50 or len(np.unique(y)) < 2:
        return None
    x = p.reshape(-1, 1)
    lr = LogisticRegression(penalty="l2", C=1e6, max_iter=1000)
    lr.fit(x, y)
    return lr


def platt_scale_apply(calibrator: LogisticRegression | None, p: np.ndarray) -> np.ndarray:
    if calibrator is None:
        return np.asarray(p, dtype=float)
    return calibrator.predict_proba(np.asarray(p).reshape(-1, 1))[:, 1]


def isotonic_fit(y_val, p_val) -> IsotonicRegression | None:
    y = np.asarray(y_val)
    p = np.asarray(p_val)
    if len(y) < 80 or len(np.unique(y)) < 2:
        return None
    ir = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    ir.fit(p, y)
    return ir


def isotonic_apply(model: IsotonicRegression | None, p: np.ndarray) -> np.ndarray:
    if model is None:
        return np.asarray(p, dtype=float)
    return model.predict(np.asarray(p))


def risk_groups(y_true, y_prob, n_groups: int = 5) -> list[dict]:
    """Grupos por quantil de risco previsto — para gráfico previsto vs observado."""
    y = np.asarray(y_true)
    p = np.asarray(y_prob)
    if len(y) < n_groups * 10:
        return []
    order = np.argsort(p)
    edges = np.linspace(0, len(y), n_groups + 1, dtype=int)
    rows = []
    for g in range(n_groups):
        idx = order[edges[g] : edges[g + 1]]
        if len(idx) == 0:
            continue
        rows.append(
            {
                "group": g + 1,
                "label": f"G{g + 1}",
                "pred_mean": float(p[idx].mean()),
                "observed_rate": float(y[idx].mean()),
                "n": int(len(idx)),
            }
        )
    return rows


def probability_summary(y_true, y_prob) -> dict:
    y = np.asarray(y_true)
    p = np.asarray(y_prob)
    return {
        "prevalence_observed": float(y.mean()) if len(y) else None,
        "prob_mean": float(p.mean()) if len(p) else None,
        "prob_median": float(np.median(p)) if len(p) else None,
        "prob_p10": float(np.percentile(p, 10)) if len(p) else None,
        "prob_p90": float(np.percentile(p, 90)) if len(p) else None,
    }
