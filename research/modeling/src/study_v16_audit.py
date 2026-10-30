"""Auditoria de churn e denominadores — Etapa 16."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from src.data import bool_col


def churn_dataset_audit(tables: dict, cfg: dict, pre_audit: dict | None) -> dict:
    validated = tables["validated"]
    churn = tables.get("churn")
    client_col = cfg["client_col"]
    target = cfg["target_col"]
    eligible_col = cfg["label_eligible_col"]

    labeled = validated.copy()
    labeled["y"] = bool_col(labeled[target]).astype(int)
    labeled["eligible"] = bool_col(labeled[eligible_col])
    model_rows = labeled[labeled["eligible"]].copy()

    episodes_n = int(len(churn)) if churn is not None else None
    episodes_confirmed = None
    if churn is not None and "churn_confirmado" in churn.columns:
        episodes_confirmed = int(bool_col(churn["churn_confirmado"]).sum())

    unique_clients_obs = int(model_rows[client_col].nunique())
    unique_clients_pos = int(model_rows.loc[model_rows["y"] == 1, client_col].nunique())
    positive_rows = int(model_rows["y"].sum())
    n_obs = int(len(model_rows))

    by_client = model_rows.groupby(client_col)["y"].agg(["sum", "count"])
    multi_pos_clients = int((by_client["sum"] > 1).sum())
    mean_pos_months = float(by_client.loc[by_client["sum"] > 0, "sum"].mean()) if positive_rows else None

    pre = pre_audit or {}
    reactivated_proxy = pre.get("reactivated_proxy_multi_month_span")

    notes = [
        "Observações cliente-mês elegíveis não são clientes independentes — métricas pareadas usam bootstrap por cliente.",
        "Taxa por linha ≠ taxa anual por cliente; comparar sempre o mesmo denominador.",
    ]
    if reactivated_proxy is not None:
        notes.append(
            f"pre_audit.reactivated_proxy_multi_month_span={reactivated_proxy} é proxy de reativação/cobertura multi-mês, "
            "não contagem de episódios de churn."
        )
    if episodes_n is not None:
        notes.append(f"churn_consolidado.csv: {episodes_n} linhas; confirmados={episodes_confirmed}.")

    return {
        "observations_eligible_90d": n_obs,
        "positive_observation_months": positive_rows,
        "negative_observation_months": int(n_obs - positive_rows),
        "prevalence_by_observation": round(positive_rows / n_obs, 4) if n_obs else None,
        "unique_clients_in_model_frame": unique_clients_obs,
        "unique_clients_with_any_positive_month": unique_clients_pos,
        "clients_with_multiple_positive_months": multi_pos_clients,
        "mean_positive_months_per_churned_client": round(mean_pos_months, 3) if mean_pos_months is not None else None,
        "churn_episode_rows": episodes_n,
        "churn_episodes_confirmed": episodes_confirmed,
        "pre_audit_crosswalk": {
            "positive_rows_90d": pre.get("positive_rows_90d"),
            "unique_clients_labeled_90d": pre.get("unique_clients_labeled_90d"),
            "date_conflict_clients": pre.get("date_conflict_clients"),
            "reactivated_proxy_multi_month_span": reactivated_proxy,
        },
        "methodological_notes": notes,
    }


def load_pre_audit(out_dir: Path) -> dict | None:
    p = out_dir / "pre_audit.json"
    if not p.exists():
        return None
    import json

    return json.loads(p.read_text(encoding="utf-8"))


def enrichment_availability(df: pd.DataFrame) -> list[dict]:
    """Variáveis desejadas na Etapa 16 vs colunas no export validado."""
    desired = {
        "relationship": ["classificacao_historica", "programa", "meses_desde_primeira_obs"],
        "engagement": [
            "engajamento_historico",
            "reunioes_30d",
            "reunioes_60d",
            "reunioes_90d",
            "reunioes_180d",
            "freq_media_mes",
            "recencia_dias",
            "reunioes_acumuladas",
        ],
        "mechanisms": ["mecanismos_historico", "mecanismos_implantados", "cobertura_mecanismos"],
        "satisfaction": ["nps_historico", "nps_ultimo", "dias_desde_nps"],
        "support": ["demandas_abertas", "tarefas_pendentes", "eventos_suporte_90d"],
    }
    rows = []
    for group, cols in desired.items():
        for name in cols:
            if name not in df.columns:
                rows.append(
                    {
                        "group": group,
                        "name": name,
                        "in_export": False,
                        "coverage": 0.0,
                        "pit_usable": False,
                        "note": "coluna ausente — não entra em experimentos confirmatórios",
                    }
                )
                continue
            if df[name].dtype == object:
                cov = float((df[name].astype(str).str.len() > 0).mean())
            else:
                cov = float(pd.to_numeric(df[name], errors="coerce").notna().mean())
            rows.append(
                {
                    "group": group,
                    "name": name,
                    "in_export": True,
                    "coverage": round(cov, 4),
                    "pit_usable": cov > 0.05,
                    "note": "point-in-time no export" if cov > 0.05 else "cobertura insuficiente",
                }
            )
    if "meses_desde_primeira_obs" not in df.columns:
        rows.append(
            {
                "group": "relationship",
                "name": "meses_desde_primeira_obs",
                "in_export": False,
                "coverage": 0.0,
                "pit_usable": False,
                "note": "derivada na engenharia (painel por cliente)",
            }
        )
    return rows
