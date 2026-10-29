from __future__ import annotations

import pandas as pd

from src.cluster_bootstrap import cluster_rate_ci

HS_BINS = [-0.1, 20, 40, 60, 80, 100.1]
HS_LABELS = ["0-20", "20-40", "40-60", "60-80", "80-100"]


def assign_hs_band(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["hs_faixa"] = pd.cut(out["hs_historico"], bins=HS_BINS, labels=HS_LABELS)
    return out


def tenure_band(reunioes_acumuladas) -> str:
    n = float(reunioes_acumuladas) if pd.notna(reunioes_acumuladas) else 0
    if n == 0:
        return "0_reunioes"
    if n <= 2:
        return "1_2_reunioes"
    if n <= 5:
        return "3_5_reunioes"
    return "6_mais"


def audit_hs_bands(df: pd.DataFrame, cfg: dict) -> dict:
    data = assign_hs_band(df)
    client_col = cfg["client_col"]
    rows = []
    for label in HS_LABELS:
        g = data[data["hs_faixa"] == label]
        if g.empty:
            continue
        churn_clients = g.loc[g["y"] == 1, client_col].nunique()
        ci = cluster_rate_ci(g, "y", client_col, n_boot=int(cfg.get("bootstrap_clients", 200)), seed=int(cfg["seed"]))
        prog = g.groupby("programa")["y"].agg(["count", "mean"]).reset_index().head(8)
        tenure = g.assign(tenure= g["reunioes_acumuladas"].map(tenure_band))
        by_tenure = tenure.groupby("tenure")["y"].agg(["count", "mean"]).reset_index()
        rows.append(
            {
                "hs_faixa": label,
                "observacoes": int(len(g)),
                "clientes_unicos": int(g[client_col].nunique()),
                "clientes_com_churn": int(churn_clients),
                "eventos_positivos_linha": int(g["y"].sum()),
                "taxa_por_observacao": ci["rate"],
                "taxa_ci_low": ci["ci_low"],
                "taxa_ci_high": ci["ci_high"],
                "sem_reuniao": int((g["reunioes_acumuladas"].fillna(0) == 0).sum()),
                "cobertura_engajamento": g["cobertura_engajamento"].value_counts().astype(int).to_dict()
                if "cobertura_engajamento" in g.columns
                else {},
                "cobertura_mecanismos": g["cobertura_mecanismos"].value_counts().astype(int).to_dict()
                if "cobertura_mecanismos" in g.columns
                else {},
                "programa_top": prog.to_dict(orient="records"),
                "permanencia_proxy": by_tenure.to_dict(orient="records"),
                "e_media": float(g["engajamento_historico"].mean()),
                "m_media": float(g["mecanismos_historico"].mean()),
            }
        )

    controlled = []
    for label in HS_LABELS:
        g = data[data["hs_faixa"] == label]
        for reuniao_flag in [True, False]:
            sub = g[(g["reunioes_acumuladas"].fillna(0) > 0) == reuniao_flag]
            if len(sub) < 30:
                continue
            ci = cluster_rate_ci(sub, "y", client_col, n_boot=200, seed=int(cfg["seed"]))
            controlled.append(
                {
                    "hs_faixa": label,
                    "com_reuniao": reuniao_flag,
                    "n": int(len(sub)),
                    "taxa": ci["rate"],
                    "ci_low": ci["ci_low"],
                    "ci_high": ci["ci_high"],
                }
            )

    return {"bands": rows, "controlled_reuniao": controlled}


def classify_zero_hs_context(df: pd.DataFrame) -> dict:
    d = df.copy()
    near_zero = d[d["hs_historico"].fillna(999) <= 20].copy()

    def bucket(row):
        if row.get("cobertura_engajamento") == "pre_fonte":
            return "limite_fonte_reunioes"
        if row.get("classificacao_historica") == "Em implantação":
            return "em_implantacao_tenure"
        reun = float(row.get("reunioes_acumuladas") or 0)
        e = float(row.get("engajamento_historico") or 0)
        m = float(row.get("mecanismos_historico") or 0)
        if reun == 0 and e == 0 and m == 0:
            if row.get("classificacao_historica") == "Sem registro":
                return "sem_registro_comprovado"
            return "sem_atividade_observada"
        if e == 0 and m > 0:
            return "e_zero_m_positivo"
        if m == 0 and e > 0:
            return "m_zero_e_positivo"
        if e == 0 and m == 0:
            return "ambos_zero"
        return "hs_baixo_outros"

    near_zero["contexto_hs_baixo"] = near_zero.apply(bucket, axis=1)
    summary = near_zero.groupby("contexto_hs_baixo").agg(
        n=("y", "count"),
        churn_rate=("y", "mean"),
        clientes=("cliente_ref", "nunique"),
    ).reset_index()
    return {
        "definicoes": [
            "limite_fonte_reunioes: cobertura_engajamento=pre_fonte",
            "em_implantacao_tenure: classificacao Em implantação",
            "sem_registro_comprovado: Sem registro e zero reunião/mecanismo",
            "sem_atividade_observada: zero E/M/reuniões sem rótulo Sem registro",
            "e_zero_m_positivo / m_zero_e_positivo / ambos_zero",
        ],
        "distribuicao": summary.to_dict(orient="records"),
    }
