from __future__ import annotations

import pandas as pd


def month_sort(m: str) -> tuple[int, int]:
    y, mo = m.split("-")
    return int(y), int(mo)


def temporal_stability(df: pd.DataFrame, cfg: dict) -> dict:
    work = df.dropna(subset=["hs_historico", "mes"]).copy()
    client_col = cfg["client_col"]
    months = sorted(work["mes"].unique(), key=month_sort)

    # Clientes com >=2 meses
    counts = work.groupby(client_col)["mes"].nunique()
    multi = counts[counts >= 2].index
    sub = work[work[client_col].isin(multi)]

    pairs = []
    for i in range(len(months) - 1):
        m1, m2 = months[i], months[i + 1]
        a = sub[sub["mes"] == m1][[client_col, "hs_historico"]].rename(columns={"hs_historico": "hs_t"})
        b = sub[sub["mes"] == m2][[client_col, "hs_historico"]].rename(columns={"hs_historico": "hs_t1"})
        merged = a.merge(b, on=client_col)
        if len(merged) < 30:
            continue
        corr = merged["hs_t"].corr(merged["hs_t1"])
        mean_delta = float((merged["hs_t1"] - merged["hs_t"]).mean())
        pairs.append({"de": m1, "para": m2, "n_clientes": int(len(merged)), "corr_hs": float(corr), "delta_medio": mean_delta})

    by_month = (
        work.groupby("mes")["hs_historico"]
        .agg(["count", "mean", "std"])
        .reset_index()
        .sort_values("mes", key=lambda s: s.map(lambda m: month_sort(str(m))))
        .to_dict(orient="records")
    )

    perfil_shift = []
    if "perfil_relacionamento" in work.columns:
        for m in months:
            g = work[work["mes"] == m]
            perfil_shift.append(
                {
                    "mes": m,
                    "distribuicao_perfil": g["perfil_relacionamento"].value_counts(normalize=True).head(6).to_dict(),
                }
            )

    return {
        "version": "etapa7-v1",
        "meses_observados": months,
        "pares_consecutivos": pairs,
        "hs_v1_por_mes": by_month,
        "perfil_por_mes": perfil_shift,
        "interpretacao": "Correlação mês a mês mede estabilidade do V1; quedas abruptas podem refletir cobertura, não só comportamento.",
    }
