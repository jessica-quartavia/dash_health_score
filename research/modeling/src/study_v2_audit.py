"""Auditoria Fase 1 — Estudo Preditivo 2.0."""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from src.data import modeling_frame, prepare_labeled
from src.implantation_audit import audit_implantation_churn


def _load_pre_audit(out_dir: Path) -> dict | None:
    p = out_dir / "pre_audit.json"
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def run_study_v2_audit(tables: dict, cfg: dict, out_dir: Path, split_note: str, test_prevalence: float | None) -> dict:
    df = tables["validated"]
    churn = tables.get("churn")
    labeled = prepare_labeled(df, cfg)
    model_df = modeling_frame(df, cfg)
    client_col = cfg["client_col"]
    pre = _load_pre_audit(out_dir) or {}

    pos = model_df[model_df["y"] == 1]
    labeled_rows = len(model_df)
    rate_obs = float(pos.shape[0] / labeled_rows) if labeled_rows else None

    impl = model_df[model_df["classificacao_historica"].astype(str).eq("Em implantação")]
    estab = model_df[~model_df["classificacao_historica"].astype(str).eq("Em implantação")]
    impl_rate = float(impl["y"].mean()) if len(impl) else None
    estab_rate = float(estab["y"].mean()) if len(estab) else None

    conflict_n = int(pre.get("date_conflict_clients", 0))
    implant_audit = {}
    data_dir = Path(cfg.get("_data_dir", ""))
    if churn is not None and data_dir:
        try:
            implant_audit = audit_implantation_churn(labeled, churn, data_dir, cfg)
        except Exception as exc:  # noqa: BLE001
            implant_audit = {"error": str(exc)}

    leakage_checks = []
    forbidden = ["desfecho_churn_90d", "desfecho_churn_180d", "data_observacao_asof"]
    for col in forbidden:
        if col in df.columns:
            leakage_checks.append(f"{col} presente no CSV — excluída de features (outcome/asof).")

    conclusions = [
        f"Taxa {rate_obs:.1%} por observação cliente-mês rotulada (90d) — origem: {pos.shape[0]}/{labeled_rows} linhas."
        if rate_obs is not None
        else "Taxa por observação indisponível.",
        f"Taxa por cliente único com ≥1 mês positivo: {pre.get('unique_clients_with_churn_outcome', '—')}/{pre.get('unique_clients_labeled_90d', '—')} clientes.",
        f"Média de meses positivos por cliente: {pre.get('positive_months_per_client_mean', '—')} — repetição do mesmo episódio.",
        f"Implantação: taxa churn observada {impl_rate:.1%} (n={len(impl)}) vs pós-implantação {estab_rate:.1%} (n={len(estab)})."
        if impl_rate is not None and estab_rate is not None
        else "Separação implantação indisponível.",
        f"Conflitos de data de churn (clientes): {conflict_n} — ver churn_consolidado.",
        f"Prevalência no período de teste exploratório: {test_prevalence:.1%} — distinta da taxa global agregada."
        if test_prevalence is not None
        else "Prevalência de teste a calcular após split.",
        "Jun/2026 já utilizado em experimentos A–E — não tratar reruns como validação confirmatória.",
        "Prevalência de treino ≠ taxa esperada na carteira operacional atual sem estudo de representatividade.",
    ]

    return {
        "rate_by_observation": rate_obs,
        "rate_implantacao": impl_rate,
        "rate_pos_implantacao": estab_rate,
        "pre_audit_summary": {
            k: pre.get(k)
            for k in [
                "positive_rows_90d",
                "negative_rows_90d",
                "unique_clients_labeled_90d",
                "unique_clients_with_churn_outcome",
                "positive_months_per_client_mean",
                "date_conflict_clients",
            ]
        },
        "implantation_audit": implant_audit,
        "leakage_checks": leakage_checks,
        "split_note": split_note,
        "conclusions": conclusions,
        "stored_predictions_etapa4": "research/modeling/output/models/ (joblib por modelo A–E, se gerados por run_experiments)",
    }
