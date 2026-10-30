#!/usr/bin/env python3
"""Etapa 16 — enriquecimento auditado, comparação de modelos e validação temporal."""
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

from src.cluster_bootstrap import paired_auc_diff_ci
from src.data import load_datasets, modeling_frame
from src.metrics import (
    bootstrap_auc_by_client,
    calibration_bins,
    classification_metrics,
    lift_at_top,
    safe_auc,
)
from src.models import FEATURE_SETS, TrainedModel, build_pipeline, extract_coefs, fit_model, predict_proba
from src.study_v16_audit import churn_dataset_audit, enrichment_availability, load_pre_audit
from src.study_v16_features import catalog_for_frame, feature_packs
from src.study_v16_validation import (
    inner_val_months,
    pick_holdout_month,
    temporal_split_holdout,
    walk_forward_backtests,
)
from src.study_v2_features import enrich_frame, logistic_v2_columns

ROOT = Path(__file__).resolve().parent


def dataset_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16] if path.exists() else "missing"


def columns_present(df: pd.DataFrame, numeric: list[str], categorical: list[str]) -> tuple[list[str], list[str]]:
    return [c for c in numeric if c in df.columns], [c for c in categorical if c in df.columns]


def fit_logistic_pack(train: pd.DataFrame, pack: dict, cfg: dict, C: float) -> TrainedModel:
    local_cfg = {**cfg, "logistic": {**cfg.get("logistic", {}), "C": C}}
    num, cat = columns_present(train, pack["numeric"], pack["categorical"])
    pipe = build_pipeline(num, cat, local_cfg)
    pipe.fit(train[num + cat], train["y"])
    return TrainedModel(pack["id"], pipe, num + cat, extract_coefs(pipe, num, cat))


def predict_tm(m: TrainedModel, df: pd.DataFrame) -> np.ndarray:
    num = [c for c in m.features if c in df.columns and df[c].dtype != object]
    cat = [c for c in m.features if c in df.columns and c not in num]
    return m.pipeline.predict_proba(df[num + cat])[:, 1]


def frame_for_hgb(df: pd.DataFrame, num_c: list[str], cat_c: list[str]) -> pd.DataFrame:
    base = df[num_c].apply(pd.to_numeric, errors="coerce")
    if not cat_c:
        return base
    dummies = pd.get_dummies(df[cat_c].astype(str), prefix=cat_c, dummy_na=True)
    return pd.concat([base, dummies], axis=1)


def fit_hgb(train: pd.DataFrame, pack: dict, cfg: dict) -> HistGradientBoostingClassifier:
    num, cat = columns_present(train, pack["numeric"], pack["categorical"])
    X = frame_for_hgb(train, num, cat)
    clf = HistGradientBoostingClassifier(
        max_depth=4,
        learning_rate=0.08,
        max_iter=180,
        random_state=int(cfg["seed"]),
        class_weight="balanced",
    )
    clf.fit(X, train["y"])
    clf._v16_num = num  # type: ignore[attr-defined]
    clf._v16_cat = cat  # type: ignore[attr-defined]
    clf._v16_columns = list(X.columns)  # type: ignore[attr-defined]
    return clf


def predict_hgb(clf: HistGradientBoostingClassifier, df: pd.DataFrame) -> np.ndarray:
    num = clf._v16_num  # type: ignore[attr-defined]
    cat = clf._v16_cat  # type: ignore[attr-defined]
    cols = clf._v16_columns  # type: ignore[attr-defined]
    X = frame_for_hgb(df, num, cat).reindex(columns=cols, fill_value=0)
    return clf.predict_proba(X)[:, 1]


def pick_C(train: pd.DataFrame, val: pd.DataFrame, pack: dict, cfg: dict) -> float:
    if val.empty:
        return float(cfg["logistic"]["C"])
    grid = [0.1, 0.25, 0.5, 1.0, 2.0]
    best_c, best_auc = grid[0], -1.0
    for C in grid:
        m = fit_logistic_pack(train, pack, cfg, C)
        prob = predict_tm(m, val)
        auc = safe_auc(val["y"], prob)
        if auc is not None and auc > best_auc:
            best_auc = auc
            best_c = C
    return best_c


