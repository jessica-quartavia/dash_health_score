#!/usr/bin/env python3
"""Estudo Preditivo 2.0 — auditoria, três famílias de modelos, manifesto versionado."""
from __future__ import annotations

import hashlib
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
import yaml
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression

from src.data import load_datasets, modeling_frame
from src.metrics import (
    bootstrap_auc_by_client,
    calibration_bins,
    classification_metrics,
    lift_at_top,
    safe_auc,
)
from src.models import build_pipeline, extract_coefs, TrainedModel
from src.splits import assign_temporal_split
from src.study_v2_audit import run_study_v2_audit
from src.study_v2_features import enrich_frame, feature_catalog, hgb_v2_columns, logistic_v2_columns

ROOT = Path(__file__).resolve().parent


def dataset_hash(path: Path) -> str:
    if not path.exists():
        return "missing"
    data = path.read_bytes()
    return hashlib.sha256(data).hexdigest()[:16]


def columns_present(df: pd.DataFrame, numeric: list[str], categorical: list[str]) -> tuple[list[str], list[str]]:
    return [c for c in numeric if c in df.columns], [c for c in categorical if c in df.columns]


def fit_custom_logistic(train: pd.DataFrame, numeric: list[str], categorical: list[str], cfg: dict, C: float = 1.0) -> TrainedModel:
    local_cfg = {**cfg, "logistic": {**cfg.get("logistic", {}), "C": C}}
    spec_numeric, spec_cat = columns_present(train, numeric, categorical)
    pipe = build_pipeline(spec_numeric, spec_cat, local_cfg)
    X = train[spec_numeric + spec_cat]
    y = train["y"]
    pipe.fit(X, y)
    coef_summary = extract_coefs(pipe, spec_numeric, spec_cat)
    return TrainedModel("v2_logistic", pipe, spec_numeric + spec_cat, coef_summary)


def predict_custom(model: TrainedModel, df: pd.DataFrame) -> np.ndarray:
    numeric = [c for c in model.features if c in df.columns and df[c].dtype != object]
    categorical = [c for c in model.features if c in df.columns and c not in numeric]
    X = df[numeric + categorical]
    return model.pipeline.predict_proba(X)[:, 1]


def eval_candidate(name: str, df: pd.DataFrame, prob: np.ndarray, cfg: dict, client_col: str, split: str) -> dict:
    metrics = classification_metrics(df["y"], prob)
    metrics["lift"] = lift_at_top(df["y"], prob)
    metrics["calibration"] = calibration_bins(df["y"], prob)
    if split == "test":
        metrics["bootstrap_roc_auc"] = bootstrap_auc_by_client(
            df, prob, client_col, int(cfg["bootstrap_clients"]), int(cfg["seed"])
        )
    metrics["split"] = split
    metrics["model_id"] = name
    return metrics


def survival_curve_by_tenure(model_df: pd.DataFrame) -> list[dict]:
    """Curva descritiva de sobrevivência proxy: churn acumulado por faixa de meses no painel."""
    if "meses_desde_primeira_obs" not in model_df.columns:
        return []
    df = model_df.copy()
    df["tenure_bin"] = pd.cut(
        df["meses_desde_primeira_obs"],
        bins=[-0.1, 3, 6, 12, 24, 999],
        labels=["0-3m", "3-6m", "6-12m", "12-24m", "24m+"],
    )
    rows = []
    for label, g in df.groupby("tenure_bin", observed=False):
        if pd.isna(label) or len(g) < 20:
            continue
        rows.append(
            {
                "tenure_band": str(label),
                "n": int(len(g)),
                "churn_rate_90d": float(g["y"].mean()),
                "unique_clients": int(g["cliente_ref"].nunique()),
            }
        )
    return rows


def frame_for_hgb(df: pd.DataFrame, num_c: list[str], cat_c: list[str]) -> pd.DataFrame:
    base = df[num_c].apply(pd.to_numeric, errors="coerce")
    if not cat_c:
        return base
    dummies = pd.get_dummies(df[cat_c].astype(str), prefix=cat_c, dummy_na=True)
    return pd.concat([base, dummies], axis=1)


