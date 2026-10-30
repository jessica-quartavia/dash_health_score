#!/usr/bin/env python3
"""Etapa 15 — diagnóstico limitações preditivas e comparação justa E vs V2."""
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

from src.cluster_bootstrap import paired_auc_diff_ci
from src.data import load_datasets, modeling_frame
from src.metrics import bootstrap_auc_by_client, classification_metrics
from src.models import FEATURE_SETS, TrainedModel, build_pipeline, extract_coefs, fit_model, predict_proba
from datetime import timedelta

from src.splits import TemporalSplit, assign_temporal_split, month_sort_key
from src.study_v15_horizons import horizon_summary, model_e_auc_by_horizon
from src.study_v15_segments import hs_churn_by_phase, segment_churn_table
from src.study_v15_temporal import temporal_feature_audit
from src.study_v2_features import enrich_frame, logistic_v2_columns

ROOT = Path(__file__).resolve().parent


def split_from_etapa4(df: pd.DataFrame, cfg: dict, out_dir: Path) -> TemporalSplit:
    """Replica meses de teste/treino documentados na Etapa 4 quando disponível."""
    frozen_path = out_dir / "modeling_results_etapa4.json"
    test_months = ["2026-06"]
    train_months_hint: list[str] = []
    if frozen_path.exists():
        frozen = json.loads(frozen_path.read_text(encoding="utf-8"))
        test_months = list(frozen.get("split", {}).get("test_months") or test_months)
        train_months_hint = list(frozen.get("split", {}).get("train_months") or [])
    horizon = int(cfg.get("purge_horizon_days", 90))
    months = sorted(df["mes"].unique(), key=month_sort_key)
    if not test_months or not all(m in months for m in test_months):
        return assign_temporal_split(df, cfg)
    test_start = pd.Timestamp(f"{test_months[0]}-01", tz="UTC")
    cutoff = test_start - timedelta(days=horizon)
    before = df[df["mes"].isin([m for m in months if m < test_months[0]])]
    purged = before[before["ref_dt"] <= cutoff]
    purged_n = len(before) - len(purged)
    train = purged.copy()
    test = df[df["mes"].isin(test_months)].copy()
    train_months = sorted(train["mes"].unique(), key=month_sort_key) if len(train) else train_months_hint
    note = (
        f"Split alinhado à Etapa 4: treino purgado meses {train_months}, teste {test_months}. "
        f"Excluídos {purged_n} registros por purga {horizon}d."
    )
    return TemporalSplit(train, df.iloc[0:0].copy(), test, train_months, [], test_months, purged_n, note)


def dataset_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16] if path.exists() else "missing"


def fit_v2_fixed(train: pd.DataFrame, cfg: dict) -> TrainedModel:
    num, cat = logistic_v2_columns()
    num = [c for c in num if c in train.columns]
    cat = [c for c in cat if c in train.columns]
    pipe = build_pipeline(num, cat, cfg)
    pipe.fit(train[num + cat], train["y"])
    return TrainedModel("v2_logistic_fair", pipe, num + cat, extract_coefs(pipe, num, cat))


def predict_tm(m: TrainedModel, df: pd.DataFrame) -> np.ndarray:
    num = [c for c in m.features if c in df.columns and df[c].dtype != object]
    cat = [c for c in m.features if c in df.columns and c not in num]
    return m.pipeline.predict_proba(df[num + cat])[:, 1]


def metrics_block(name: str, df: pd.DataFrame, prob: np.ndarray, cfg: dict, client_col: str) -> dict:
    m = classification_metrics(df["y"], prob)
    m["bootstrap_roc_auc"] = bootstrap_auc_by_client(df, prob, client_col, int(cfg["bootstrap_clients"]), int(cfg["seed"]))
    m["model_id"] = name
    return m


def fit_e_with_phase(train: pd.DataFrame, cfg: dict) -> TrainedModel:
    spec = FEATURE_SETS["E"]
    num = [c for c in spec["numeric"] if c in train.columns]
    cat = list(spec["categorical"])
    if "classificacao_historica" in train.columns:
        cat = cat + ["classificacao_historica"]
    cat = [c for c in cat if c in train.columns]
    pipe = build_pipeline(num, cat, cfg)
    pipe.fit(train[num + cat], train["y"])
    return TrainedModel("E_plus_phase", pipe, num + cat, extract_coefs(pipe, num, cat))


