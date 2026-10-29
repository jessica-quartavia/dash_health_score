from __future__ import annotations

from pathlib import Path

import pandas as pd

from src.cluster_bootstrap import cluster_rate_ci
from src.data import load_csv


def _parse_dt(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series.replace("", pd.NA), utc=True, errors="coerce")


def load_client_snapshot(data_dir: Path) -> pd.DataFrame:
    path = data_dir / "clientes_cadastro_snapshot.csv"
    if path.exists():
        df = load_csv(path)
    else:
        hist = data_dir / "clientes_historico.csv"
        if not hist.exists():
            return pd.DataFrame()
        df = load_csv(hist)
        df = df.rename(
            columns={
                "data_churn": "data_churn_snapshot",
            }
        )
    for col in ["created_at", "data_inicio_ciclo", "cliente_desde", "data_churn_snapshot"]:
        if col in df.columns:
            df[col] = _parse_dt(df[col])
    return df


def audit_implantation_churn(df: pd.DataFrame, churn_df: pd.DataFrame, data_dir: Path, cfg: dict) -> dict:
    impl = df[df["classificacao_historica"] == "Em implantação"].copy()
    client_col = cfg["client_col"]
    if impl.empty:
        return {"observacoes": 0}

    snap = load_client_snapshot(data_dir)
    churn_df = churn_df.copy()
    churn_df["churn_data"] = _parse_dt(churn_df["churn_data"])

    merged = impl.merge(snap, on="cliente_ref", how="left", suffixes=("", "_snap"))
    if "churn_data" not in merged.columns:
        merged = merged.merge(churn_df[["cliente_ref", "churn_data"]], on="cliente_ref", how="left")
    pos = merged[merged["y"] == 1].copy()
    if not pos.empty:
        pos["dias_ref_ate_churn"] = (pos["churn_data"] - pos["ref_dt"]).dt.days
        entry = pos["data_inicio_ciclo"].fillna(pos.get("created_at"))
        pos["dias_entrada_ate_churn"] = (pos["churn_data"] - entry).dt.days

    created = merged["created_at"]
    batch_2026 = created.dt.year.eq(2026) & created.dt.month.eq(2) if created.notna().any() else pd.Series(False, index=merged.index)
    ci = cluster_rate_ci(impl, "y", client_col, n_boot=200, seed=int(cfg["seed"]))

    investigacao = []
    if not pos.empty:
        suspicious = pos[
            (pos.get("dias_ref_ate_churn", 999) <= 7)
            | (pos.get("solicitacao_formal_antes_ref", False))
        ].head(25)
        for _, row in suspicious.iterrows():
            investigacao.append(
                {
                    "cliente_ref": row["cliente_ref"],
                    "mes_referencia": row.get("mes"),
                    "dias_ref_ate_churn": int(row["dias_ref_ate_churn"]) if pd.notna(row.get("dias_ref_ate_churn")) else None,
                    "solicitacao_antes_ref": bool(row.get("solicitacao_formal_antes_ref")),
                    "criterio": "churn_proximo_ref_ou_solicitacao_previa",
                }
            )

    ciclo_vs_created = merged.copy()
    if "data_inicio_ciclo" in ciclo_vs_created.columns and "created_at" in ciclo_vs_created.columns:
        ciclo_vs_created["delta_ciclo_created_dias"] = (
            ciclo_vs_created["data_inicio_ciclo"] - ciclo_vs_created["created_at"]
        ).dt.days
        med_delta = float(ciclo_vs_created["delta_ciclo_created_dias"].median(skipna=True))
    else:
        med_delta = None

    timing = {}
    if not pos.empty and "dias_ref_ate_churn" in pos.columns:
        timing = {
            "mediana_dias_ref_churn": float(pos["dias_ref_ate_churn"].median()),
            "share_churn_30d_pos_ref": float((pos["dias_ref_ate_churn"] <= 30).mean()),
        }

    return {
        "version": "etapa6-v1",
        "observacoes_implantacao": int(len(impl)),
        "clientes_unicos": int(impl[client_col].nunique()),
        "churn_90d_ic": ci,
        "timing_positivos": timing,
        "created_at_2026_02_share": float(batch_2026.mean()) if len(batch_2026) else None,
        "mediana_delta_ciclo_minus_created_dias": med_delta,
        "positivos_com_solicitacao_previa": int(pos["solicitacao_formal_antes_ref"].sum()) if not pos.empty else 0,
        "interpretacao": [
            "Churn elevado combina clientes novos (E/M baixos por construção) com saídas precoces reais.",
            "Lote created_at em fev/2026 sugere migração cadastral — usar data_inicio_ciclo/cliente_desde como referência principal.",
            "Solicitações formais antes da ref inflacionam taxa se rotuladas como antecipação.",
        ],
        "investigacao_pseudonimizada_amostra": investigacao,
    }
