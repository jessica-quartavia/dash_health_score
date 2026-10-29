from __future__ import annotations

import pandas as pd

from src.cluster_bootstrap import cluster_rate_ci

QUALITY_RULES = """
Alta confiabilidade:
- cobertura_engajamento = completa
- confiabilidade_reconstrucao = integral
- cobertura_mecanismos != sem_vinculo OU cliente em implantação com ciclo definido

Confiabilidade parcial:
- reconstrucao parcial OU sem_vinculo em M OU sem reuniões após janela de implantação
  (ausência de reunião sozinha NÃO rebaixa quem ainda está em implantação)

Histórico insuficiente:
- cobertura_engajamento pre_fonte / indisponivel
- confiabilidade_reconstrucao = nao_reconstruivel
""".strip()


def classify_information_quality(row: pd.Series) -> str:
    cov_e = str(row.get("cobertura_engajamento") or "")
    recon = str(row.get("confiabilidade_reconstrucao") or "")
    cov_m = str(row.get("cobertura_mecanismos") or "")
    cls = str(row.get("classificacao_historica") or "")
    reun = float(row.get("reunioes_acumuladas") or 0)

    if cov_e in ("pre_fonte", "indisponivel") or recon == "nao_reconstruivel":
        return "historico_insuficiente"
    if recon == "parcial" or cov_m == "sem_vinculo":
        return "confiabilidade_parcial"
    if reun == 0 and cls != "Em implantação":
        return "confiabilidade_parcial"
    return "alta_confiabilidade"


def build_data_quality_report(df: pd.DataFrame, cfg: dict) -> dict:
    work = df.copy()
    work["qualidade_informacao"] = work.apply(classify_information_quality, axis=1)
    client_col = cfg["client_col"]
    tiers = []
    for tier in ["alta_confiabilidade", "confiabilidade_parcial", "historico_insuficiente"]:
        sub = work[work["qualidade_informacao"] == tier]
        if sub.empty:
            continue
        ci = cluster_rate_ci(sub, "y", client_col, n_boot=200, seed=int(cfg["seed"]))
        tiers.append(
            {
                "categoria": tier,
                "observacoes": int(len(sub)),
                "clientes": int(sub[client_col].nunique()),
                "churn_90d": ci,
                "hs_medio": float(sub["hs_historico"].mean()),
            }
        )
    return {
        "version": "etapa6-v1",
        "regras": QUALITY_RULES,
        "nota": "Indicador auxiliar de cobertura — não é probabilidade de churn.",
        "distribuicao": tiers,
        "componentes_avaliados": [
            "cobertura temporal de reuniões",
            "disponibilidade de histórico (pre_fonte)",
            "confiabilidade_reconstrucao E/M",
            "cobertura_mecanismos (sem_vinculo)",
            "consistência cadastral (proxy reconstrucao)",
        ],
    }