def exploratory_month_holdout(df: pd.DataFrame, cfg: dict, holdout_month: str) -> dict | None:
    """Avaliação exploratória em mês não usado para seleção de hiperparâmetros (não confirmatória)."""
    if holdout_month not in set(df["mes"]):
        return None
    train = df[df["mes"] < holdout_month].copy()
    test = df[df["mes"] == holdout_month].copy()
    if len(train) < 400 or len(test) < 150:
        return None
    model = fit_model("E", train, cfg)
    prob = predict_proba(model, test)
    met = classification_metrics(test["y"], prob)
    return {
        "holdout_month": holdout_month,
        "purpose": "exploratory_only",
        "roc_auc": met.get("roc_auc"),
        "pr_auc": met.get("pr_auc"),
        "n": met.get("n"),
        "prevalence": met.get("prevalence"),
    }


def build_why_not_improved(fair: dict, segments: list, horizons: list, paired: dict, temporal: list) -> dict:
    bullets = []
    diff = paired.get("diff_mean")
    ci_lo, ci_hi = paired.get("ci_low"), paired.get("ci_high")
    if diff is not None and ci_lo is not None and ci_hi is not None:
        if ci_lo <= 0 <= ci_hi:
            bullets.append(
                f"Diferença ROC-AUC V2−E no teste congelado: {diff:+.4f} (IC95% bootstrap por cliente [{ci_lo:+.4f}, {ci_hi:+.4f}]) — **sem ganho estatístico claro**."
            )
        elif diff > 0 and ci_lo > 0:
            bullets.append(f"V2 supera E no teste exploratório ({diff:+.4f} AUC), mas hold-out jun/2026 já foi usado — ganho não confirmado.")
        else:
            bullets.append(f"V2 não supera E de forma consistente (diff AUC {diff:+.4f}).")
    else:
        bullets.append("Comparação pareada E vs V2 indisponível — ver métricas marginais.")

    impl = next((s for s in segments if s["segment"] == "implantacao" and not s.get("insufficient")), None)
    pos = next((s for s in segments if s["segment"] == "pos_implantacao" and not s.get("insufficient")), None)
    if impl and pos and impl.get("churn_rate") and pos.get("churn_rate"):
        bullets.append(
            f"Churn observado muito maior em implantação ({impl['churn_rate']:.1%}, n={impl['n_obs']}) que pós-implantação ({pos['churn_rate']:.1%}) — modelos globais misturam fases distintas."
        )
    hs_low = next((s for s in segments if s["segment"] == "hs_0_20" and not s.get("insufficient")), None)
    if hs_low and hs_low.get("churn_rate") is not None:
        bullets.append(
            f"Faixa HS 0–20 concentra alta taxa observada ({hs_low['churn_rate']:.1%}) — muitos zeros refletem ausência de engajamento, não só risco contratual."
        )
    if any(t.get("feature") == "nps_historico" and not t.get("usable") for t in temporal):
        bullets.append("NPS e suporte histórico não estão no export validado — sinais de satisfação operacional não entram nos modelos.")
    bullets.append("Horizontes 30d/60d não exportados; comparação limitada a 90d vs 180d.")
    bullets.append("Validação prospectiva independente ainda ausente — resultados permanecem exploratórios.")
    return {"title": "Por que o modelo ainda não melhorou?", "bullets": bullets}