def sensitivity_slices(test: pd.DataFrame, prob: np.ndarray, client_col: str) -> dict:
    out = {}
    if "programa" in test.columns:
        for prog, g in test.groupby("programa"):
            if len(g) < 80:
                continue
            idx = g.index
            pos = test.index.get_indexer(idx)
            p = prob[pos]
            out[f"programa_{prog}"] = {
                "n": int(len(g)),
                "roc_auc": safe_auc(g["y"], p),
                "prevalence": float(g["y"].mean()),
            }
    if "classificacao_historica" in test.columns:
        for phase in ["Em implantação", "Saudável", "Atenção", "Crítico", "Sem registro"]:
            g = test[test["classificacao_historica"].astype(str).eq(phase)]
            if len(g) < 80:
                continue
            pos = test.index.get_indexer(g.index)
            p = prob[pos]
            key = "implantacao" if phase == "Em implantação" else f"fase_{phase.replace(' ', '_')}"
            out[key] = {"n": int(len(g)), "roc_auc": safe_auc(g["y"], p), "prevalence": float(g["y"].mean())}
    if "meses_desde_primeira_obs" in test.columns:
        g = test[test["meses_desde_primeira_obs"] >= 6]
        if len(g) >= 80:
            pos = test.index.get_indexer(g.index)
            out["permanencia_6m_plus"] = {
                "n": int(len(g)),
                "roc_auc": safe_auc(g["y"], prob[pos]),
                "prevalence": float(g["y"].mean()),
            }
    return out


def pick_C_on_val(train: pd.DataFrame, val: pd.DataFrame, numeric: list[str], categorical: list[str], cfg: dict) -> float:
    if val.empty:
        return float(cfg["logistic"]["C"])
    grid = [0.05, 0.1, 0.25, 0.5, 1.0, 2.0]
    best_c, best_auc = grid[0], -1.0
    for C in grid:
        m = fit_custom_logistic(train, numeric, categorical, cfg, C=C)
        prob = predict_custom(m, val)
        auc = safe_auc(val["y"], prob)
        if auc is not None and auc > best_auc:
            best_auc = auc
            best_c = C
    return best_c


def load_baseline_etapa4(out_dir: Path) -> dict | None:
    p = out_dir / "modeling_results_etapa4.json"
    if not p.exists():
        return None
    data = json.loads(p.read_text(encoding="utf-8"))
    ranking = data.get("ranking_test") or []
    best_id = ranking[0]["model_id"] if ranking else "E"
    models = data.get("models") or {}
    # Referência explícita ao melhor exploratório jun/2026 (~0.694 ROC citado pelo usuário)
    ref = models.get(best_id, {}).get("test") or models.get("E", {}).get("test")
    return {
        "model_id": best_id,
        "label": models.get(best_id, {}).get("label", "Etapa 4"),
        "test": ref,
        "note": "Baseline congelado — não retreinado neste run.",
    }


