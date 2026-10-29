from __future__ import annotations

from pathlib import Path

import pandas as pd


def load_csv(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, sep=";", encoding="utf-8-sig", low_memory=False)


def load_datasets(data_dir: Path) -> dict[str, pd.DataFrame]:
    data_dir = Path(data_dir)
    tables = {
        "validated": load_csv(data_dir / "dataset_preditivo_validado.csv"),
        "churn": load_csv(data_dir / "churn_consolidado.csv"),
        "hs": load_csv(data_dir / "hs_historico_mensal.csv"),
    }
    optional = {
        "churn_events": "churn_eventos.csv",
        "cancel_signals": "cancelamento_sinais.csv",
        "clients_snap": "clientes_cadastro_snapshot.csv",
    }
    for key, name in optional.items():
        path = data_dir / name
        if path.exists():
            tables[key] = load_csv(path)
    return tables


def bool_col(series: pd.Series) -> pd.Series:
    return series.astype(str).str.lower().eq("true")


def numeric_col(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series.replace("", pd.NA), errors="coerce")


def prepare_labeled(df: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    out = df.copy()
    out["y"] = bool_col(out[cfg["target_col"]]).astype(int)
    out["eligible"] = bool_col(out[cfg["label_eligible_col"]])
    out["censored"] = bool_col(out[cfg["censor_col"]])
    out["ref_dt"] = pd.to_datetime(out[cfg["reference_date_col"]], utc=True, errors="coerce")
    out["mes"] = out[cfg["reference_col"]].astype(str)
    for col in [
        "engajamento_historico",
        "mecanismos_historico",
        "hs_historico",
        "reunioes_acumuladas",
        "reunioes_30d",
        "reunioes_90d",
        "reunioes_180d",
        "recencia_dias",
        "freq_media_mes",
        "mecanismos_implantados",
    ]:
        if col in out.columns:
            out[col] = numeric_col(out[col])
    for col in ["classificacao_historica", "cobertura_engajamento", "cobertura_mecanismos", "confiabilidade_reconstrucao"]:
        if col in out.columns:
            out[col] = out[col].astype(str).replace("nan", "")
    return out


def modeling_frame(df: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    labeled = prepare_labeled(df, cfg)
    return labeled[labeled["eligible"] & ~labeled["censored"]].copy()
