#!/usr/bin/env python3
"""Experimentos A–E com split temporal (pesquisa)."""
from __future__ import annotations

import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
import yaml

from src.data import bool_col, load_datasets, modeling_frame
from src.metrics import (
    bootstrap_auc_by_client,
    calibration_bins,
    classification_metrics,
    curve_points,
    lift_at_top,
    safe_auc,
)
from src.models import FEATURE_SETS, baseline_prevalence, baseline_score, fit_model, predict_proba
from src.splits import assign_temporal_split


ROOT = Path(__file__).resolve().parent


def hs_outcome_eda(model_df: pd.DataFrame) -> dict:
    df = model_df.copy()
    df["hs_bin"] = pd.cut(
        df["hs_historico"],
        bins=[-0.1, 20, 40, 60, 80, 100.1],
        labels=["0-20", "20-40", "40-60", "60-80", "80-100"],
    )
    rows = []
    for label, g in df.groupby("hs_bin", observed=False):
        if pd.isna(label):
            continue
        rows.append(
            {
                "hs_faixa": str(label),
                "n": int(len(g)),
                "churn_rate_90d": float(g["y"].mean()),
            }
        )
    return {"hs_churn_rate_by_band": rows}


def eval_split(name: str, model_id: str, df: pd.DataFrame, prob: np.ndarray, cfg: dict, client_col: str) -> dict:
    metrics = classification_metrics(df["y"], prob)
    metrics["lift"] = lift_at_top(df["y"], prob)
    metrics["calibration"] = calibration_bins(df["y"], prob)
    metrics["curves"] = curve_points(df["y"], prob)
    if name == "test":
        metrics["bootstrap_roc_auc"] = bootstrap_auc_by_client(
            df, prob, client_col, int(cfg["bootstrap_clients"]), int(cfg["seed"])
        )
    metrics["split"] = name
    metrics["model_id"] = model_id
    return metrics