def select_candidate(candidates: list[dict], baseline: dict | None) -> dict:
    base_auc = (baseline or {}).get("test", {}).get("roc_auc")
    base_brier = (baseline or {}).get("test", {}).get("brier")
    scored = []
    for c in candidates:
        t = c.get("test") or {}
        scored.append(
            {
                "id": c["id"],
                "roc_auc": t.get("roc_auc"),
                "pr_auc": t.get("pr_auc"),
                "brier": t.get("brier"),
            }
        )
    best = max(scored, key=lambda x: (x["roc_auc"] or 0, -(x["brier"] or 999)))
    reason = []
    if base_auc is not None and best["roc_auc"] is not None:
        delta = best["roc_auc"] - base_auc
        if delta < 0.01:
            reason.append("Ganho ROC-AUC < 1 p.p. vs baseline — manter baseline como referência operacional.")
        elif delta >= 0.01:
            reason.append(f"Melhor candidato {best['id']} ROC-AUC {best['roc_auc']:.3f} vs baseline {base_auc:.3f} (exploratório).")
    if base_brier is not None and best["brier"] is not None and best["brier"] > base_brier:
        reason.append("Brier pior que baseline — calibração não melhorou.")
    reason.append("Estado exploratório — sem publicação de probabilidade individual.")
    recommended = None
    if base_auc is not None and best["roc_auc"] is not None and best["roc_auc"] - base_auc >= 0.015 and (best["brier"] or 999) <= (base_brier or 999) * 1.05:
        recommended = best["id"]
    return {
        "recommended_candidate_id": recommended,
        "baseline_model_id": (baseline or {}).get("model_id"),
        "comparison": scored,
        "rationale": " ".join(reason),
    }


