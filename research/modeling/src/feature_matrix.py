from __future__ import annotations

FEATURE_SPECS = [
    {
        "name": "engajamento_historico",
        "source": "scoring.scoreEngagement(freq_media_mes)",
        "type": "numeric",
        "leakage": "baixo se freq usa só reuniões até referência",
        "experiments": ["A", "E"],
    },
    {
        "name": "mecanismos_historico",
        "source": "scoring.scoreMechanisms(implantados até ref)",
        "type": "numeric",
        "leakage": "médio — status snapshot",
        "experiments": ["B", "E"],
    },
    {
        "name": "hs_historico",
        "source": "0.5*E+0.5*M",
        "type": "numeric",
        "leakage": "derivado; não usar com E e M juntos",
        "experiments": ["C"],
    },
    {
        "name": "freq_media_mes",
        "source": "reuniões acumuladas / meses desde ciclo",
        "type": "numeric",
        "leakage": "baixo",
        "experiments": ["A", "D", "E"],
    },
    {
        "name": "recencia_dias",
        "source": "dias desde última reunião até ref",
        "type": "numeric",
        "leakage": "baixo; alta ausência",
        "experiments": ["A", "D", "E"],
    },
    {
        "name": "reunioes_30d",
        "source": "contagem janela 30d",
        "type": "numeric",
        "leakage": "baixo",
        "experiments": ["A", "D", "E"],
    },
    {
        "name": "mecanismos_implantados",
        "source": "contagem bruta implantados",
        "type": "numeric",
        "leakage": "médio",
        "experiments": ["B", "D", "E"],
    },
    {
        "name": "programa",
        "source": "clients.programa snapshot export",
        "type": "categorical",
        "leakage": "cadastro atual no export — cuidado histórico",
        "experiments": ["D", "E"],
    },
    {
        "name": "desfecho_churn_90d",
        "source": "churn consolidado",
        "type": "outcome",
        "leakage": "proibido como feature",
        "experiments": [],
    },
]


def build_feature_matrix(df, importance_by_model: dict | None = None) -> list[dict]:
    rows = []
    for spec in FEATURE_SPECS:
        name = spec["name"]
        cov = None
        if name in df.columns and spec["type"] != "outcome":
            cov = float(df[name].notna().mean()) if name != "programa" else float((df[name].astype(str).str.len() > 0).mean())
        imp = {}
        if importance_by_model:
            for mid, coefs in importance_by_model.items():
                for c in coefs[:5]:
                    if name in c.get("feature", ""):
                        imp[mid] = c.get("coef")
        rows.append({**spec, "coverage": cov, "importance_coef": imp})
    rows.append(
        {
            "name": "NOTA_COLinearidade",
            "source": "HS = f(E,M); não interpretar E,M,HS juntos na mesma regressão",
            "type": "method",
            "leakage": "n/a",
            "experiments": ["ver documentação"],
            "coverage": None,
            "importance_coef": {},
        }
    )
    return rows
