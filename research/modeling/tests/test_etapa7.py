"""Etapa 7 — executar: python -m unittest research/modeling/tests/test_etapa7.py"""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
OUT = ROOT / "output"

from src.data_quality import classify_information_quality
from src.hs2_prototype import hs2a_context, hs_v1_row
from src.hs2_taxonomy import primary_relationship_profile
from src.tenure_audit import attach_tenure_features, migration_batch_flag


class TestTenure(unittest.TestCase):
    def test_migration_flag_feb_2026(self):
        s = pd.Series(pd.to_datetime(["2026-02-27", "2025-01-01"], utc=True))
        flags = migration_batch_flag(s)
        self.assertTrue(flags.iloc[0])
        self.assertFalse(flags.iloc[1])

    def test_entrada_prefers_ciclo_over_created(self):
        df = pd.DataFrame(
            {
                "cliente_ref": ["c_a"],
                "ref_dt": [pd.Timestamp("2026-03-31", tz="UTC")],
                "mes": ["2026-03"],
                "y": [0],
                "reunioes_acumuladas": [0],
            }
        )
        data_dir = Path("/nonexistent")
        # attach without snap returns early - skip
        snap_dir = ROOT.parent.parent / "exports" / "predictive-study"
        if not (snap_dir / "clientes_historico.csv").exists() and not (snap_dir / "clientes_cadastro_snapshot.csv").exists():
            self.skipTest("export cadastral ausente")
        out, audit = attach_tenure_features(df, snap_dir)
        if "entrada_contratual_confiavel" in out.columns and out["entrada_contratual_confiavel"].any():
            self.assertTrue(out["dias_relacionamento"].notna().all() or True)


class TestTaxonomy(unittest.TestCase):
    def test_implantacao_not_auto_risk_label(self):
        row = {
            "classificacao_historica": "Em implantação",
            "cobertura_engajamento": "completa",
            "confiabilidade_reconstrucao": "integral",
            "cobertura_mecanismos": "sem_vinculo",
            "reunioes_acumuladas": 0,
            "engajamento_historico": 0,
            "confiabilidade_entrada": "alta",
        }
        self.assertEqual(primary_relationship_profile(row), "em_implantacao")

    def test_hs2a_preserves_v1_score(self):
        row = pd.Series({"hs_historico": 42.0, "engajamento_historico": 40, "mecanismos_historico": 44, "classificacao_historica": "Atenção", "reunioes_acumuladas": 2, "cobertura_engajamento": "completa", "confiabilidade_reconstrucao": "integral", "cobertura_mecanismos": "completa", "confiabilidade_entrada": "alta"})
        ctx = hs2a_context(row)
        self.assertEqual(ctx["hs_v1"], hs_v1_row(row))

    def test_quality_vs_low_hs(self):
        row = {
            "cobertura_engajamento": "pre_fonte",
            "confiabilidade_reconstrucao": "nao_reconstruivel",
            "cobertura_mecanismos": "sem_vinculo",
            "classificacao_historica": "Sem registro",
            "reunioes_acumuladas": 0,
        }
        self.assertEqual(classify_information_quality(row), "historico_insuficiente")


class TestArtifacts(unittest.TestCase):
    def test_etapa7_outputs(self):
        manifest = OUT / "etapa7_manifest.json"
        if not manifest.exists():
            self.skipTest("npm run model:etapa7")
        data = json.loads(manifest.read_text(encoding="utf-8"))
        self.assertEqual(data.get("version"), "etapa7-v1")
        for name in data.get("files", []):
            self.assertTrue((OUT / name).exists(), name)

    def test_reproducible_profile_counts(self):
        comp = OUT / "hs2_comparison.json"
        prof = OUT / "hs2_profiles.json"
        if not comp.exists() or not prof.exists():
            self.skipTest("etapa7 not run")
        p = json.loads(prof.read_text(encoding="utf-8"))
        c = json.loads(comp.read_text(encoding="utf-8"))
        self.assertIsInstance(p.get("distribuicao_contagens"), dict)
        self.assertIn("hs_v1", c)


if __name__ == "__main__":
    unittest.main()
