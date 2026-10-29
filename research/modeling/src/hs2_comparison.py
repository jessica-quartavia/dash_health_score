from __future__ import annotations

import numpy as np
import pandas as pd

from src.cluster_bootstrap import cluster_rate_ci
from src.hs2_prototype import hs2a_context, hs2b_dimensions, _load_nps_coverage
from src.hs2_taxonomy import primary_relationship_profile


def _distribution(series: pd.Series, bins: list[float], labels: list[str]) -> list[dict]:
    cut = pd.cut(series, bins=bins, labels=labels, include_lowest=True)
    counts = cut.value_counts().sort_index()
    total = len(series.dropna())
    return [{"faixa": str(k), "n": int(v), "share": float(v / total) if total else 0} for k, v in counts.items()]


def compare_hs_variants(df: pd.DataFrame, cfg: dict, data_dir) -> dict:
    work = df.copy()
    work["hs_v1"] = work["hs_historico"]
    work["perfil_relacionamento"] = work.apply(primary_relationship_profile, axis=1)
    work["qualidade_informacional"] = work.apply(
        lambda r: hs2a_context(r)["qualidade_informacional"], axis=1
    )

    hs_bins = [-0.1, 20, 40, 60, 80, 100.1]
    hs_labels = ["0-20", "20-40", "40-60", "60-80", "80-100"]
    dist_v1 = _distribution(work["hs_v1"], hs_bins, hs_labels)

    # 2.0A: mesma distribuição numérica; diferenciação por perfil
    profile_hs = (
        work.groupby("perfil_relacionamento")["hs_v1"]
        .agg(["count", "mean", "std"])
        .reset_index()
        .to_dict(orient="records")
    )

    client_col = cfg["client_col"]
    churn_by_profile = []
    for perfil in work["perfil_relacionamento"].unique():
        sub = work[work["perfil_relacionamento"] == perfil]
        if len(sub) < 50:
            continue
        ci = cluster_rate_ci(sub, "y", client_col, n_boot=200, seed=int(cfg["seed"]))
        churn_by_profile.append({"perfil": perfil, "churn_90d": ci, "hs_medio": float(sub["hs_v1"].mean(skipna=True))})

    by_program = []
    for prog, sub in work.groupby("programa"):
        if len(sub) < 100:
            continue
        by_program.append(
            {
                "programa": str(prog),
                "n": int(len(sub)),
                "hs_v1_medio": float(sub["hs_v1"].mean(skipna=True)),
                "churn_rate": float(sub["y"].mean()),
                "share_implantacao": float((sub["perfil_relacionamento"] == "em_implantacao").mean()),
            }
        )

    implant = work[work["perfil_relacionamento"] == "em_implantacao"]
    implant_stats = {
        "n": int(len(implant)),
        "hs_v1_medio": float(implant["hs_v1"].mean(skipna=True)) if len(implant) else None,
        "churn_rate": float(implant["y"].mean()) if len(implant) else None,
    }

    nps = _load_nps_coverage(data_dir)
    dim_cov = hs2b_dimensions(work.iloc[0], nps) if len(work) else {}
    b_coverage = {
        "engajamento": float(work["engajamento_historico"].notna().mean()),
        "mecanismos_completa": float((work["cobertura_mecanismos"] == "completa").mean()),
        "continuidade_confiavel": float(work.get("entrada_contratual_confiavel", pd.Series(False)).mean())
        if "entrada_contratual_confiavel" in work.columns
        else None,
        "satisfacao_nps": nps,
        "suporte": {"disponivel": False},
    }

    # Diferenciação: entropia de perfis vs entropia faixas HS
    prof_share = work["perfil_relacionamento"].value_counts(normalize=True)
    profile_entropy = float(-(prof_share * np.log(prof_share + 1e-12)).sum())

    return {
        "version": "etapa7-v1",
        "exploratory_note": "Comparações descritivas; jun/2026 já usado em etapas anteriores — sem validação confirmatória.",
        "hs_v1": {
            "formula": "0.5*E+0.5*M",
            "distribuicao_faixas": dist_v1,
            "cobertura_score": float(work["hs_v1"].notna().mean()),
        },
        "hs_2_0a": {
            "score_igual_v1": True,
            "contexto_por_perfil": profile_hs,
            "qualidade_informacional": work["qualidade_informacional"].value_counts().astype(int).to_dict(),
        },
        "hs_2_0b": {
            "sem_score_agregado": True,
            "cobertura_dimensoes": b_coverage,
            "dimensoes_confiaveis_tipicas": dim_cov.get("dimensoes_confiaveis", []) if isinstance(dim_cov, dict) else [],
        },
        "associacao_churn_descritiva": churn_by_profile,
        "por_programa": by_program,
        "implantacao": implant_stats,
        "diferenciacao": {
            "entropia_perfis_relacionamento": profile_entropy,
            "n_perfis_ativos": int(work["perfil_relacionamento"].nunique()),
        },
    }
