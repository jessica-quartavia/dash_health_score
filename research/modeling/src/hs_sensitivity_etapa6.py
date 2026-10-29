from __future__ import annotations

import pandas as pd

from src.data_quality import classify_information_quality
from src.metrics import classification_metrics
from src.models import fit_model, predict_proba
from src.splits import assign_temporal_split


def _eval_subset(train, test, cfg, label: str) -> dict:
    if len(train) < 80 or len(test) < 40 or test["y"].nunique() < 2:
        return {"label": label, "skipped": "amostra_insuficiente", "n_train": len(train), "n_test": len(test)}
    model = fit_model("E", train, cfg)
    prob = predict_proba(model, test)
    m = classification_metrics(test["y"], prob)
    return {
        "label": label,
        "exploratory": True,
        "n_train": len(train),
        "n_test": int(len(test)),
        "roc_auc": m["roc_auc"],
        "pr_auc": m["pr_auc"],
        "prevalence": m["prevalence"],
    }


def run_hs_sensitivity(df: pd.DataFrame, cfg: dict) -> dict:
    work = df.copy()
    work["qualidade_informacao"] = work.apply(classify_information_quality, axis=1)
    split = assign_temporal_split(work, cfg)
    train = split.train.copy()
    test = split.test.copy()

    scenarios = []

    def run(name, train_f, test_f):
        tr = train_f(train)
        te = test_f(test)
        scenarios.append(_eval_subset(tr, te, cfg, name))

    run("baseline_elegivel_original", lambda x: x, lambda x: x)
    run(
        "excluir_historico_insuficiente",
        lambda x: x[x["qualidade_informacao"] != "historico_insuficiente"],
        lambda x: x[x["qualidade_informacao"] != "historico_insuficiente"],
    )
    run(
        "excluir_solicitacao_antes_ref",
        lambda x: x[~x["solicitacao_formal_antes_ref"]],
        lambda x: x[~x["solicitacao_formal_antes_ref"]],
    )
    run(
        "excluir_m_reconstrucao_incerta",
        lambda x: x[x["cobertura_mecanismos"] == "completa"],
        lambda x: x[x["cobertura_mecanismos"] == "completa"],
    )
    run(
        "somente_alta_confiabilidade",
        lambda x: x[x["qualidade_informacao"] == "alta_confiabilidade"],
        lambda x: x[x["qualidade_informacao"] == "alta_confiabilidade"],
    )
    reun = work["reunioes_acumuladas"].fillna(0)
    work["tenure_estrat"] = pd.cut(
        reun,
        bins=[-1, 0, 2, 5, 999],
        labels=["0_reun", "1_2_reun", "3_5_reun", "6_mais"],
    )
    strata = []
    test_strat = test.copy()
    test_strat["tenure_estrat"] = pd.cut(
        test_strat["reunioes_acumuladas"].fillna(0),
        bins=[-1, 0, 2, 5, 999],
        labels=["0_reun", "1_2_reun", "3_5_reun", "6_mais"],
    )
    model = fit_model("E", train, cfg) if len(train) >= 80 else None
    for tier, sub in test_strat.groupby("tenure_estrat", observed=True):
        if model is None or len(sub) < 30 or sub["y"].nunique() < 2:
            continue
        prob = predict_proba(model, sub)
        m = classification_metrics(sub["y"], prob)
        strata.append({"tenure": str(tier), "roc_auc": m["roc_auc"], "n": m["n"]})

    desc = []
    for name, filt in [
        ("baseline", work),
        ("sem_solicitacao_previa", work[~work["solicitacao_formal_antes_ref"]]),
    ]:
        desc.append(
            {
                "cenario": name,
                "observacoes": int(len(filt)),
                "taxa_churn": float(filt["y"].mean()),
                "positivos": int(filt["y"].sum()),
            }
        )

    return {
        "version": "etapa6-v1",
        "split_note": split.note,
        "test_months": split.test_months,
        "exploratory_disclaimer": "Métricas preditivas usam jun/2026 como partição já documentada — comparações são exploratórias.",
        "modelo_E_logistico": scenarios,
        "descritivo_churn": desc,
        "estrato_tenure_teste_E": strata,
    }
