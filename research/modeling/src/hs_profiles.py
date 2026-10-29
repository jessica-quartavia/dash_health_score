from __future__ import annotations

import pandas as pd

from src.cluster_bootstrap import cluster_rate_ci


PROFILE_DEFS = {
    "em_implantacao": "classificacao_historica == Em implantação (regra tenure 90d)",
    "sem_historico_suficiente": "Menos de 2 reuniões e fora de implantação, ou cobertura pre_fonte",
    "sem_reunioes_observadas": "reunioes_acumuladas == 0 na referência",
    "engajamento_baixo_comprovado": "E <= 20 com pelo menos 1 reunião observada",
    "engajamento_moderado": "20 < E <= 60 com reuniões",
    "engajamento_elevado": "E > 60",
    "mecanismos_nao_implementados": "mecanismos_implantados == 0 ou M <= 20",
    "mecanismos_implementados": "mecanismos_implantados >= 1 e M > 20",
    "historico_inconsistente": "confiabilidade_reconstrucao != integral ou conflito cadastral proxy",
}


def profile_tags(row: pd.Series) -> list[str]:
    tags: list[str] = []
    reun = float(row.get("reunioes_acumuladas") or 0)
    e = float(row.get("engajamento_historico") or 0)
    m = float(row.get("mecanismos_historico") or 0)
    mech_n = float(row.get("mecanismos_implantados") or 0)
    cls = str(row.get("classificacao_historica") or "")
    cov_e = str(row.get("cobertura_engajamento") or "")
    cov_m = str(row.get("cobertura_mecanismos") or "")
    recon = str(row.get("confiabilidade_reconstrucao") or "")

    if cls == "Em implantação":
        tags.append("em_implantacao")
    if cov_e == "pre_fonte" or (reun < 2 and cls != "Em implantação"):
        tags.append("sem_historico_suficiente")
    if reun == 0:
        tags.append("sem_reunioes_observadas")
    if reun > 0 and e <= 20:
        tags.append("engajamento_baixo_comprovado")
    if reun > 0 and 20 < e <= 60:
        tags.append("engajamento_moderado")
    if e > 60:
        tags.append("engajamento_elevado")
    if mech_n == 0 or m <= 20:
        tags.append("mecanismos_nao_implementados")
    if mech_n >= 1 and m > 20:
        tags.append("mecanismos_implementados")
    if recon != "integral" or cov_m == "sem_vinculo":
        tags.append("historico_inconsistente")
    return tags


def analyze_profiles(df: pd.DataFrame, cfg: dict) -> dict:
    work = df.copy()
    work["perfis"] = work.apply(profile_tags, axis=1)
    client_col = cfg["client_col"]
    profiles = []
    for name in PROFILE_DEFS:
        sub = work[work["perfis"].map(lambda t: name in t)]
        if sub.empty:
            continue
        ci = cluster_rate_ci(sub, "y", client_col, n_boot=200, seed=int(cfg["seed"]))
        prog = sub.groupby("programa")["y"].agg(["count", "mean"]).reset_index().head(5).to_dict(orient="records")
        profiles.append(
            {
                "perfil": name,
                "definicao": PROFILE_DEFS[name],
                "clientes_unicos": int(sub[client_col].nunique()),
                "observacoes": int(len(sub)),
                "e_media": float(sub["engajamento_historico"].mean()),
                "m_media": float(sub["mecanismos_historico"].mean()),
                "hs_media": float(sub["hs_historico"].mean()),
                "reunioes_media": float(sub["reunioes_acumuladas"].mean()),
                "cobertura_engajamento": sub["cobertura_engajamento"].value_counts().astype(int).to_dict()
                if "cobertura_engajamento" in sub.columns
                else {},
                "cobertura_mecanismos": sub["cobertura_mecanismos"].value_counts().astype(int).to_dict()
                if "cobertura_mecanismos" in sub.columns
                else {},
                "churn_90d": {
                    "taxa": ci["rate"],
                    "ci_low": ci["ci_low"],
                    "ci_high": ci["ci_high"],
                },
                "programa_top": prog,
                "nota": "Perfil descritivo — não é score de risco.",
            }
        )
    overlap = work["perfis"].map(len)
    return {
        "version": "etapa6-v1",
        "definicoes": PROFILE_DEFS,
        "perfis": profiles,
        "multi_perfil": {
            "media_tags_por_obs": float(overlap.mean()),
            "obs_com_2_ou_mais_tags": int((overlap >= 2).sum()),
        },
    }