def main() -> None:
    cfg = yaml.safe_load((ROOT / "config.yaml").read_text(encoding="utf-8"))
    data_dir = (ROOT / cfg["data_dir"]).resolve()
    out_dir = (ROOT / cfg["output_dir"]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    cfg["_data_dir"] = str(data_dir)

    csv_path = data_dir / "dataset_preditivo_validado.csv"
    tables = load_datasets(data_dir)
    raw_df = modeling_frame(tables["validated"], cfg)
    client_col = cfg["client_col"]
    enriched = enrich_frame(raw_df, client_col)

    split = assign_temporal_split(enriched, cfg)
    if split.test.empty:
        payload = {
            "version": "predictive-study-v2.0",
            "status": "failed",
            "error": split.note,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        }
        (out_dir / "predictive_study_v2.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        sys.exit(1)

    test_prev = float(split.test["y"].mean())
    audit = run_study_v2_audit(tables, cfg, out_dir, split.note, test_prev)
    catalog = feature_catalog(enriched)

    train = split.train.copy()
    val = split.val.copy()
    test = split.test.copy()
    fit_train = pd.concat([train, val], ignore_index=True) if not val.empty else train

    num_a, cat_a = logistic_v2_columns()
    num_a, cat_a = columns_present(enriched, num_a, cat_a)
    C_star = pick_C_on_val(train, val, num_a, cat_a, cfg) if not val.empty else float(cfg["logistic"]["C"])

    candidates = []

    # A — Logística regularizada aprimorada
    log_model = fit_custom_logistic(fit_train, num_a, cat_a, cfg, C=C_star)
    test_metrics = eval_candidate(
        "v2_logistic",
        test,
        predict_custom(log_model, test),
        cfg,
        client_col,
        "test",
    )
    candidates.append(
        {
            "id": "v2_logistic",
            "label": "Logística regularizada (features expandidas PIT)",
            "family": "logistic",
            "C_selected": C_star,
            "features_numeric": [c for c in num_a if c in log_model.features],
            "features_categorical": [c for c in cat_a if c in log_model.features],
            "coef_top": log_model.coef_summary[:15],
            "test": test_metrics,
            "sensitivity": sensitivity_slices(test, predict_custom(log_model, test), client_col),
        }
    )

    # B — Sobrevivência em tempo discreto (tenure + interação tenure×E)
    fit_train_b = fit_train.copy()
    test_b = test.copy()
    if "meses_desde_primeira_obs" in fit_train_b.columns and "engajamento_historico" in fit_train_b.columns:
        fit_train_b["tenure_x_engajamento"] = fit_train_b["meses_desde_primeira_obs"] * fit_train_b["engajamento_historico"]
        test_b["tenure_x_engajamento"] = test_b["meses_desde_primeira_obs"] * test_b["engajamento_historico"]
    num_b = list(dict.fromkeys(num_a + ["meses_desde_primeira_obs", "tenure_x_engajamento"]))
    surv_model = fit_custom_logistic(fit_train_b, num_b, cat_a, cfg, C=C_star)
    prob_b = predict_custom(surv_model, test_b)
    test_metrics_b = eval_candidate("v2_survival_discrete", test, prob_b, cfg, client_col, "test")
    candidates.append(
        {
            "id": "v2_survival_discrete",
            "label": "Painel discreto com tenure (proxy sobrevivência)",
            "family": "discrete_survival",
            "note": "Desfecho agregado 90d — hazard mensal exato requer série de eventos; curva descritiva por tenure incluída.",
            "features_numeric": num_b,
            "features_categorical": cat_a,
            "coef_top": surv_model.coef_summary[:15],
            "test": test_metrics_b,
            "sensitivity": sensitivity_slices(test, prob_b, client_col),
        }
    )

    # C — HistGradientBoosting
    num_c, cat_c = hgb_v2_columns()
    num_c, cat_c = columns_present(enriched, num_c, cat_c)
    X_train = frame_for_hgb(fit_train, num_c, cat_c)
    X_test = frame_for_hgb(test, num_c, cat_c)
    X_test = X_test.reindex(columns=X_train.columns, fill_value=0)
    hgb = HistGradientBoostingClassifier(
        max_depth=4,
        learning_rate=0.06,
        max_iter=180,
        random_state=int(cfg["seed"]),
        class_weight="balanced",
    )
    hgb.fit(X_train, fit_train["y"])
    prob_c = hgb.predict_proba(X_test)[:, 1]
    test_metrics_c = eval_candidate("v2_hgb", test, prob_c, cfg, client_col, "test")
    candidates.append(
        {
            "id": "v2_hgb",
            "label": "HistGradientBoosting (controle de complexidade)",
            "family": "boosting",
            "features_numeric": num_c,
            "features_categorical": cat_c,
            "test": test_metrics_c,
            "sensitivity": sensitivity_slices(test, prob_c, client_col),
        }
    )

    baseline = load_baseline_etapa4(out_dir)
    selection = select_candidate(candidates, baseline)
    survival_curve = survival_curve_by_tenure(enriched)

    hs_future_path = out_dir / "hs_future_feasibility.json"
    hs_future = json.loads(hs_future_path.read_text(encoding="utf-8")) if hs_future_path.exists() else {"feasible": False}

    manifest = {
        "study_version": "predictive-study-v2.0",
        "state": "exploratory",
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "dataset_path": str(csv_path.relative_to(ROOT.parent.parent)) if csv_path.exists() else None,
        "dataset_hash_sha256_16": dataset_hash(csv_path),
        "models_executed": [c["id"] for c in candidates],
        "train_months": split.train_months,
        "val_months": split.val_months,
        "test_months": split.test_months,
        "purged_train_rows": split.purged_train_rows,
        "limitations": [
            "Hold-out jun/2026 já usado na Etapa 4 — comparação exploratória apenas.",
            "Observações repetidas por cliente — IC cluster bootstrap nos testes.",
            "Sem calibração Platt/isotonic no teste final.",
            "NPS e suporte limitados no export validado atual.",
        ],
        "approval": "none",
    }

    payload = {
        "version": "predictive-study-v2.0",
        "status": "ok",
        "research_only": True,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "environment": {
            "python": sys.version,
            "platform": platform.platform(),
            "sklearn": sklearn.__version__,
            "seed": int(cfg["seed"]),
        },
        "manifest": manifest,
        "audit": audit,
        "feature_catalog": catalog,
        "baseline_etapa4": baseline,
        "candidates": candidates,
        "selection": selection,
        "survival_descriptive": survival_curve,
        "hs_future": {
            "baseline_rule": "HS futuro estimado = HS atual (baseline ingênuo)",
            "model_validated": False,
            "feasibility": hs_future,
        },
        "horizon_days": int(cfg["horizon_days"]),
    }

    out_path = out_dir / "predictive_study_v2.json"
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    (out_dir / "predictive_study_v2_manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps({"ok": True, "path": str(out_path), "selection": selection}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
