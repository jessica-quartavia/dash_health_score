#!/usr/bin/env python3
"""Etapa 17 — calibração e confiabilidade probabilística (sem novos algoritmos indiscriminados)."""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
import yaml
from sklearn.ensemble import HistGradientBoostingClassifier

from src.calibration import (
    calibration_intercept_slope,
    isotonic_apply,
    isotonic_fit,
    platt_scale_apply,
    platt_scale_fit,
    probability_summary,
    risk_groups,
)
from src.cluster_bootstrap import paired_auc_diff_ci
from src.data import load_datasets, modeling_frame
from src.metrics import bootstrap_auc_by_client, calibration_bins, classification_metrics, safe_auc
from src.models import FEATURE_SETS, TrainedModel, build_pipeline, extract_coefs
from src.study_v16_audit import churn_dataset_audit, load_pre_audit
from src.study_v16_features import feature_packs
from src.study_v16_validation import inner_val_months, pick_holdout_month, temporal_split_holdout
from src.study_v2_features import enrich_frame

ROOT = Path(__file__).resolve().parent

USED_MONTHS_NOT_CONFIRMATORY = {"2026-06", "2026-07"}


def dataset_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16] if path.exists() else "missing"


def fit_logistic_E(train: pd.DataFrame, cfg: dict, class_weight: str | None, C: float) -> TrainedModel:
    local_cfg = {**cfg, "logistic": {**cfg.get("logistic", {}), "C": C}}
    spec = FEATURE_SETS["E"]
    numeric = [c for c in spec["numeric"] if c in train.columns]
    categorical = [c for c in spec["categorical"] if c in train.columns]
    pipe = build_pipeline(numeric, categorical, local_cfg, class_weight=class_weight)
    pipe.fit(train[numeric + categorical], train["y"])
    return TrainedModel("E", pipe, numeric + categorical, extract_coefs(pipe, numeric, categorical))


def predict_tm(m: TrainedModel, df: pd.DataFrame) -> np.ndarray:
    num = [c for c in m.features if c in df.columns and df[c].dtype != object]
    cat = [c for c in m.features if c in df.columns and c not in num]
    return m.pipeline.predict_proba(df[num + cat])[:, 1]


def pick_C_E(train: pd.DataFrame, val: pd.DataFrame, cfg: dict, class_weight: str | None) -> float:
    if val.empty:
        return float(cfg["logistic"]["C"])
    grid = [0.1, 0.25, 0.5, 1.0, 2.0]
    best_c, best_auc = grid[0], -1.0
    for C in grid:
        m = fit_logistic_E(train, cfg, class_weight, C)
        prob = predict_tm(m, val)
        auc = safe_auc(val["y"], prob)
        if auc is not None and auc > best_auc:
            best_auc = auc
            best_c = C
    return best_c


def frame_for_hgb(df: pd.DataFrame, pack: dict) -> pd.DataFrame:
    num = [c for c in pack["numeric"] if c in df.columns]
    cat = [c for c in pack["categorical"] if c in df.columns]
    base = df[num].apply(pd.to_numeric, errors="coerce")
    if not cat:
        return base
    dummies = pd.get_dummies(df[cat].astype(str), prefix=cat, dummy_na=True)
    return pd.concat([base, dummies], axis=1)


def fit_hgb(train: pd.DataFrame, pack: dict, cfg: dict) -> HistGradientBoostingClassifier:
    X = frame_for_hgb(train, pack)
    clf = HistGradientBoostingClassifier(
        max_depth=4,
        learning_rate=0.08,
        max_iter=180,
        random_state=int(cfg["seed"]),
        class_weight="balanced",
    )
    clf.fit(X, train["y"])
    clf._v17_pack = pack  # type: ignore[attr-defined]
    clf._v17_columns = list(X.columns)  # type: ignore[attr-defined]
    return clf


def predict_hgb(clf: HistGradientBoostingClassifier, df: pd.DataFrame) -> np.ndarray:
    pack = clf._v17_pack  # type: ignore[attr-defined]
    cols = clf._v17_columns  # type: ignore[attr-defined]
    X = frame_for_hgb(df, pack).reindex(columns=cols, fill_value=0)
    return clf.predict_proba(X)[:, 1]


