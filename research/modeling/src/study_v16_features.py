"""Pacotes incrementais de features — Etapa 16."""
from __future__ import annotations

from src.models import FEATURE_SETS
from src.study_v2_features import CATEGORICAL_PIT, NUMERIC_PIT, enrich_frame, feature_catalog, logistic_v2_columns


def feature_packs(df) -> dict[str, dict]:
    """Grupos incrementais sobre baseline Modelo E."""
    e_num = list(FEATURE_SETS["E"]["numeric"])
    e_cat = list(FEATURE_SETS["E"]["categorical"])
    phase_num = ["em_implantacao", "meses_desde_primeira_obs"]
    temporal_num = ["recencia_ausente", "sem_reunioes_estrutural"]
    mec_cat = ["cobertura_mecanismos", "cobertura_engajamento", "confiabilidade_reconstrucao"]
    nps_num = [c for c in ["nps_historico", "nps_ultimo", "dias_desde_nps"] if c in df.columns]
    support_num = [c for c in ["demandas_abertas", "tarefas_pendentes", "eventos_suporte_90d"] if c in df.columns]

    def pack(pid: str, label: str, numeric: list[str], categorical: list[str]) -> dict:
        numeric_u = [c for c in numeric if c in df.columns]
        cat_u = [c for c in categorical if c in df.columns]
        return {"id": pid, "label": label, "numeric": numeric_u, "categorical": cat_u}

    baseline = pack("baseline_original", "Baseline Modelo E", e_num, e_cat)
    p_phase = pack("baseline_plus_phase", "Baseline + fase/tempo painel", e_num + phase_num, e_cat)
    p_temp = pack(
        "baseline_plus_temporal",
        "Baseline + comportamento temporal",
        e_num + phase_num + temporal_num,
        e_cat,
    )
    p_mec = pack(
        "baseline_plus_mechanisms",
        "Baseline + cobertura mecanismos",
        e_num + phase_num + temporal_num,
        e_cat + mec_cat,
    )
    p_nps = pack(
        "baseline_plus_nps",
        "Baseline + NPS (se export)",
        e_num + phase_num + temporal_num + nps_num,
        e_cat + mec_cat,
    )
    p_sup = pack(
        "baseline_plus_support",
        "Baseline + suporte (se export)",
        e_num + phase_num + temporal_num + support_num,
        e_cat + mec_cat,
    )
    v2_num, v2_cat = logistic_v2_columns()
    p_full = pack("full_audited", "Combinação completa auditada (V2)", v2_num, v2_cat)

    return {
        baseline["id"]: baseline,
        p_phase["id"]: p_phase,
        p_temp["id"]: p_temp,
        p_mec["id"]: p_mec,
        p_nps["id"]: p_nps,
        p_sup["id"]: p_sup,
        p_full["id"]: p_full,
    }


def catalog_for_frame(df) -> list[dict]:
    enriched = enrich_frame(df, "cliente_ref")
    return feature_catalog(enriched)
