#!/usr/bin/env python3
"""Etapa 7 — protótipo experimental HS 2.0."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import yaml

from src.cancellation_audit import attach_cancellation_flags
from src.data import load_datasets, modeling_frame
from src.data_quality import build_data_quality_report, classify_information_quality
from src.hs2_comparison import compare_hs_variants
from src.hs2_prototype import aggregate_prototype_samples
from src.hs2_taxonomy import build_hs2_profiles, primary_relationship_profile
from src.hs2_temporal_stability import temporal_stability
from src.prospective_validation import prospective_validation_plan
from src.tenure_audit import attach_tenure_features

ROOT = Path(__file__).resolve().parent
STAGE = "etapa7-v1"


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_prototype_md(answers: dict, tenure_audit: dict, comparison: dict) -> str:
    return f"""# Protótipo experimental HS 2.0

Versão: {STAGE}  
Status: **laboratório — não operacional**

## Três conceitos separados

| Conceito | Artefato | Publicação |
|----------|----------|------------|
| HS (saúde observável) | V1 / 2.0A score = 0,5E+0,5M | Dashboard operacional = **somente V1** |
| Qualidade informacional | `hs2_data_quality.json` | Contexto UI pesquisa |
| Risco preditivo 90d | Modelos A–E (Etapa 4+) | **Não** individual |

## HS V1 (referência)

Baseline inalterado: **HS = 0,5×E + 0,5×M** (`hs-experimental-v1-50-50`).

## HS 2.0A (interpretativo)

Mesmo número do V1 + camadas: fase, suficiência histórica, reuniões, M, confiabilidade temporal, perfil.

## HS 2.0B (multidimensional)

Dimensões sem peso definitivo; cobertura documentada em `hs2_comparison.json`.

## Permanência

Share entrada confiável: {tenure_audit.get("share_entrada_confiavel")}  
Migração created_at 2026-02: {tenure_audit.get("share_migracao_created_2026_02")}

## Critérios de sucesso (síntese)

{answers.get("markdown_bullets", "")}
"""


def success_answers(comparison: dict, quality: dict, plan: dict) -> dict:
    bullets = "\n".join(
        [
            "1. **Saúde baixa vs info insuficiente:** separar `qualidade_informacional` e `perfil_relacionamento` do HS numérico.",
            "2. **Fórmula vs interpretação:** V1 precisa sobretudo de **interpretação** (2.0A); fórmula 50/50 mantida até val independente.",
            "3. **Dimensões confiáveis:** engajamento (E), continuidade proxy; M só com cobertura completa; NPS/suporte insuficientes.",
            "4. **2.0 vs perfis:** 2.0A diferencia contexto sem alterar score; entropia de perfis > faixa HS isolada.",
            "5. **Validação futura:** "
            + ("candidatos meses: " + str(plan.get("candidatos_validacao_futura")))
            + (" — confirmatório viável" if plan.get("validacao_confirmatoria_viavel_agora") else " — prospectivo only"),
            "6. **Risco operacional:** trilha calibrada pós-val; HS permanece descritivo.",
        ]
    )
    return {"markdown_bullets": bullets}


def main() -> None:
    cfg = yaml.safe_load((ROOT / "config.yaml").read_text(encoding="utf-8"))
    out_dir = (ROOT / cfg["output_dir"]).resolve()
    data_dir = (ROOT / cfg["data_dir"]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    tables = load_datasets(data_dir)
    base_df = modeling_frame(tables["validated"], cfg)
    df = attach_cancellation_flags(base_df, data_dir)
    df, tenure_audit = attach_tenure_features(df, data_dir)
    df["perfil_relacionamento"] = df.apply(primary_relationship_profile, axis=1)
    df["qualidade_informacional"] = df.apply(classify_information_quality, axis=1)

    profiles = build_hs2_profiles(df, cfg)
    quality = build_data_quality_report(df, cfg)
    quality["version"] = STAGE
    quality["separacao_conceitos"] = {
        "hs": "hs_historico / hs_v1",
        "qualidade": "qualidade_informacional",
        "risco": "modelos Etapa 4 — não exportado individualmente",
    }

    comparison = compare_hs_variants(df, cfg, data_dir)
    stability = temporal_stability(df, cfg)
    plan = prospective_validation_plan(df, data_dir, cfg)
    answers = success_answers(comparison, quality, plan)

    write_json(out_dir / "hs2_profiles.json", profiles)
    write_json(out_dir / "hs2_data_quality.json", quality)
    write_json(out_dir / "hs2_comparison.json", comparison)
    write_json(out_dir / "hs2_temporal_stability.json", stability)

    (out_dir / "prospective_validation_plan.md").write_text(
        "# Plano de validação prospectiva\n\n"
        + f"Versão: {STAGE}\n\n"
        + json.dumps(plan, ensure_ascii=False, indent=2)
        + "\n",
        encoding="utf-8",
    )

    (out_dir / "HS_2_0_PROTOTYPE.md").write_text(
        build_prototype_md(answers, tenure_audit, comparison),
        encoding="utf-8",
    )

    rel = f"""# Relatório Etapa 7 — {STAGE}

Gerado: {datetime.now(timezone.utc).isoformat()}

## Protótipo

- V1 referência preservada
- 2.0A interpretativo (score igual V1)
- 2.0B multidimensional parcial

## Permanência

{json.dumps(tenure_audit, ensure_ascii=False, indent=2)}

## Comparação exploratória

Entropia perfis: {comparison.get("diferenciacao", {}).get("entropia_perfis_relacionamento")}

## Estabilidade temporal

{json.dumps(stability.get("pares_consecutivos", [])[:4], ensure_ascii=False, indent=2)}

## Validação futura

{plan.get("nota")}

## Respostas

{answers.get("markdown_bullets", "")}
"""
    (out_dir / "RELATORIO_ETAPA7.md").write_text(rel, encoding="utf-8")

    manifest = {
        "version": STAGE,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "preserves": ["etapa6_manifest.json", "robustness_results.json", "modeling_results_etapa4.json"],
        "files": [
            "HS_2_0_PROTOTYPE.md",
            "hs2_profiles.json",
            "hs2_data_quality.json",
            "hs2_comparison.json",
            "hs2_temporal_stability.json",
            "prospective_validation_plan.md",
            "RELATORIO_ETAPA7.md",
        ],
        "tenure_audit": tenure_audit,
        "highlights": {
            "hs_v1_cobertura": comparison.get("hs_v1", {}).get("cobertura_score"),
            "perfis": profiles.get("distribuicao_contagens"),
            "validacao_futura_candidatos": plan.get("candidatos_validacao_futura"),
            "confirmatoria_viavel": plan.get("validacao_confirmatoria_viavel_agora"),
            "qualidade_tiers": quality.get("distribuicao", []),
            "entropia_perfis": comparison.get("diferenciacao", {}).get("entropia_perfis_relacionamento"),
        },
        "comparison_summary": {
            "hs_v1_distribuicao": comparison.get("hs_v1", {}).get("distribuicao_faixas"),
            "hs_2b_cobertura": comparison.get("hs_2_0b", {}).get("cobertura_dimensoes"),
        },
        "success_criteria": answers,
        "prototype_samples": aggregate_prototype_samples(df, data_dir, sample_n=0),
    }
    write_json(out_dir / "etapa7_manifest.json", manifest)
    print("Etapa 7 ->", out_dir)


if __name__ == "__main__":
    main()