def eval_variant(
    variant_id: str,
    test: pd.DataFrame,
    prob: np.ndarray,
    cfg: dict,
    client_col: str,
    label: str,
) -> dict:
    m = classification_metrics(test["y"], prob)
    m["model_id"] = variant_id
    m["label"] = label
    m["calibration_bins"] = calibration_bins(test["y"], prob)
    m["calibration_logit"] = calibration_intercept_slope(test["y"], prob)
    m["probability_summary"] = probability_summary(test["y"], prob)
    m["risk_groups"] = risk_groups(test["y"], prob, n_groups=5)
    m["bootstrap_roc_auc"] = bootstrap_auc_by_client(
        test, prob, client_col, int(cfg["bootstrap_clients"]), int(cfg["seed"])
    )
    return m


def prevalence_baseline(train: pd.DataFrame, test: pd.DataFrame) -> np.ndarray:
    p = float(train["y"].mean()) if len(train) else 0.0
    return np.full(len(test), p)


def segment_metrics(test: pd.DataFrame, prob: np.ndarray, cfg: dict, client_col: str, mask, name: str) -> dict | None:
    m = mask.to_numpy() if hasattr(mask, "to_numpy") else np.asarray(mask)
    sub = test.loc[mask].copy()
    if len(sub) < 80:
        return {"segment": name, "skipped": True, "n": int(len(sub)), "reason": "amostra < 80"}
    p = np.asarray(prob)[m]
    return eval_variant(f"E_{name}", sub, p, cfg, client_col, f"Modelo E — {name}")


def derive_conclusion(rows: list[dict], temporal_note: str) -> dict:
    """Conclusão A/B/C — não forçar escolha."""
    by_id = {r["id"]: r for r in rows}
    e_bal = by_id.get("model_E_balanced")
    e_platt = by_id.get("model_E_balanced_platt")
    e_iso = by_id.get("model_E_balanced_isotonic")
    e_unbal = by_id.get("model_E_unbalanced")
    hgb = by_id.get("hgb_best_pack")
    prev = by_id.get("baseline_prevalence")

    def _m(row, key):
        return (row or {}).get("test", {}).get(key)

    best_brier = min(rows, key=lambda r: r["test"].get("brier") or 999)
    best_auc = max(rows, key=lambda r: r["test"].get("roc_auc") or 0)

    calibrates_e = False
    if e_bal and e_platt:
        b0 = _m(e_bal, "brier")
        b1 = _m(e_platt, "brier")
        a0 = _m(e_bal, "roc_auc")
        a1 = _m(e_platt, "roc_auc")
        if b1 is not None and b0 is not None and b1 < b0 - 0.005 and a1 is not None and a0 is not None and a1 >= a0 - 0.015:
            calibrates_e = True
    if e_iso and e_bal and not calibrates_e:
        b0 = _m(e_bal, "brier")
        b1 = _m(e_iso, "brier")
        a0 = _m(e_bal, "roc_auc")
        a1 = _m(e_iso, "roc_auc")
        if b1 is not None and b0 is not None and b1 < b0 - 0.005 and a1 is not None and a0 is not None and a1 >= a0 - 0.015:
            calibrates_e = True

    other_wins = False
    if hgb and e_bal:
        if (_m(hgb, "roc_auc") or 0) >= (_m(e_bal, "roc_auc") or 0) + 0.02 and (_m(hgb, "brier") or 999) <= (_m(e_bal, "brier") or 999):
            other_wins = True

    insufficient = "prospectiv" in temporal_note.lower() or "explorat" in temporal_note.lower()

    if calibrates_e and not insufficient:
        letter = "A"
        summary = (
            "Post-hoc Platt/isotônica no conjunto de validação interna melhora Brier no mês de diagnóstico "
            "preservando discriminação — candidato a recalibração agregada, ainda não operacional."
        )
    elif other_wins:
        letter = "B"
        summary = "Outro candidato (ex.: gradient boosting) mostra vantagem simultânea em discriminação e Brier no recorte exploratório."
    else:
        letter = "C"
        summary = (
            "Dados e meses disponíveis limitam conclusões confirmatórias; "
            "ranking (ROC) e calibração (Brier) divergem — probabilidades agregadas ainda não confiáveis para operação."
        )

    if insufficient and letter == "A":
        letter = "C"
        summary = (
            "Melhora de calibração observada apenas em hold-out já usado na pesquisa (jun/jul 2026) — "
            "tratar como exploratório; não declarar prontidão operacional."
        )

    return {
        "letter": letter,
        "summary": summary,
        "best_brier_id": best_brier["id"],
        "best_roc_auc_id": best_auc["id"],
        "prevalence_baseline_brier": _m(prev, "brier"),
        "model_E_balanced_brier": _m(e_bal, "brier"),
        "model_E_balanced_roc": _m(e_bal, "roc_auc"),
        "class_weight_diagnosis": (
            "class_weight='balanced' no Modelo E repesa classes raras e tende a **aumentar** probabilidades médias "
            "acima da prevalência do teste — melhora ranking (ROC) mas piora Brier frente ao baseline de prevalência constante."
        ),
        "recommendation": {
            "operational_probabilities": False,
            "best_calibrated_candidate": e_platt["id"] if calibrates_e and e_platt else (e_iso["id"] if calibrates_e and e_iso else e_bal["id"] if e_bal else None),
            "best_ranking_candidate": best_auc["id"],
        },
    }


