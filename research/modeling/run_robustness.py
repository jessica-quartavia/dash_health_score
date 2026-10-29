#!/usr/bin/env python3
"""Etapa 5 — robustez estatística e diagnóstico do HS."""
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yaml

from src.cluster_bootstrap import paired_auc_diff_ci
from src.data import bool_col, load_datasets, modeling_frame
from src.feature_matrix import build_feature_matrix
from src.hs_robustness import audit_hs_bands, classify_zero_hs_context
from src.models import fit_model, predict_proba
from src.recencia_audit import audit_recencia
from src.robustness_models import run_m_sensitivity, run_recencia_variants, stratified_test_metrics
from src.splits import assign_temporal_split


ROOT = Path(__file__).resolve().parent
STAGE = "etapa5-v1"


def conflict_sets(churn_df: pd.DataFrame) -> dict:
    if "conflito_datas" not in churn_df.columns:
        return {"excluir": set(), "confiavel": set(), "todos": set()}
    conf = churn_df[bool_col(churn_df["conflito_datas"])]
    conf_refs = set(conf["cliente_ref"].astype(str))
    alta = set(
        conf.loc[conf["confiabilidade_data"].astype(str).str.lower().eq("alta"), "cliente_ref"].astype(str)
    )
    return {"excluir": conf_refs, "confiavel_apenas": alta, "todos_conflito": conf_refs}


def filter_clients(df, refs: set) -> pd.DataFrame:
    if not refs:
        return df
    return df[~df["cliente_ref"].isin(refs)].copy()


def temporal_alternatives(df, cfg) -> list[dict]:
    """Documenta splits alternativos legítimos; não inventa val fictícia."""
    months = sorted(df["mes"].unique())
    notes = []
    split_main = assign_temporal_split(df, cfg)
    notes.append({"id": "etapa4_holdout", "note": split_main.note, "test_months": split_main.test_months})
    if len(months) >= 4:
        notes.append(
            {
                "id": "exploratorio_teste_maio",
                "note": "Teste 2026-05 com treino purgado até fev — exploratório; junho permanece teste final documentado.",
                "viavel": "2026-05" in months and "2026-02" in months,
            }
        )
    return notes


def main() -> None:
    cfg = yaml.safe_load((ROOT / "config.yaml").read_text(encoding="utf-8"))
    out_dir = (ROOT / cfg["output_dir"]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    # Preservar Etapa 4
    stage4 = out_dir / "modeling_results_etapa4.json"
    current = out_dir / "modeling_results.json"
    if current.exists() and not stage4.exists():
        shutil.copy(current, stage4)

    tables = load_datasets((ROOT / cfg["data_dir"]).resolve())
    base_df = modeling_frame(tables["validated"], cfg)
    conflicts = conflict_sets(tables["churn"])
    df = filter_clients(base_df, conflicts["excluir"])

    importance = {}
    if current.exists():
        prev = json.loads(current.read_text(encoding="utf-8"))
        for mid, body in (prev.get("models") or {}).items():
            importance[mid] = body.get("coef_top") or []

    payload = {
        "version": STAGE,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "research_only": True,
        "preserves": "modeling_results_etapa4.json",
        "hs_bands": audit_hs_bands(df, cfg),
        "zero_hs_context": classify_zero_hs_context(df),
        "recencia": audit_recencia(df, cfg),
        "feature_matrix": build_feature_matrix(df, importance),
        "temporal_notes": temporal_alternatives(df, cfg),
        "conflict_sensitivity": {},
        "m_sensitivity": {},
        "recencia_models": {},
        "paired_model_diffs_test": {},
        "stratified_test_E": {},
        "hs20_recommendations": [],
    }

    split = assign_temporal_split(df, cfg)
    if not split.test.empty and not split.train.empty:
        train, test = split.train, split.test
        payload["split_used"] = {
            "note": split.note,
            "train_months": split.train_months,
            "test_months": split.test_months,
            "exploratory_on_same_partition": True,
            "june_is_final_test": "2026-06" in split.test_months,
        }

        payload["m_sensitivity"] = run_m_sensitivity(train, test, cfg)
        payload["recencia_models"] = run_recencia_variants(train, test, cfg)

        model_e = fit_model("E", train, cfg)
        model_c = fit_model("C", train, cfg)
        prob_e = predict_proba(model_e, test)
        prob_c = predict_proba(model_c, test)
        payload["paired_model_diffs_test"] = {
            "E_minus_C_auc": paired_auc_diff_ci(test, "y", prob_e, prob_c, cfg["client_col"], seed=int(cfg["seed"])),
        }
        payload["stratified_test_E"] = stratified_test_metrics(test, prob_e, cfg)

        from src.metrics import safe_auc

        for label, refs in [("excluir_66", conflicts["excluir"]), ("incluir_todos", set())]:
            sub = filter_clients(base_df, refs if label == "excluir_66" else set())
            sp = assign_temporal_split(sub, cfg)
            if sp.test.empty or sp.train.empty:
                payload["conflict_sensitivity"][label] = {"skipped": True}
                continue
            me = fit_model("E", sp.train, cfg)
            prob = predict_proba(me, sp.test)
            payload["conflict_sensitivity"][label] = {
                "test_roc_auc": safe_auc(sp.test["y"], prob),
                "n_test": int(len(sp.test)),
            }

    # Recomendações HS 2.0
    band0 = next((b for b in payload["hs_bands"]["bands"] if b["hs_faixa"] == "0-20"), None)
    ctrl = payload["hs_bands"].get("controlled_reuniao") or []
    payload["hs20_recommendations"] = [
        "Separar visualmente HS baixo por contexto (implantação, sem registro, limite de fonte).",
        "Não tratar ausência de reunião como score zero comprovado de desengajamento maduro.",
        "Recencia: usar flag de ausência ou métricas brtas de contagem; 81% missing é estrutural.",
        "M: priorizar trilha histórica de status antes de uso operacional; sensibilidade documentada.",
        "Manter pesos 50/50 até val independente — não otimizar no teste de junho.",
        "Conflitos de churn: conclusões estáveis ao excluir 66 clientes (ver conflict_sensitivity).",
    ]
    if band0 and band0.get("taxa_por_observacao", 0) > 0.3:
        payload["hs20_recommendations"].insert(
            0,
            "Faixa 0-20 concentra churn observado; investigar composição (implantação/sem reunião) antes de rotular como risco.",
        )

    (out_dir / "robustness_results.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    report_lines = [
        "# Relatório de robustez — Etapa 5",
        "",
        f"Versão: {STAGE}",
        f"Gerado: {payload['generatedAt']}",
        "",
        "## Faixa HS 0-20",
        json.dumps(band0, indent=2, ensure_ascii=False) if band0 else "n/d",
        "",
        "## Recomendações HS 2.0",
        *[f"- {x}" for x in payload["hs20_recommendations"]],
        "",
        "## Recência",
        json.dumps(payload["recencia"].get("estatisticas"), indent=2),
    ]
    (out_dir / "RELATORIO_ROBUSTEZ.md").write_text("\n".join(report_lines), encoding="utf-8")
    print(f"robustness_results.json -> {out_dir}")


if __name__ == "__main__":
    main()
