from __future__ import annotations

import pandas as pd

from src.cluster_bootstrap import cluster_rate_ci


def audit_recencia(df: pd.DataFrame, cfg: dict) -> dict:
    d = df.copy()
    missing = d["recencia_dias"].isna() | (d["recencia_dias"].astype(str).str.strip() == "")
    d["recencia_ausente"] = missing
    d.loc[missing, "recencia_dias_num"] = pd.NA
    d.loc[~missing, "recencia_dias_num"] = pd.to_numeric(d.loc[~missing, "recencia_dias"], errors="coerce")

    no_meeting = d["reunioes_acumuladas"].fillna(0) == 0
    cc = cfg["client_col"]

    reasons = {
        "ausente_total": int(missing.sum()),
        "ausente_pct": float(missing.mean()),
        "ausente_quando_sem_reuniao": float(missing[no_meeting].mean()) if no_meeting.any() else None,
        "ausente_quando_com_reuniao": float(missing[~no_meeting].mean()) if (~no_meeting).any() else None,
    }

    churn_missing = cluster_rate_ci(d, "y", cc, mask=missing, seed=int(cfg["seed"]))
    churn_present = cluster_rate_ci(d, "y", cc, mask=~missing, seed=int(cfg["seed"]) + 1)

    return {
        "motivo_principal": "recencia_dias só definida após pelo menos uma reunião válida até a referência",
        "estatisticas": reasons,
        "churn_rate_recencia_ausente": churn_missing,
        "churn_rate_recencia_presente": churn_present,
        "interpretacao_ausencia": (
            "Ausência esperada sem reunião; pode ser informativa (proxy de desengajamento), "
            "mas não equivale a recência infinita comprovada."
        ),
    }
