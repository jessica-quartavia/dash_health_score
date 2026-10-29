from __future__ import annotations

from pathlib import Path

import pandas as pd

from src.cluster_bootstrap import cluster_rate_ci
from src.data import bool_col, load_csv, numeric_col


INTENT_KEYWORDS = ("pedido", "intenc", "solicit", "distrato", "reembolso", "cancel")


def _parse_dt(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series.replace("", pd.NA), utc=True, errors="coerce")


def load_churn_events(data_dir: Path) -> pd.DataFrame:
    path = data_dir / "churn_eventos.csv"
    if not path.exists():
        return pd.DataFrame()
    df = load_csv(path)
    df["created_at"] = _parse_dt(df.get("created_at", pd.Series(dtype=str)))
    df["ocorreu_em"] = _parse_dt(df.get("ocorreu_em", pd.Series(dtype=str)))
    if "cancelamento" in df.columns:
        df["cancelamento"] = bool_col(df["cancelamento"])
    return df


def load_cancel_signals(data_dir: Path) -> pd.DataFrame:
    path = data_dir / "cancelamento_sinais.csv"
    if path.exists():
        df = load_csv(path)
        df["data_sinal"] = _parse_dt(df["data_sinal"])
        df["efetivo"] = bool_col(df["efetivo"])
        df["pedido_pendente"] = bool_col(df["pedido_pendente"])
        return df
    return pd.DataFrame()


def _intent_from_events(events: pd.DataFrame) -> pd.DataFrame:
    if events.empty:
        return events
    tipo = events.get("tipo", pd.Series("", index=events.index)).astype(str).str.lower()
    status = events.get("status", pd.Series("", index=events.index)).astype(str).str.lower()
    fonte = events.get("fonte", pd.Series("", index=events.index)).astype(str).str.lower()
    intent = tipo.str.contains("|".join(INTENT_KEYWORDS), regex=True) | status.str.contains(
        "|".join(INTENT_KEYWORDS), regex=True
    )
    formal = fonte.isin(["cancellations", "cancellation_events"]) & (
        intent | events.get("cancelamento", False)
    )
    out = events.copy()
    out["sinal_formal"] = formal
    out["data_registro"] = out["created_at"].fillna(out["ocorreu_em"])
    return out


def attach_cancellation_flags(df: pd.DataFrame, data_dir: Path) -> pd.DataFrame:
    out = df.copy()
    signals = load_cancel_signals(data_dir)
    events = _intent_from_events(load_churn_events(data_dir))

    out["solicitacao_formal_antes_ref"] = False
    out["pedido_pendente_antes_ref"] = False
    out["registro_cancelamento_antes_ref"] = False

    if not signals.empty:
        for cref, grp in signals.groupby("cliente_ref"):
            mask = out["cliente_ref"].astype(str) == str(cref)
            if not mask.any():
                continue
            refs = out.loc[mask, "ref_dt"]
            ped = grp["pedido_pendente"] & grp["data_sinal"].notna()
            for idx, ref in refs.items():
                if ref is pd.NaT:
                    continue
                before = grp["data_sinal"] <= ref
                if (ped & before).any():
                    out.at[idx, "pedido_pendente_antes_ref"] = True
                    out.at[idx, "solicitacao_formal_antes_ref"] = True
                non_eff = (~grp["efetivo"]) & before
                if non_eff.any():
                    out.at[idx, "solicitacao_formal_antes_ref"] = True
                eff = grp["efetivo"] & before
                if eff.any():
                    out.at[idx, "registro_cancelamento_antes_ref"] = True

    if not events.empty:
        cancel_ev = events[events["data_registro"].notna()].copy()
        for cref, grp in cancel_ev.groupby("cliente_ref"):
            mask = out["cliente_ref"].astype(str) == str(cref)
            if not mask.any():
                continue
            for idx, ref in out.loc[mask, "ref_dt"].items():
                if ref is pd.NaT:
                    continue
                reg = grp["data_registro"] <= ref
                if not reg.any():
                    continue
                out.at[idx, "registro_cancelamento_antes_ref"] = True
                subset = grp.loc[reg]
                eff_after = subset["ocorreu_em"].isna() | (subset["ocorreu_em"] > ref)
                intent = subset["sinal_formal"] | subset["fonte"].astype(str).str.lower().eq("cancellations")
                if (eff_after & intent).any():
                    out.at[idx, "solicitacao_formal_antes_ref"] = True
                if subset["fonte"].astype(str).str.lower().eq("cancellations").any() and eff_after.any():
                    out.at[idx, "solicitacao_formal_antes_ref"] = True

    out["y_anticipacao"] = (out["y"] == 1) & ~out["solicitacao_formal_antes_ref"]
    out["y_efetivacao_pos_solicitacao"] = (out["y"] == 1) & out["solicitacao_formal_antes_ref"]
    return out


