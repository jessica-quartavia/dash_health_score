from __future__ import annotations

from pathlib import Path

import pandas as pd

from src.data import load_csv


def _parse_dt(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series.replace("", pd.NA), utc=True, errors="coerce")


def load_tenure_sources(data_dir: Path) -> pd.DataFrame:
    snap = data_dir / "clientes_cadastro_snapshot.csv"
    hist = data_dir / "clientes_historico.csv"
    if snap.exists():
        df = load_csv(snap)
    elif hist.exists():
        df = load_csv(hist)
        if "cliente_desde" not in df.columns and "data_inicio_ciclo" in df.columns:
            df["cliente_desde"] = df["data_inicio_ciclo"]
    else:
        return pd.DataFrame()
    rename = {"data_churn_snapshot": "data_churn_snapshot"}
    for col in ["created_at", "data_inicio_ciclo", "cliente_desde", "data_descongelamento"]:
        if col in df.columns:
            df[col] = _parse_dt(df[col])
    return df


def migration_batch_flag(created: pd.Series) -> pd.Series:
    if created is None or created.isna().all():
        return pd.Series(False, index=created.index if created is not None else [])
    return created.dt.year.eq(2026) & created.dt.month.eq(2)


def attach_tenure_features(df: pd.DataFrame, data_dir: Path, first_meeting_asof: pd.Timestamp | None = None) -> tuple[pd.DataFrame, dict]:
    """Variáveis de permanência point-in-time; evita created_at como contrato quando migração."""
    out = df.copy()
    snap = load_tenure_sources(data_dir)
    audit = {
        "fontes": [],
        "regras": [
            "entrada_contratual = data_inicio_ciclo ou cliente_desde (não created_at se lote migração)",
            "tempo_ciclo_atual = ref - data_inicio_ciclo",
            "tempo_relacionamento = ref - entrada_contratual",
            "cobertura_reunioes_efetiva = ref >= first_meeting_coverage (proxy por cliente com reunião)",
        ],
    }
    if snap.empty:
        audit["aviso"] = "Snapshot cadastral ausente — permanência limitada ao dataset validado."
        out["dias_relacionamento"] = pd.NA
        out["dias_ciclo_atual"] = pd.NA
        out["entrada_contratual_confiavel"] = False
        return out, audit

    audit["fontes"] = list(snap.columns)
    merged = out.merge(snap, on="cliente_ref", how="left", suffixes=("", "_cad"))

    mig = migration_batch_flag(merged["created_at"]) if "created_at" in merged.columns else pd.Series(False, index=merged.index)
    entrada = merged["data_inicio_ciclo"].fillna(merged.get("cliente_desde"))
    only_created = entrada.isna()
    entrada = entrada.fillna(merged["created_at"] if "created_at" in merged.columns else pd.NaT)
    merged["entrada_contratual"] = entrada
    merged["entrada_contratual_confiavel"] = entrada.notna() & ~(only_created & mig)

    ref = merged["ref_dt"]
    merged["dias_relacionamento"] = (ref - merged["entrada_contratual"]).dt.days
    merged["dias_ciclo_atual"] = (ref - merged["data_inicio_ciclo"]).dt.days

    descongel = merged.get("data_descongelamento")
    if descongel is not None:
        valid = descongel.notna() & (descongel <= ref)
        merged["dias_desde_reativacao"] = (ref - descongel).dt.days.where(valid)
    else:
        merged["dias_desde_reativacao"] = pd.NA

    # Cobertura efetiva de reuniões: proxy — primeira reunião do cliente até ref
    if "reunioes_acumuladas" in merged.columns:
        merged["tem_cobertura_reunioes"] = merged["reunioes_acumuladas"].fillna(0) > 0
    else:
        merged["tem_cobertura_reunioes"] = False

    merged["confiabilidade_entrada"] = merged.apply(_tenure_confidence, axis=1)

    new_cols = [
        "dias_relacionamento",
        "dias_ciclo_atual",
        "dias_desde_reativacao",
        "entrada_contratual_confiavel",
        "tem_cobertura_reunioes",
        "confiabilidade_entrada",
        "entrada_contratual",
    ]
    audit["share_migracao_created_2026_02"] = float(mig.mean()) if len(mig) else None
    audit["share_entrada_confiavel"] = float(merged["entrada_contratual_confiavel"].mean())
    base = df.columns.tolist()
    return merged[base + [c for c in new_cols if c in merged.columns]], audit


def _tenure_confidence(row: pd.Series) -> str:
    if not row.get("entrada_contratual_confiavel"):
        return "baixa_migracao_ou_ausente"
    if pd.isna(row.get("dias_relacionamento")):
        return "indisponivel"
    if float(row.get("dias_relacionamento") or 0) < 0:
        return "inconsistente"
    return "alta"
