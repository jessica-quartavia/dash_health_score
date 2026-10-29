#!/usr/bin/env python3
"""Etapa 6 — qualidade dos indicadores e preparação HS 2.0."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import yaml

from src.cancellation_audit import (
    attach_cancellation_flags,
    audit_cancellation_influence,
    audit_early_churn_timing,
    audit_etapa5_followup,
)
from src.data import load_datasets, modeling_frame
from src.data_quality import build_data_quality_report
from src.hs_profiles import analyze_profiles
from src.hs_sensitivity_etapa6 import run_hs_sensitivity
from src.implantation_audit import audit_implantation_churn

ROOT = Path(__file__).resolve().parent
STAGE = "etapa6-v1"


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_hs_2_0_spec(answers: dict) -> str:
    return f"""# Especificação experimental — Health Score 2.0

Versão: {STAGE}  
Status: **pesquisa — não operacional**

## Alternativa A — HS atual aprimorado

- Manter E e M (50/50) até validação independente de pesos.
- Exibir **perfis interpretativos** e **qualidade informacional** separados do score.
- Tratar faixa 0–20 como heterogênea (implantação, sem observação, M=0).
- Melhorar trilha histórica de mecanismos antes de uso operacional.

## Alternativa B — HS multidimensional

Dimensões candidatas (somente com cobertura aceitável):

| Dimensão | Cobertura atual | Nota |
|----------|-----------------|------|
| Engajamento (reuniões) | Alta pós-cobertura fonte | Base E atual |
| Mecanismos | Parcial (sem_vinculo frequente) | Exige status histórico |
| Satisfação (NPS) | Baixa na carteira | Não forçar peso agora |
| Trajetória / permanência | Proxy por reuniões acumuladas | Descritivo |
| Suporte | Não auditado nesta etapa | Requer fonte dedicada |

**Sem fórmula fechada** nesta etapa — matriz de dimensões para desenho futuro.

## Alternativa C — HS preditivo (90d)

Indicador = probabilidade calibrada de churn em 90d, **não publicada** nesta fase.

| Requisito | Estado |
|-----------|--------|
| População elegível 90d | Disponível |
| Split temporal purgado | Fev→Jun/2026 documentado |
| Val independente para calibração | **Ausente** |
| Explicabilidade (SHAP/perfil) | Planejado pós-calibração |
| Monitoramento drift | Não implementado |
| Critério de publicação | Val confirmatório + política de privacidade |

Variáveis candidatas: E, contagem reuniões, recência+flag ausência, M com máscara de confiança, programa (cuidado snapshot).

## Respostas síntese (Etapa 6)

{answers.get("markdown_bullets", "")}

## Rastreabilidade

- Etapa 4: `modeling_results_etapa4.json`
- Etapa 5: `robustness_results.json` (etapa5-v1)
- Etapa 6: artefatos `hs_*` e `early_churn_audit.json`
"""


def build_relatorio(
    etapa5_audit: dict,
    cancel: dict,
    timing: dict,
    impl: dict,
    profiles: dict,
    quality: dict,
    sensitivity: dict,
    answers: dict,
) -> str:
    return f"""# Relatório — Etapa 6 ({STAGE})

Gerado: {datetime.now(timezone.utc).isoformat()}

## 1. Auditoria Etapa 5

### Faixa HS 0–20
- Observações: {etapa5_audit.get("hs_0_20", {}).get("observacoes")}
- Taxa churn (IC): ver JSON `early_churn_audit.json` → `etapa5_followup`
- Sem reunião: {etapa5_audit.get("hs_0_20", {}).get("sem_reuniao_share", 0):.1%}
- Em implantação: {etapa5_audit.get("hs_0_20", {}).get("em_implantacao_share", 0):.1%}

### Implantação (~46% na Etapa 5)
- Observações: {impl.get("observacoes_implantacao")}
- Share created_at fev/2026: {impl.get("created_at_2026_02_share")}

## 2. Cancelamento já conhecido na referência

- Flags solicitação formal: {cancel.get("flags", {})}
- Positivos com solicitação prévia: {cancel.get("positivos_com_solicitacao_previa")}

## 3. Timing pós-referência (positivos)

{json.dumps(timing, ensure_ascii=False, indent=2)}

## 4. Perfis interpretativos

