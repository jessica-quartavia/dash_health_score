from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


FEATURE_SETS = {
    "A": {
        "label": "Engajamento (E)",
        "numeric": ["engajamento_historico", "freq_media_mes", "reunioes_30d", "reunioes_90d", "recencia_dias"],
        "categorical": [],
    },
    "B": {
        "label": "Mecanismos (M)",
        "numeric": ["mecanismos_historico", "mecanismos_implantados"],
        "categorical": [],
    },
    "C": {
        "label": "Health Score 50/50",
        "numeric": ["hs_historico"],
        "categorical": [],
    },
    "D": {
        "label": "Estruturados (sem E/M/HS)",
        "numeric": [
            "reunioes_acumuladas",
            "reunioes_30d",
            "reunioes_90d",
            "reunioes_180d",
            "recencia_dias",
            "freq_media_mes",
            "mecanismos_implantados",
        ],
        "categorical": ["programa"],
    },
    "E": {
        "label": "Estruturados + E + M",
        "numeric": [
            "engajamento_historico",
            "mecanismos_historico",
            "reunioes_acumuladas",
            "reunioes_30d",
            "reunioes_90d",
            "reunioes_180d",
            "recencia_dias",
            "freq_media_mes",
            "mecanismos_implantados",
        ],
        "categorical": ["programa"],
    },
}


@dataclass
class TrainedModel:
    model_id: str
    pipeline: Pipeline
    features: list[str]
    coef_summary: list[dict]


def build_pipeline(
    numeric: list[str],
    categorical: list[str],
    cfg: dict,
    class_weight: str | None = "balanced",
) -> Pipeline:
    transformers = []
    if numeric:
        transformers.append(
            (
                "num",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                numeric,
            )
        )
    if categorical:
        transformers.append(
            (
                "cat",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        (
                            "onehot",
                            OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                        ),
                    ]
                ),
                categorical,
            )
        )
    pre = ColumnTransformer(transformers=transformers)
    clf = LogisticRegression(
        C=float(cfg["logistic"]["C"]),
        max_iter=int(cfg["logistic"]["max_iter"]),
        class_weight=class_weight,
        random_state=int(cfg["seed"]),
    )
    return Pipeline([("prep", pre), ("clf", clf)])


def fit_model(
    model_id: str,
    train: pd.DataFrame,
    cfg: dict,
    class_weight: str | None = "balanced",
    C: float | None = None,
) -> TrainedModel:
    spec = FEATURE_SETS[model_id]
    numeric = [c for c in spec["numeric"] if c in train.columns]
    categorical = [c for c in spec["categorical"] if c in train.columns]
    local_cfg = cfg
    if C is not None:
        local_cfg = {**cfg, "logistic": {**cfg.get("logistic", {}), "C": C}}
    pipe = build_pipeline(numeric, categorical, local_cfg, class_weight=class_weight)
    X = train[numeric + categorical]
    y = train["y"]
    pipe.fit(X, y)
    coef_summary = extract_coefs(pipe, numeric, categorical)
    return TrainedModel(model_id, pipe, numeric + categorical, coef_summary)


def predict_proba(model: TrainedModel, df: pd.DataFrame) -> np.ndarray:
    spec = FEATURE_SETS[model.model_id]
    numeric = [c for c in spec["numeric"] if c in df.columns]
    categorical = [c for c in spec["categorical"] if c in df.columns]
    X = df[numeric + categorical]
    return model.pipeline.predict_proba(X)[:, 1]


def extract_coefs(pipe: Pipeline, numeric: list[str], categorical: list[str]) -> list[dict]:
    clf = pipe.named_steps["clf"]
    prep = pipe.named_steps["prep"]
    names = prep.get_feature_names_out()
    coefs = clf.coef_[0]
    rows = []
    for name, coef in zip(names, coefs):
        rows.append({"feature": name, "coef": float(coef)})
    rows.sort(key=lambda r: abs(r["coef"]), reverse=True)
    return rows[:25]


def baseline_prevalence(train: pd.DataFrame, test: pd.DataFrame) -> np.ndarray:
    p = float(train["y"].mean())
    return np.full(len(test), p)


def baseline_score(test: pd.DataFrame, col: str) -> np.ndarray | None:
    if col not in test.columns:
        return None
    s = pd.to_numeric(test[col], errors="coerce")
    if s.notna().sum() == 0:
        return None
    # higher risk = lower engagement / lower M / lower HS → invert for score-as-risk
    filled = s.fillna(s.median())
    return (filled.max() - filled).values