def main() -> None:
    cfg = yaml.safe_load((ROOT / "config.yaml").read_text(encoding="utf-8"))
    data_dir = (ROOT / cfg["data_dir"]).resolve()
    out_dir = (ROOT / cfg["output_dir"]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    client_col = cfg["client_col"]

    tables = load_datasets(data_dir)
    csv_path = data_dir / "dataset_preditivo_validado.csv"
    base = modeling_frame(tables["validated"], cfg)
    enriched = enrich_frame(base, client_col)

    split = split_from_etapa4(enriched, cfg, out_dir)
    if split.test.empty:
        payload = {"version": "predictive-study-v15", "status": "failed", "error": split.note}
        (out_dir / "predictive_study_v15.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
        sys.exit(1)

    fit_train = pd.concat([split.train, split.val], ignore_index=True) if not split.val.empty else split.train
    test = split.test.copy()

    # Comparação justa: mesmo treino/teste, C fixo (config), sem re-otimizar em jun/2026
    model_e = fit_model("E", fit_train, cfg)
    prob_e = predict_proba(model_e, test)
    model_v2 = fit_v2_fixed(fit_train, cfg)
    prob_v2 = predict_tm(model_v2, test)

    met_e = metrics_block("E_fair_refit", test, prob_e, cfg, client_col)
    met_v2 = metrics_block("v2_logistic_fair", test, prob_v2, cfg, client_col)
    paired = paired_auc_diff_ci(test, "y", prob_v2, prob_e, client_col, n_boot=300, seed=int(cfg["seed"]))

    # Artefato congelado Etapa 4 (referência — pode diferir levemente se purga mudou)
    frozen_e = None
    frozen_path = out_dir / "modeling_results_etapa4.json"
    if frozen_path.exists():
        frozen = json.loads(frozen_path.read_text(encoding="utf-8"))
        frozen_e = frozen.get("models", {}).get("E", {}).get("test")

    model_e_phase = fit_e_with_phase(fit_train, cfg)
    prob_ep = predict_tm(model_e_phase, test)
    met_ep = metrics_block("E_plus_phase", test, prob_ep, cfg, client_col)

    phase_split = {}
    impl_train = fit_train[fit_train["classificacao_historica"].astype(str).eq("Em implantação")]
    impl_test = test[test["classificacao_historica"].astype(str).eq("Em implantação")]
    if len(impl_train) >= 200 and len(impl_test) >= 80:
        m_impl = fit_model("E", impl_train, cfg)
        p_impl = predict_proba(m_impl, impl_test)
        phase_split["implantacao_only"] = metrics_block("E_implantacao_subset", impl_test, p_impl, cfg, client_col)
    else:
        phase_split["implantacao_only"] = {"skipped": True, "reason": "amostra insuficiente no teste"}

    segments = segment_churn_table(enriched, client_col, seed=int(cfg["seed"]))
    hs_phase = hs_churn_by_phase(enriched, client_col, seed=int(cfg["seed"]))
    temporal = temporal_feature_audit(enriched)
    horizons = horizon_summary(tables["validated"], cfg)
    horizon_models = model_e_auc_by_horizon(tables["validated"], cfg)

    holdout_may = exploratory_month_holdout(enriched, cfg, "2026-05")

    fair_comparison = {
        "protocol": {
            "same_labeled_frame": True,
            "same_temporal_split": True,
            "split_note": split.note,
            "train_months": split.train_months,
            "test_months": split.test_months,
            "C_fixed": float(cfg["logistic"]["C"]),
            "no_hyperparam_tuning_on_test": True,
            "test_not_confirmatory": "jun/2026 já utilizado na Etapa 4 e V2",
        },
        "model_E_refit": met_e,
        "model_V2_logistic_refit": met_v2,
        "model_E_frozen_etapa4_test": frozen_e,
        "paired_v2_minus_E_auc": paired,
        "model_E_plus_phase_var": met_ep,
        "phase_submodels": phase_split,
        "exploratory_holdout": holdout_may,
    }

    why = build_why_not_improved(fair_comparison, segments, horizons, paired, temporal)

    recommendation = (
        "Manter Modelo E (Etapa 4) como referência congelada até validação temporal independente. "
        "Priorizar reengenharia de export (NPS PIT, horizontes 30/60, tenure contratual real) e estratificação por fase — "
        "não trocar algoritmo sem ganho pareado significativo."
    )
    if paired.get("ci_low") is not None and paired.get("ci_high") is not None and paired["ci_low"] > 0.01:
        recommendation = (
            "V2 mostra ganho exploratório pareado — ainda assim aguardar período de validação novo antes de candidato operacional."
        )

    manifest = {
        "study_version": "predictive-study-v15",
        "state": "diagnostic_exploratory",
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "dataset_hash_sha256_16": dataset_hash(csv_path),
        "depends_on": ["predictive_study_v2.json (opcional)", "modeling_results_etapa4.json"],
        "approval": "none",
    }

    payload = {
        "version": "predictive-study-v15",
        "status": "ok",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "environment": {"python": sys.version, "sklearn": sklearn.__version__, "seed": int(cfg["seed"])},
        "manifest": manifest,
        "fair_comparison": fair_comparison,
        "segment_audit": segments,
        "hs_churn_by_phase": hs_phase,
        "temporal_features": temporal,
        "horizons": horizons,
        "horizon_model_e": horizon_models,
        "diagnosis": why,
        "methodological_recommendation": recommendation,
    }

    out_path = out_dir / "predictive_study_v15.json"
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"ok": True, "path": str(out_path), "paired_auc_diff": paired}, indent=2))


if __name__ == "__main__":
    main()