{len(profiles.get("perfis", []))} perfis documentados em `hs_profiles_analysis.json`.

## 5. Qualidade informacional

Ver `hs_data_quality.json`.

## 6. Sensibilidade (exploratória)

Ver `hs_sensitivity_results.json`.

## 7. Critérios de sucesso

{answers.get("text_block", "")}
"""


def success_answers(cancel: dict, quality: dict, etapa5: dict, impl: dict) -> dict:
    pos_prev = cancel.get("positivos_com_solicitacao_previa", {})
    bullets = "\n".join(
        [
            f"1. HS baixo mistura **comportamento desfavorável** e **limitação de observação** (sem reunião/M=0/implantação).",
            f"2. Implantação: churn elevado combina **saída precoce real**, **scores baixos por construção** e possível **migração created_at 2026**.",
            f"3. Cancelamentos já solicitados: ~{pos_prev.get('share_dos_positivos', 0):.1%} dos positivos com solicitação formal antes da ref.",
            "4. E histórico é mais confiável que M quando `cobertura_mecanismos=completa` e reconstrução integral.",
            "5. HS 2.0 deve priorizar **engajamento observável**, **estado informacional** e **M com trilha temporal**; NPS só após cobertura.",
            "6. Faltam: val confirmatório, calibração, política de publicação e monitoramento antes de probabilidades individuais.",
        ]
    )
    text = bullets.replace("\n", "\n\n")
    return {"markdown_bullets": bullets, "text_block": text}


def main() -> None:
    cfg = yaml.safe_load((ROOT / "config.yaml").read_text(encoding="utf-8"))
    out_dir = (ROOT / cfg["output_dir"]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    data_dir = (ROOT / cfg["data_dir"]).resolve()

    tables = load_datasets(data_dir)
    base_df = modeling_frame(tables["validated"], cfg)
    df = attach_cancellation_flags(base_df, data_dir)

    etapa5_followup = audit_etapa5_followup(df, cfg)
    timing = audit_early_churn_timing(df, tables["churn"], cfg)
    cancel = audit_cancellation_influence(df, cfg)
    impl = audit_implantation_churn(df, tables["churn"], data_dir, cfg)
    profiles = analyze_profiles(df, cfg)
    quality = build_data_quality_report(df, cfg)
    sensitivity = run_hs_sensitivity(df, cfg)
    answers = success_answers(cancel, quality, etapa5_followup, impl)

    early = {
        "version": STAGE,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "etapa5_followup": etapa5_followup,
        "timing_pos_ref": timing,
        "cancelamento_na_referencia": cancel,
        "implantacao": impl,
    }

    write_json(out_dir / "hs_profiles_analysis.json", profiles)
    write_json(out_dir / "hs_data_quality.json", quality)
    write_json(out_dir / "early_churn_audit.json", early)
    write_json(out_dir / "hs_sensitivity_results.json", sensitivity)

    spec = build_hs_2_0_spec(answers)
    (out_dir / "HS_2_0_SPEC.md").write_text(spec, encoding="utf-8")

    rel = build_relatorio(etapa5_followup, cancel, timing, impl, profiles, quality, sensitivity, answers)
    (out_dir / "RELATORIO_ETAPA6.md").write_text(rel, encoding="utf-8")

    manifest = {
        "version": STAGE,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "preserves": ["robustness_results.json", "modeling_results_etapa4.json"],
        "files": [
            "hs_profiles_analysis.json",
            "hs_data_quality.json",
            "early_churn_audit.json",
            "hs_sensitivity_results.json",
            "HS_2_0_SPEC.md",
            "RELATORIO_ETAPA6.md",
        ],
        "success_criteria": answers,
        "highlights": {
            "solicitacao_antes_ref_obs": cancel.get("flags", {}).get("solicitacao_formal_antes_ref"),
            "positivos_com_solicitacao_previa_share": cancel.get("positivos_com_solicitacao_previa", {}).get(
                "share_dos_positivos"
            ),
            "implantacao_churn_rate": impl.get("churn_90d_ic", {}).get("rate"),
            "timing_buckets": timing.get("buckets_dias_pos_ref"),
        },
    }
    write_json(out_dir / "etapa6_manifest.json", manifest)
    print("Etapa 6 ->", out_dir)


if __name__ == "__main__":
    main()
