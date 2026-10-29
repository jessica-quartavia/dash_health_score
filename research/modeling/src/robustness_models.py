from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from src.metrics import classification_metrics, safe_auc
from src.models import FEATURE_SETS, fit_model, predict_proba


def logistic_pipe(numeric, categorical, cfg):
    transformers = []
    if numeric:
        transformers.append(
            (
                "num",
                Pipeline([("imputer", SimpleImputer(strategy="median")), ("scaler", StandardScaler())]),
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
                        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
                    ]
                ),
                categorical,
            )
        )
    pre = ColumnTransformer(transformers=transformers)
    clf = LogisticRegression(
        C=float(cfg["logistic"]["C"]),
        max_iter=int(cfg["logistic"]["max_iter"]),
        class_weight="balanced",
        random_state=int(cfg["seed"]),
    )
    return Pipeline([("prep", pre), ("clf", clf)])


def fit_custom(train, numeric, categorical, cfg):
    pipe = logistic_pipe(numeric, categorical, cfg)
    pipe.fit(train[numeric + categorical], train["y"])
    return pipe


def eval_pipe(pipe, test, numeric, categorical):
    prob = pipe.predict_proba(test[numeric + categorical])[:, 1]
    m = classification_metrics(test["y"], prob)
    return {"roc_auc": m["roc_auc"], "pr_auc": m["pr_auc"], "n": m["n"], "prevalence": m["prevalence"]}


def run_m_sensitivity(train, test, cfg) -> dict:
    """Variantes de M / sem M / M confiável."""
    results = {}

    # baseline E from etapa 4 style
    base_e = fit_model("A", train, cfg)
    m_a = classification_metrics(test["y"], predict_proba(base_e, test))
    results["A_sem_M"] = {"test": {"roc_auc": m_a["roc_auc"], "pr_auc": m_a["pr_auc"]}}

    base_e_full = fit_model("E", train, cfg)
    m_e = classification_metrics(test["y"], predict_proba(base_e_full, test))
    results["E_completo"] = {"test": {"roc_auc": m_e["roc_auc"], "pr_auc": m_e["pr_auc"]}}

    # M only on rows where cobertura mecanismos completa + integral
    conf_mask_train = (train["cobertura_mecanismos"] == "completa") & (
        train.get("confiabilidade_reconstrucao", "integral") == "integral"
    )
    conf_mask_test = (test["cobertura_mecanismos"] == "completa") & (
        test.get("confiabilidade_reconstrucao", "integral") == "integral"
    )
    numeric = ["engajamento_historico", "mecanismos_historico", "mecanismos_implantados", "freq_media_mes"]
    categorical = ["programa"]
    if conf_mask_train.sum() > 100 and conf_mask_test.sum() > 50:
        tr = train.loc[conf_mask_train]
        te = test.loc[conf_mask_test]
        pipe = fit_custom(tr, numeric, categorical, cfg)
        results["E_M_somente_cobertura_completa"] = {"test_subset": eval_pipe(pipe, te, numeric, categorical), "n_test": int(len(te))}
    else:
        results["E_M_somente_cobertura_completa"] = {"skipped": "amostra insuficiente"}

    # M features zeroed when cobertura not completa
    tr2 = train.copy()
    te2 = test.copy()
    bad = tr2["cobertura_mecanismos"] != "completa"
    tr2.loc[bad, ["mecanismos_historico", "mecanismos_implantados"]] = np.nan
    badt = te2["cobertura_mecanismos"] != "completa"
    te2.loc[badt, ["mecanismos_historico", "mecanismos_implantados"]] = np.nan
    pipe2 = fit_custom(tr2, numeric, categorical, cfg)
    results["E_M_com_mascara_incerteza"] = {"test": eval_pipe(pipe2, te2, numeric, categorical)}

    base_d = fit_model("D", train, cfg)
    m_d = classification_metrics(test["y"], predict_proba(base_d, test))
    results["D_sem_E_M_scores"] = {"test": {"roc_auc": m_d["roc_auc"], "pr_auc": m_d["pr_auc"]}}

    return results


def run_recencia_variants(train, test, cfg) -> dict:
    numeric_with = ["engajamento_historico", "freq_media_mes", "reunioes_30d", "reunioes_90d", "recencia_dias"]
    tr = train.copy()
    te = test.copy()
    tr["recencia_ausente_flag"] = tr["recencia_dias"].isna() | (tr["recencia_dias"].astype(str).str.strip() == "")
    te["recencia_ausente_flag"] = te["recencia_dias"].isna() | (te["recencia_dias"].astype(str).str.strip() == "")
    tr["recencia_ausente_flag"] = tr["recencia_ausente_flag"].astype(int)
    te["recencia_ausente_flag"] = te["recencia_ausente_flag"].astype(int)

    pipe_with = fit_custom(tr, numeric_with, [], cfg)
    out_with = eval_pipe(pipe_with, te, numeric_with, [])

    numeric_no = [c for c in numeric_with if c != "recencia_dias"]
    pipe_no = fit_custom(tr, numeric_no, [], cfg)
    out_no = eval_pipe(pipe_no, te, numeric_no, [])

    numeric_ind = numeric_no + ["recencia_ausente_flag"]
    tr["recencia_fill"] = pd.to_numeric(tr["recencia_dias"], errors="coerce").fillna(tr["recencia_dias"].median())
    te["recencia_fill"] = pd.to_numeric(te["recencia_dias"], errors="coerce").fillna(tr["recencia_fill"].median())
    pipe_ind = fit_custom(tr, numeric_ind + ["recencia_fill"], [], cfg)
    out_ind = eval_pipe(pipe_ind, te, numeric_ind + ["recencia_fill"], [])

    return {
        "com_recencia": out_with,
        "sem_recencia": out_no,
        "recencia_mais_indicador_ausencia": out_ind,
    }


def stratified_test_metrics(test, prob, cfg) -> dict:
    out = {}
    d = test.copy()
    d["_prob"] = prob
    if "programa" in d.columns:
        for prog, g in d.groupby("programa"):
            if len(g) < 80 or g["y"].nunique() < 2:
                continue
            out[f"programa_{prog}"] = {"roc_auc": safe_auc(g["y"], g["_prob"]), "n": int(len(g))}
    d["hs_faixa"] = pd.cut(d["hs_historico"], bins=[-0.1, 20, 40, 60, 80, 100.1], labels=["0-20", "20-40", "40-60", "60-80", "80-100"])
    for label, g in d.groupby("hs_faixa", observed=False):
        if pd.isna(label) or len(g) < 60 or g["y"].nunique() < 2:
            continue
        out[f"hs_{label}"] = {"roc_auc": safe_auc(g["y"], g["_prob"]), "n": int(len(g))}
    return out