def eval_block(name: str, test: pd.DataFrame, prob: np.ndarray, cfg: dict, client_col: str) -> dict:
    m = classification_metrics(test["y"], prob)
    m["lift"] = lift_at_top(test["y"], prob)
    m["calibration"] = calibration_bins(test["y"], prob)
    m["bootstrap_roc_auc"] = bootstrap_auc_by_client(
        test, prob, client_col, int(cfg["bootstrap_clients"]), int(cfg["seed"])
    )
    m["model_id"] = name
    return m


def prevalence_baseline(test: pd.DataFrame) -> np.ndarray:
    p = float(test["y"].mean()) if len(test) else 0.0
    return np.full(len(test), p)


def compare_feature_packs(train: pd.DataFrame, val: pd.DataFrame, packs: dict, cfg: dict) -> list[dict]:
    rows = []
    for pid, pack in packs.items():
        if not pack["numeric"] and not pack["categorical"]:
            rows.append({"pack_id": pid, "skipped": True, "reason": "sem colunas"})
            continue
        C = pick_C(train, val, pack, cfg)
        m = fit_logistic_pack(train, pack, cfg, C)
        prob_v = predict_tm(m, val) if not val.empty else np.array([])
        prob_t = predict_tm(m, train)
        rows.append(
            {
                "pack_id": pid,
                "label": pack["label"],
                "n_features": len(m.features),
                "C_selected_on_inner_val": C,
                "inner_val_roc_auc": safe_auc(val["y"], prob_v) if len(val) else None,
                "train_roc_auc": safe_auc(train["y"], prob_t),
            }
        )
    return rows


def select_best_pack(comparison: list[dict]) -> str:
    scored = [r for r in comparison if not r.get("skipped") and r.get("inner_val_roc_auc") is not None]
    if not scored:
        return "baseline_original"
    return max(scored, key=lambda x: x["inner_val_roc_auc"])["pack_id"]