def main() -> None:
    cfg = yaml.safe_load((ROOT / "config.yaml").read_text(encoding="utf-8"))
    data_dir = (ROOT / cfg["data_dir"]).resolve()
    out_dir = (ROOT / cfg["output_dir"]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    client_col = cfg["client_col"]
    pre_audit = load_pre_audit(out_dir)

    tables = load_datasets(data_dir)
    csv_path = data_dir / "dataset_preditivo_validado.csv"
    base = modeling_frame(tables["validated"], cfg)
    enriched = enrich_frame(base, client_col)
    packs = feature_packs(enriched)

    holdout, holdout_note = pick_holdout_month(enriched)
    if not holdout:
        payload = {"version": "predictive-study-v17", "status": "failed", "error": holdout_note}
        (out_dir / "predictive_study_v17.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
        sys.exit(1)

    split = temporal_split_holdout(enriched, holdout, int(cfg["purge_horizon_days"]))
    train_months, val_months = inner_val_months(split.train_months, n_val=2)
    train_inner = split.train[split.train["mes"].isin(train_months)].copy()
    val_inner = split.train[split.train["mes"].isin(val_months)].copy()
    fit_train = split.train.copy()
    test = split.test.copy()

    best_pack_id = "baseline_original"
    if best_pack_id not in packs:
        best_pack_id = next(iter(packs.keys()))
    best_pack = packs[best_pack_id]

    C_bal = pick_C_E(train_inner, val_inner, cfg, "balanced")
    C_unbal = pick_C_E(train_inner, val_inner, cfg, None)

    m_e_bal = fit_logistic_E(fit_train, cfg, "balanced", C_bal)
    p_e_bal_test = predict_tm(m_e_bal, test)
    p_e_bal_val = predict_tm(m_e_bal, val_inner)

    m_e_unbal = fit_logistic_E(fit_train, cfg, None, C_unbal)
    p_e_unbal_test = predict_tm(m_e_unbal, test)

    m_e_c_tuned = fit_logistic_E(fit_train, cfg, "balanced", C_bal)

    platt = platt_scale_fit(val_inner["y"], p_e_bal_val)
    p_e_platt_test = platt_scale_apply(platt, p_e_bal_test)
    p_e_platt_val = platt_scale_apply(platt, p_e_bal_val)

    iso = isotonic_fit(val_inner["y"], p_e_bal_val)
    p_e_iso_test = isotonic_apply(iso, p_e_bal_test)

    hgb = fit_hgb(fit_train, best_pack, cfg)
    p_hgb_test = predict_hgb(hgb, test)

    p_prev_test = prevalence_baseline(fit_train, test)

    variants = [
        ("model_E_balanced", "Modelo E original (L2, class_weight balanced)", p_e_bal_test),
        ("model_E_unbalanced", "Modelo E sem balanceamento de classes", p_e_unbal_test),
        ("model_E_balanced_C_tuned", f"Modelo E balanced, C={C_bal} (inner val)", p_e_bal_test),
        ("model_E_balanced_platt", "Modelo E + calibração sigmoide (Platt) ajustada na validação interna", p_e_platt_test),
        ("model_E_balanced_isotonic", "Modelo E + calibração isotônica ajustada na validação interna", p_e_iso_test),
        ("hgb_best_pack", f"HistGradientBoosting Etapa 16 ({best_pack_id})", p_hgb_test),
        ("baseline_prevalence", "Baseline prevalência constante (treino)", p_prev_test),
    ]

    experiment_rows = []
    for vid, vlabel, prob in variants:
        experiment_rows.append(
            {
                "id": vid,
                "label": vlabel,
                "test": eval_variant(vid, test, prob, cfg, client_col, vlabel),
            }
        )

    paired_platt = paired_auc_diff_ci(test, "y", p_e_platt_test, p_e_bal_test, client_col, n_boot=300, seed=int(cfg["seed"]))

    impl_mask = test["classificacao_historica"].astype(str).eq("Em implantação")
    pos_mask = ~impl_mask
    segments = [
        segment_metrics(test, p_e_bal_test, cfg, client_col, impl_mask, "implantacao"),
        segment_metrics(test, p_e_bal_test, cfg, client_col, pos_mask, "pos_implantacao"),
    ]

    months_available = sorted(enriched["mes"].astype(str).unique())
    temporal_audit = {
        "months_in_dataset": months_available,
        "months_used_in_prior_research_not_confirmatory": sorted(USED_MONTHS_NOT_CONFIRMATORY & set(months_available)),
        "evaluation_month": holdout,
        "evaluation_purpose": "diagnostic_replication_v16_not_new_confirmatory_test",
        "note": (
            f"{holdout_note} Etapa 17 reutiliza o mesmo mês apenas para **diagnóstico de calibração** — "
            "jun/2026 (Etapa 4) e jul/2026 (Etapa 16) não são apresentados como novos testes confirmatórios. "
            "Calibração Platt/isotônica ajustada somente em meses de validação interna anteriores ao teste."
        ),
        "inner_val_months": val_months,
        "train_months": split.train_months,
    }

    v16_diag = None
    v16_path = out_dir / "predictive_study_v16.json"
    if v16_path.exists():
        v16 = json.loads(v16_path.read_text(encoding="utf-8"))
        if v16.get("status") == "ok":
            v16_diag = {
                "holdout": v16.get("temporal_validation", {}).get("holdout_month"),
                "models_compared": [
                    {
                        "id": c.get("id"),
                        "roc_auc": (c.get("test") or {}).get("roc_auc"),
                        "brier": (c.get("test") or {}).get("brier"),
                    }
                    for c in v16.get("models_compared") or []
                ],
            }

    conclusion = derive_conclusion(experiment_rows, temporal_audit["note"])

    manifest = {
        "study_version": "predictive-study-v17",
        "state": "calibration_exploratory",
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "dataset_hash_sha256_16": dataset_hash(csv_path),
        "preserves": ["predictive_study_v16.json", "modeling_results_etapa4.json"],
        "artifacts": {"output": "predictive_study_v17.json"},
    }

    payload = {
        "version": "predictive-study-v17",
        "status": "ok",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "environment": {"python": sys.version, "sklearn": sklearn.__version__, "seed": int(cfg["seed"])},
        "manifest": manifest,
        "objective": {
            "title": "Calibração e validação preditiva",
            "horizon_days": int(cfg["horizon_days"]),
            "goal": "Separar discriminação (ranking) de calibração (probabilidades) sem otimizar no hold-out final",
        },
        "dataset_audit": churn_dataset_audit(tables, cfg, pre_audit),
        "v16_audit_reference": v16_diag,
        "temporal_audit": temporal_audit,
        "diagnosis": {
            "class_weight_balanced": conclusion["class_weight_diagnosis"],
            "probability_summary_E_balanced": experiment_rows[0]["test"].get("probability_summary"),
            "test_prevalence": float(test["y"].mean()),
            "why_high_auc_low_brier_vs_prevalence": (
                "ROC mede ordenação; Brier penaliza desvio da probabilidade real. "
                "Balanceamento de classes e variabilidade real elevam médias previstas; "
                "HGB captura não-linearidades com melhor Brier mas ROC menor neste hold-out exploratório."
            ),
        },
        "experiments": experiment_rows,
        "calibration_fit": {
            "platt_fitted_on": val_months,
            "isotonic_fitted_on": val_months,
            "C_balanced_selected": C_bal,
            "C_unbalanced_selected": C_unbal,
            "paired_platt_minus_E_auc": paired_platt,
        },
        "segments_model_E": [s for s in segments if s],
        "conclusion_abc": conclusion,
        "operational_limits": {
            "publish_individual_probabilities": False,
            "hs_official_50_50_unchanged": True,
            "operational_deployment": False,
        },
        "report_sections": {
            "calibration": "Ver experiments[] e risk_groups do Modelo E balanced.",
            "executive": conclusion["summary"],
        },
    }

    out_path = out_dir / "predictive_study_v17.json"
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"ok": True, "path": str(out_path), "conclusion": conclusion["letter"]}, indent=2))


if __name__ == "__main__":
    main()