def audit_early_churn_timing(df: pd.DataFrame, churn_df: pd.DataFrame, cfg: dict) -> dict:
    churn_df = churn_df.copy()
    churn_df["churn_data"] = _parse_dt(churn_df["churn_data"])
    merged = df.merge(
        churn_df[["cliente_ref", "churn_data"]],
        on="cliente_ref",
        how="left",
    )
    pos = merged[merged["y"] == 1].copy()
    if pos.empty:
        return {"positivos": 0, "buckets_dias_pos_ref": []}
    pos["dias_ate_churn"] = (pos["churn_data"] - pos["ref_dt"]).dt.days
    buckets = []
    for label, lo, hi in [("0-30", 0, 30), ("31-60", 31, 60), ("61-90", 61, 90), ("91+", 91, 9999)]:
        sub = pos[(pos["dias_ate_churn"] >= lo) & (pos["dias_ate_churn"] <= hi)]
        buckets.append({"faixa_dias_pos_ref": label, "eventos": int(len(sub)), "share_positivos": float(len(sub) / len(pos))})
    return {
        "positivos_linhas": int(len(pos)),
        "buckets_dias_pos_ref": buckets,
        "mediana_dias": float(pos["dias_ate_churn"].median()),
    }


def audit_cancellation_influence(df: pd.DataFrame, cfg: dict) -> dict:
    client_col = cfg["client_col"]
    base = cluster_rate_ci(df, "y", client_col, n_boot=200, seed=int(cfg["seed"]))
    pos = df[df["y"] == 1]
    share_solicit_pos = float(pos["solicitacao_formal_antes_ref"].mean()) if len(pos) else 0.0
    anticip = df[~df["solicitacao_formal_antes_ref"]]
    ci_anticip = cluster_rate_ci(anticip, "y", client_col, n_boot=200, seed=int(cfg["seed"]))
    solicit = df[df["solicitacao_formal_antes_ref"]]
    ci_solicit = cluster_rate_ci(solicit, "y", client_col, n_boot=200, seed=int(cfg["seed"])) if len(solicit) > 30 else {}
    return {
        "cenario_principal": {
            "descricao": "Antecipação — churn 90d sem solicitação formal registrada até a referência",
            "observacoes": int(len(anticip)),
            "taxa_churn": ci_anticip.get("rate"),
            "ci_low": ci_anticip.get("ci_low"),
            "ci_high": ci_anticip.get("ci_high"),
        },
        "cenario_efetivacao": {
            "descricao": "Efetivação — observações com solicitação/intenção formal antes da referência",
            "observacoes": int(len(solicit)),
            "taxa_churn": ci_solicit.get("rate"),
            "ci_low": ci_solicit.get("ci_low"),
            "ci_high": ci_solicit.get("ci_high"),
        },
        "populacao_total": base,
        "positivos_com_solicitacao_previa": {
            "n": int(pos["solicitacao_formal_antes_ref"].sum()),
            "share_dos_positivos": share_solicit_pos,
        },
        "flags": {
            "solicitacao_formal_antes_ref": int(df["solicitacao_formal_antes_ref"].sum()),
            "pedido_pendente_antes_ref": int(df["pedido_pendente_antes_ref"].sum()),
            "registro_cancelamento_antes_ref": int(df["registro_cancelamento_antes_ref"].sum()),
        },
    }


def audit_etapa5_followup(df: pd.DataFrame, cfg: dict) -> dict:
    """Respostas à auditoria prioritária pós-Etapa 5."""
    from src.hs_robustness import assign_hs_band, tenure_band

    data = assign_hs_band(df)
    band0 = data[data["hs_faixa"] == "0-20"]
    impl = data[data["classificacao_historica"] == "Em implantação"]
    client_col = cfg["client_col"]
    ci_impl = cluster_rate_ci(impl, "y", client_col, n_boot=200, seed=int(cfg["seed"]))
    ci_band0 = cluster_rate_ci(band0, "y", client_col, n_boot=200, seed=int(cfg["seed"]))
    by_prog = (
        band0.groupby("programa")["y"]
        .agg(["count", "mean"])
        .reset_index()
        .sort_values("count", ascending=False)
        .head(6)
        .to_dict(orient="records")
    )
    band0_tenure = band0.assign(tenure=band0["reunioes_acumuladas"].map(tenure_band))
    tenure_stats = band0_tenure.groupby("tenure")["y"].agg(["count", "mean"]).reset_index().to_dict(orient="records")
    return {
        "hs_0_20": {
            "observacoes": int(len(band0)),
            "taxa_churn_ic": ci_band0,
            "sem_reuniao_share": float((band0["reunioes_acumuladas"].fillna(0) == 0).mean()),
            "m_zero_share": float((band0["mecanismos_historico"].fillna(0) == 0).mean()),
            "em_implantacao_share": float((band0["classificacao_historica"] == "Em implantação").mean()),
            "programa": by_prog,
            "permanencia": tenure_stats,
            "interpretacao": "Concentração mixta: implantação, ausência de reunião e M=0 por sem_vinculo — não é só desengajamento comprovado.",
        },
        "em_implantacao": {
            "observacoes": int(len(impl)),
            "taxa_churn_ic": ci_impl,
            "hs_medio": float(impl["hs_historico"].mean()),
            "e_medio": float(impl["engajamento_historico"].mean()),
        },
    }