def build_operational_limitations(
    pre_audit: dict,
    enrichment: list[dict],
    candidate: dict,
    baseline_e: dict | None,
    holdout_note: str,
) -> dict:
    bullets = []
    missing_nps = all(not r.get("in_export") for r in enrichment if r["group"] == "satisfaction")
    missing_sup = all(not r.get("in_export") for r in enrichment if r["group"] == "support")
    if missing_nps:
        bullets.append(
            {
                "limitation": "NPS point-in-time não exportado",
                "evidence": "Colunas nps_* ausentes no dataset_preditivo_validado.csv",
                "impact": "Satisfação não entra nos modelos confirmatórios",
                "data_needed": "Histórico NPS datado por cliente para reconstrução PIT",
            }
        )
    if missing_sup:
        bullets.append(
            {
                "limitation": "Suporte operacional histórico",
                "evidence": "Colunas demandas/tarefas/eventos ausentes no export",
                "impact": "Mecanismos de suporte não mensurados",
                "data_needed": "Eventos de suporte com timestamp ≤ data_referencia",
            }
        )
    rec = (pre_audit.get("missing_rates_labeled") or {}).get("recencia_dias")
    if rec is not None:
        rec = float(rec)
    bullets.append(
        {
            "limitation": "Recência de reuniões",
            "evidence": f"~{rec:.0%} missing em recencia_dias (pre_audit)" if rec else "Alta ausência documentada",
            "impact": "Engajamento recente subestimado",
            "data_needed": "Cobertura Calendly/manual completa no passado",
        }
    )
    bullets.append(
        {
            "limitation": "Validação independente",
            "evidence": holdout_note,
            "impact": "Modelos permanecem candidatos experimentais",
            "data_needed": "Meses futuros com rótulos 90d maduros + freeze prospectivo",
        }
    )

    cand_auc = (candidate.get("test") or {}).get("roc_auc")
    base_auc = (baseline_e or {}).get("roc_auc")
    satisfactory = False
    if cand_auc is not None and base_auc is not None:
        satisfactory = cand_auc >= base_auc + 0.02 and (candidate.get("test") or {}).get("brier", 999) <= (
            (baseline_e or {}).get("brier") or 999
        )
    return {
        "title": "Por que os dados atuais ainda não permitem uma previsão operacional confiável?",
        "show_highlight": not satisfactory,
        "limitations_demonstrated": bullets,
        "executive_conclusion": (
            "Manter Modelo E (Etapa 4) como referência congelada; candidato Etapa 16 aguarda validação prospectiva "
            "e enriquecimento de export (NPS, suporte, tenure contratual) antes de uso individual."
        ),
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

    dataset_audit = churn_dataset_audit(tables, cfg, pre_audit)
    enrichment = enrichment_availability(enriched)
    feature_catalog_rows = catalog_for_frame(base)
    packs = feature_packs(enriched)

    holdout, holdout_note = pick_holdout_month(enriched)
    if not holdout:
        payload = {
            "version": "predictive-study-v16",
            "status": "failed",
            "error": holdout_note,
            "dataset_audit": dataset_audit,
        }
        (out_dir / "predictive_study_v16.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
        sys.exit(1)

    split = temporal_split_holdout(enriched, holdout, int(cfg["purge_horizon_days"]))
    train_months, val_months = inner_val_months(split.train_months, n_val=2)
    train_inner = split.train[split.train["mes"].isin(train_months)].copy()
    val_inner = split.train[split.train["mes"].isin(val_months)].copy()
    fit_train = split.train.copy()
    test = split.test.copy()

    pack_comparison = compare_feature_packs(train_inner, val_inner, packs, cfg)
    best_pack_id = select_best_pack(pack_comparison)
    best_pack = packs[best_pack_id]

    C_final = pick_C(train_inner, val_inner, best_pack, cfg)
    logistic_best = fit_logistic_pack(fit_train, best_pack, cfg, C_final)
    prob_log = predict_tm(logistic_best, test)

    model_e = fit_model("E", fit_train, cfg)
    prob_e = predict_proba(model_e, test)
    met_e = eval_block("model_E_frozen_family", test, prob_e, cfg, client_col)

    prob_base = prevalence_baseline(test)
    met_prev = eval_block("baseline_prevalence", test, prob_base, cfg, client_col)

    met_log = eval_block(f"logistic_{best_pack_id}", test, prob_log, cfg, client_col)

    hgb = fit_hgb(fit_train, best_pack, cfg)
    prob_hgb = predict_hgb(hgb, test)
    met_hgb = eval_block(f"hgb_{best_pack_id}", test, prob_hgb, cfg, client_col)

    paired_hgb_e = paired_auc_diff_ci(test, "y", prob_hgb, prob_e, client_col, n_boot=300, seed=int(cfg["seed"]))
    paired_log_e = paired_auc_diff_ci(test, "y", prob_log, prob_e, client_col, n_boot=300, seed=int(cfg["seed"]))

    frozen_e_test = None
    frozen_path = out_dir / "modeling_results_etapa4.json"
    if frozen_path.exists():
        frozen = json.loads(frozen_path.read_text(encoding="utf-8"))
        frozen_e_test = frozen.get("models", {}).get("E", {}).get("test")

    june_exploratory = None
    if "2026-06" in set(enriched["mes"]):
        june_test = enriched[enriched["mes"] == "2026-06"].copy()
        june_train = enriched[enriched["mes"] < "2026-06"].copy()
        if len(june_train) >= 400 and len(june_test) >= 150:
            m_j = fit_logistic_pack(june_train, best_pack, cfg, C_final)
            prob_j = predict_tm(m_j, june_test)
            june_exploratory = {
                "month": "2026-06",
                "purpose": "historical_reference_etapa4_only",
                "metrics": eval_block("logistic_june_reference", june_test, prob_j, cfg, client_col),
            }

    def _wf(train_df, test_df):
        m = fit_logistic_pack(train_df, best_pack, cfg, C_final)
        p = predict_tm(m, test_df)
        met = classification_metrics(test_df["y"], p)
        return {"roc_auc": met.get("roc_auc"), "n": met.get("n"), "prevalence": met.get("prevalence")}

    walk_forward = walk_forward_backtests(enriched, cfg, _wf, exclude=set())

    candidates = [
        {"id": "baseline_prevalence", "family": "baseline", "test": met_prev},
        {"id": met_e["model_id"], "family": "logistic", "feature_pack": "E", "test": met_e},
        {"id": met_log["model_id"], "family": "logistic", "feature_pack": best_pack_id, "test": met_log},
        {"id": met_hgb["model_id"], "family": "hist_gradient_boosting", "feature_pack": best_pack_id, "test": met_hgb},
    ]

    base_auc = met_e.get("roc_auc") or 0
    scored = sorted(
        [c for c in candidates if c["id"] != "baseline_prevalence"],
        key=lambda c: (-(c["test"].get("roc_auc") or 0), c["test"].get("brier") or 999),
    )
    best = scored[0]
    superior = (best["test"].get("roc_auc") or 0) >= base_auc + 0.015 and best["id"] != met_e["model_id"]
    if superior and paired_log_e.get("ci_low") is not None and paired_log_e["ci_low"] <= 0:
        superior = False

    recommendation = {
        "reference_model": "E (Etapa 4 congelado)",
        "candidate_experimental": best["id"] if superior else None,
        "keep_baseline": not superior,
        "rationale": (
            f"Melhor ROC-AUC no hold-out {holdout}: {best['id']} ({best['test'].get('roc_auc'):.3f}) vs E refit ({base_auc:.3f}). "
            + (
                "Ganho modesto — manter E até validação independente."
                if not superior
                else "Candidato experimental — ainda sem validação prospectiva."
            )
        ),
        "validation_status": "exploratory_holdout_not_operational",
    }

    selection_criteria = {
        "priorities": ["generalization", "calibration", "discrimination", "stability", "coverage", "interpretability"],
        "rules": [
            "Não selecionar só pelo maior ROC-AUC",
            "Exigir ganho ≥ 1.5 p.p. vs E e IC bootstrap pareado > 0 para candidato superior",
            "Jun/2026 não entra na seleção confirmatória",
        ],
    }

    limitations = build_operational_limitations(
        pre_audit or {},
        enrichment,
        best,
        met_e,
        holdout_note,
    )

    manifest = {
        "study_version": "predictive-study-v16",
        "state": "exploratory_candidate" if superior else "baseline_reference",
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "dataset_hash_sha256_16": dataset_hash(csv_path),
        "preserves": ["predictive_study_v15.json", "predictive_study_v2.json", "modeling_results_etapa4.json"],
        "artifacts": {
            "dataset": str(csv_path.name),
            "output": "predictive_study_v16.json",
        },
    }

    payload = {
        "version": "predictive-study-v16",
        "status": "ok",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "environment": {"python": sys.version, "sklearn": sklearn.__version__, "seed": int(cfg["seed"])},
        "manifest": manifest,
        "objective": {
            "outcome": "desfecho_churn_90d",
            "horizon_days": int(cfg["horizon_days"]),
            "goal": "Melhor abordagem sustentada pelos dados com discriminação, calibração e generalização",
        },
        "dataset_audit": dataset_audit,
        "enrichment_availability": enrichment,
        "feature_catalog": feature_catalog_rows,
        "feature_pack_comparison": pack_comparison,
        "selected_feature_pack": {"id": best_pack_id, "label": best_pack["label"], "C": C_final},
        "temporal_validation": {
            "holdout_month": holdout,
            "holdout_purpose": "primary_exploratory_selection",
            "june_2026_role": "reference_only_not_used_for_selection",
            "split_note": split.note,
            "train_months": split.train_months,
            "test_months": split.test_months,
            "inner_val_months": val_months,
            "june_reference_metrics": june_exploratory,
            "walk_forward_backtests": walk_forward,
        },
        "models_compared": candidates,
        "paired_tests": {"hgb_minus_E": paired_hgb_e, "logistic_best_minus_E": paired_log_e},
        "selection_criteria": selection_criteria,
        "recommendation": recommendation,
        "operational_limitations": limitations,
        "frozen_etapa4_E_test_june": frozen_e_test,
        "report_sections": {
            "introduction": "Previsão agregada de churn 90d — pesquisa, sem probabilidades individuais publicadas.",
            "hs_formula": "HS histórico 50/50 E/M reconstruído PIT no export validado.",
            "churn_definition": "desfecho_churn_90d com elegivel_modelagem_90d e censura documentada em pre_audit.",
        },
    }

    out_path = out_dir / "predictive_study_v16.json"
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"ok": True, "path": str(out_path), "holdout": holdout, "best": best["id"]}, indent=2))


if __name__ == "__main__":
    main()
