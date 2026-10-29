from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from src.data import load_csv
from src.data_quality import classify_information_quality
from src.hs2_taxonomy import primary_relationship_profile


def hs_v1_row(row: pd.Series) -> float | None:
    return row.get("hs_historico")


def hs2a_context(row: pd.Series) -> dict:
    """HS 2.0A: mesmo score V1 + metadados interpretativos (não alteram pontuação)."""
    cls = str(row.get("classificacao_historica") or "")
    reun = float(row.get("reunioes_acumuladas") or 0)
    return {
        "hs_v1": hs_v1_row(row),
        "formula": "0.5*E+0.5*M (inalterada)",
        "fase_relacionamento": "implantacao" if cls == "Em implantação" else "pos_implantacao",
        "suficiencia_historica": _historical_sufficiency(row),
        "disponibilidade_reunioes": "nenhuma_observada" if reun == 0 else "com_reunioes",
        "cobertura_mecanismos": str(row.get("cobertura_mecanismos") or ""),
        "confiabilidade_temporal": str(row.get("confiabilidade_reconstrucao") or ""),
        "qualidade_informacional": classify_information_quality(row),
        "perfil_relacionamento": primary_relationship_profile(row),
    }


def _historical_sufficiency(row: pd.Series) -> str:
    cov = str(row.get("cobertura_engajamento") or "")
    reun = float(row.get("reunioes_acumuladas") or 0)
    if cov == "pre_fonte":
        return "pre_cobertura_fonte"
    if reun < 2 and str(row.get("classificacao_historica") or "") != "Em implantação":
        return "historico_curto"
    return "adequada"


def _load_nps_coverage(data_dir: Path) -> dict:
    path = data_dir / "nps_historico.csv"
    if not path.exists():
        return {"disponivel": False, "linhas": 0}
    df = load_csv(path)
    return {"disponivel": True, "linhas": len(df), "clientes": int(df["cliente_ref"].nunique()) if "cliente_ref" in df.columns else None}


def hs2b_dimensions(row: pd.Series, nps_cov: dict) -> dict:
    """Dimensões experimentais — sem peso agregado definitivo."""
    e = row.get("engajamento_historico")
    m = row.get("mecanismos_historico")
    dims = {
        "engajamento": {"score": e, "cobertura": str(row.get("cobertura_engajamento") or ""), "confiavel": pd.notna(e)},
        "implementacao_mecanismos": {
            "score": m,
            "cobertura": str(row.get("cobertura_mecanismos") or ""),
            "confiavel": str(row.get("cobertura_mecanismos") or "") == "completa",
        },
        "continuidade_relacionamento": {
            "proxy_score": _continuity_proxy(row),
            "dias_relacionamento": row.get("dias_relacionamento"),
            "confiavel": bool(row.get("entrada_contratual_confiavel")),
        },
        "satisfacao": {"score": None, "cobertura": "nps_historico" if nps_cov.get("disponivel") else "indisponivel", "confiavel": False},
        "suporte": {"score": None, "cobertura": "nao_auditado_etapa7", "confiavel": False},
        "evolucao_temporal": {
            "proxy_score": _momentum_proxy(row),
            "confiavel": float(row.get("reunioes_90d") or 0) > 0 or float(row.get("reunioes_30d") or 0) > 0,
        },
    }
    dims["dimensoes_confiaveis"] = [k for k, v in dims.items() if isinstance(v, dict) and v.get("confiavel")]
    dims["nota"] = "Sem composição ponderada — estudo de cobertura e redundância."
    return dims


def _continuity_proxy(row: pd.Series) -> float | None:
    freq = row.get("freq_media_mes")
    reun = float(row.get("reunioes_acumuladas") or 0)
    if pd.isna(freq) and reun == 0:
        return None
    if pd.notna(freq):
        return float(min(100, max(0, float(freq) * 25)))
    return float(min(100, reun * 10))


def _momentum_proxy(row: pd.Series) -> float | None:
    r30 = float(row.get("reunioes_30d") or 0)
    r90 = float(row.get("reunioes_90d") or 0)
    if r30 == 0 and r90 == 0:
        return None
    return float(min(100, r30 * 30 + r90 * 10))


def aggregate_prototype_samples(df: pd.DataFrame, data_dir: Path, sample_n: int = 5) -> dict:
    nps = _load_nps_coverage(data_dir)
    examples = []
    for _, row in df.sample(min(sample_n, len(df)), random_state=42).iterrows():
        examples.append({"hs2a": hs2a_context(row), "hs2b_dims": hs2b_dimensions(row, nps)})
    return {"nps_export": nps, "exemplos_estrutura": examples}