def main() -> None:
    cfg = yaml.safe_load((ROOT / "config.yaml").read_text(encoding="utf-8"))
    data_dir = (ROOT / cfg["data_dir"]).resolve()
    out_dir = (ROOT / cfg["output_dir"]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    models_dir = out_dir / "models"
    models_dir.mkdir(exist_ok=True)

    tables = load_datasets(data_dir)
    model_df = modeling_frame(tables["validated"], cfg)

    if cfg.get("sensitivity_exclude_date_conflicts"):
        churn = tables["churn"]
        if "conflito_datas" in churn.columns:
            bad = set(churn.loc[bool_col(churn["conflito_datas"]), "cliente_ref"].astype(str))
            model_df = model_df[~model_df["cliente_ref"].isin(bad)].copy()

    split = assign_temporal_split(model_df, cfg)
    if split.test.empty or split.train.empty:
        payload = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "status": "blocked",
            "reason": split.note,
            "problem": {
                "horizon_days": cfg["horizon_days"],
                "target": cfg["target_col"],
                "eligible": cfg["label_eligible_col"],
                "censoring": "censura_90d — censurados excluídos do rótulo binário",
            },
        }
        (out_dir / "modeling_results.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
        print("Bloqueado:", split.note)
        return

    # threshold tuned on validation
    results = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "ok",
        "research_only": True,
        "environment": {
            "python": sys.version,
            "platform": platform.platform(),
            "sklearn": sklearn.__version__,
            "seed": cfg["seed"],
        },
        "problem": {
            "horizon_days": 90,
            "reference": "mes_referencia / data_referencia",
            "outcome": "desfecho_churn_90d",
            "population": "elegivel_modelagem_90d & ~censura_90d",
        },
        "split": {
            "train_months": split.train_months,
            "val_months": split.val_months,
            "test_months": split.test_months,
            "purged_train_rows": split.purged_train_rows,
            "note": split.note,
            "client_overlap": {
                "train_val": int(len(set(split.train["cliente_ref"]) & set(split.val["cliente_ref"]))),
                "train_test": int(len(set(split.train["cliente_ref"]) & set(split.test["cliente_ref"]))),
                "val_test": int(len(set(split.val["cliente_ref"]) & set(split.test["cliente_ref"]))),
            },
        },
        "sample": {
            "labeled_rows": int(len(model_df)),
            "train": int(len(split.train)),
            "val": int(len(split.val)),
            "test": int(len(split.test)),
            "prevalence_train": float(split.train["y"].mean()),
            "prevalence_test": float(split.test["y"].mean()),
        },
        "hs_eda": hs_outcome_eda(model_df),
        "models": {},
        "baselines": {},
    }

    for model_id in FEATURE_SETS:
        trained = fit_model(model_id, split.train, cfg)
        joblib.dump(trained.pipeline, models_dir / f"logreg_{model_id}.joblib")
        has_val = len(split.val) > 0
        val_prob = predict_proba(trained, split.val) if has_val else None
        test_prob = predict_proba(trained, split.test)
        best_t = 0.5
        if has_val:
            best_f1 = -1
            for t in np.linspace(0.05, 0.95, 19):
                m = classification_metrics(split.val["y"], val_prob, threshold=float(t))
                if m["f1"] > best_f1:
                    best_f1 = m["f1"]
                    best_t = float(t)
        results["models"][model_id] = {
            "label": FEATURE_SETS[model_id]["label"],
            "features": trained.features,
            "coef_top": trained.coef_summary[:15],
            "val_threshold": best_t,
            "val": eval_split("val", model_id, split.val, val_prob, cfg, cfg["client_col"]) if has_val else None,
            "test": eval_split("test", model_id, split.test, test_prob, cfg, cfg["client_col"]),
        }
        results["models"][model_id]["test"]["metrics_at_val_threshold"] = classification_metrics(
            split.test["y"], test_prob, threshold=best_t
        )

    # baselines on test
    prev = baseline_prevalence(split.train, split.test)
    results["baselines"]["prevalence"] = classification_metrics(split.test["y"], prev)
    for key, col in [("rule_E", "engajamento_historico"), ("rule_M", "mecanismos_historico"), ("rule_HS", "hs_historico")]:
        scores = baseline_score(split.test, col)
        if scores is not None:
            results["baselines"][key] = {
                "roc_auc": safe_auc(split.test["y"], scores),
                "note": "Score invertido como proxy de risco (descritivo)",
            }

    # ranking by test PR-AUC
    ranking = []
    for mid, body in results["models"].items():
        pr = body["test"].get("pr_auc")
        ranking.append({"model_id": mid, "label": body["label"], "test_pr_auc": pr, "test_roc_auc": body["test"].get("roc_auc")})
    ranking.sort(key=lambda x: (x["test_pr_auc"] is None, -(x["test_pr_auc"] or 0)))
    results["ranking_test"] = ranking

    results["limitations"] = [
        "Rótulos 90d disponíveis apenas em 5 meses (2026-02 a 2026-06).",
        "Treino purgado ficou restrito a 2026-02; teste em 2026-06.",
        "Sobreposição de clientes entre treino e teste — métricas não são clientes novos.",
        "66 clientes com conflito de datas excluídos (sensibilidade).",
        "M retrospectivo a partir de status atual — risco de viés.",
    ]
    results["oos_confidence"] = "baixa"

    results["interpretation_hints"] = [
        "Coeficientes logisticos indicam associação preditiva, não causalidade.",
        "Dependência cliente-mês: IC de AUC via bootstrap por cliente_ref.",
        "M retrospectivo pode inflar ou deflacionar sinal — ver pre_audit.json.",
    ]

    (out_dir / "modeling_results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    report = build_report(results, out_dir)
    (out_dir / "RELATORIO_METODOLOGICO.md").write_text(report, encoding="utf-8")
    print(f"modeling_results.json -> {out_dir}")
    print("Ranking teste PR-AUC:", ranking)


def build_report(results: dict, out_dir: Path) -> str:
    audit_path = out_dir / "pre_audit.json"
    audit = json.loads(audit_path.read_text(encoding="utf-8")) if audit_path.exists() else {}
    lines = [
        "# Relatório metodológico — Etapa 4",
        "",
        f"Gerado: {results.get('generatedAt')}",
        "",
        "## Amostra",
        f"- Clientes únicos (rotulados 90d): {audit.get('unique_clients_labeled_90d')}",
        f"- Clientes com pelo menos um positivo 90d: {audit.get('unique_clients_with_churn_outcome')}",
        f"- Linhas rotuladas: {results.get('sample', {}).get('labeled_rows')}",
        "",
        "## Split temporal",
        f"- {results.get('split', {}).get('note')}",
        f"- Treino: {results.get('sample', {}).get('train')} | Teste: {results.get('sample', {}).get('test')}",
        f"- Confiança OOS: **{results.get('oos_confidence')}**",
        "",
        "## Ranking (PR-AUC teste)",
    ]
    for row in results.get("ranking_test", []):
        lines.append(f"- {row['model_id']}: PR-AUC={row.get('test_pr_auc')} ROC-AUC={row.get('test_roc_auc')}")
    lines.extend(["", "## Limitações", *[f"- {x}" for x in results.get("limitations", [])], ""])
    return "\n".join(lines)


if __name__ == "__main__":
    main()
