from __future__ import annotations

import pandas as pd

from src.cluster_bootstrap import cluster_rate_ci

TAXONOMY_RULES = {
    "em_implantacao": "classificacao_historica == Em implantação",
    "relacionamento_estabelecido": "Fora de implantação, >=3 reuniões acumuladas ou E>40",
    "baixa_atividade_observada": ">=1 reunião e E<=20 (comportamento observado, não risco automático)",
    "historico_insuficiente": "pre_fonte ou reconstrucao nao_reconstruivel ou <2 reuniões fora implantação",
    "alta_atividade": "freq_media_mes >= 1 ou reunioes_30d >= 1",
    "mecanismos_nao_observaveis": "cobertura_mecanismos == sem_vinculo",
    "dados_inconsistentes": "confiabilidade_entrada baixa/inconsistente ou reconstrucao parcial",
}


def primary_relationship_profile(row: pd.Series) -> str:
    """Perfil principal mutuamente prioritário (interpretativo, não risco)."""
    cls = str(row.get("classificacao_historica") or "")
    cov_e = str(row.get("cobertura_engajamento") or "")
    recon = str(row.get("confiabilidade_reconstrucao") or "")
    reun = float(row.get("reunioes_acumuladas") or 0)
    e = float(row.get("engajamento_historico") or 0)
    cov_m = str(row.get("cobertura_mecanismos") or "")
    conf_t = str(row.get("confiabilidade_entrada") or "")

    if conf_t in ("baixa_migracao_ou_ausente", "inconsistente") or recon == "parcial":
        return "dados_inconsistentes"
    if cov_e in ("pre_fonte", "indisponivel") or recon == "nao_reconstruivel":
        return "historico_insuficiente"
    if cls == "Em implantação":
        return "em_implantacao"
    if cov_m == "sem_vinculo":
        return "mecanismos_nao_observaveis"
    if reun >= 1 and e <= 20:
        return "baixa_atividade_observada"
    if reun >= 3 or e > 40:
        return "relacionamento_estabelecido"
    if reun < 2:
        return "historico_insuficiente"
    return "relacionamento_estabelecido"


def secondary_tags(row: pd.Series) -> list[str]:
    tags = []
    freq = float(row.get("freq_media_mes") or 0)
    r30 = float(row.get("reunioes_30d") or 0)
    if freq >= 1 or r30 >= 1:
        tags.append("alta_atividade")
    reun = float(row.get("reunioes_acumuladas") or 0)
    if reun == 0 and str(row.get("classificacao_historica") or "") != "Em implantação":
        tags.append("sem_reuniao_pos_implantacao")
    return tags


def build_hs2_profiles(df: pd.DataFrame, cfg: dict) -> dict:
    work = df.copy()
    work["perfil_relacionamento"] = work.apply(primary_relationship_profile, axis=1)
    work["tags_secundarias"] = work.apply(secondary_tags, axis=1)
    client_col = cfg["client_col"]
    rows = []
    for perfil, rules in TAXONOMY_RULES.items():
        sub = work[work["perfil_relacionamento"] == perfil]
        if sub.empty:
            continue
        ci = cluster_rate_ci(sub, "y", client_col, n_boot=200, seed=int(cfg["seed"]))
        rows.append(
            {
                "perfil": perfil,
                "regra": rules,
                "observacoes": int(len(sub)),
                "clientes": int(sub[client_col].nunique()),
                "hs_v1_medio": float(sub["hs_historico"].mean(skipna=True)),
                "churn_90d_descritivo": ci,
                "nota": "Descritivo — perfil ≠ classificação automática de risco.",
            }
        )
    return {
        "version": "etapa7-v1",
        "taxonomia": TAXONOMY_RULES,
        "perfis_primarios": rows,
        "distribuicao_contagens": work["perfil_relacionamento"].value_counts().astype(int).to_dict(),
    }
