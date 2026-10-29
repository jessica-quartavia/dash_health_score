import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.data_quality import classify_information_quality
from src.hs_profiles import profile_tags
OUT = ROOT / "output"


class TestEtapa6Classifications(unittest.TestCase):
    def test_quality_implantacao_sem_reuniao_nao_insuficiente(self):
        row = {
            "cobertura_engajamento": "completa",
            "confiabilidade_reconstrucao": "integral",
            "cobertura_mecanismos": "completa",
            "classificacao_historica": "Em implantação",
            "reunioes_acumuladas": 0,
        }
        self.assertEqual(classify_information_quality(row), "alta_confiabilidade")

    def test_quality_pre_fonte_insuficiente(self):
        row = {
            "cobertura_engajamento": "pre_fonte",
            "confiabilidade_reconstrucao": "nao_reconstruivel",
            "cobertura_mecanismos": "sem_vinculo",
            "classificacao_historica": "Sem registro",
            "reunioes_acumuladas": 0,
        }
        self.assertEqual(classify_information_quality(row), "historico_insuficiente")

    def test_profile_tags_multi(self):
        row = {
            "classificacao_historica": "Em implantação",
            "reunioes_acumuladas": 0,
            "engajamento_historico": 5,
            "mecanismos_historico": 0,
            "mecanismos_implantados": 0,
            "cobertura_engajamento": "completa",
            "cobertura_mecanismos": "sem_vinculo",
            "confiabilidade_reconstrucao": "integral",
        }
        tags = profile_tags(row)
        self.assertIn("em_implantacao", tags)
        self.assertIn("sem_reunioes_observadas", tags)
        self.assertIn("historico_inconsistente", tags)


class TestEtapa6Artifacts(unittest.TestCase):
    def test_output_files_when_present(self):
        required = [
            "hs_profiles_analysis.json",
            "hs_data_quality.json",
            "early_churn_audit.json",
            "hs_sensitivity_results.json",
            "etapa6_manifest.json",
        ]
        if not (OUT / "etapa6_manifest.json").exists():
            self.skipTest("Run npm run model:etapa6 first")
        for name in required:
            path = OUT / name
            self.assertTrue(path.exists(), name)
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertIn("version", data)


if __name__ == "__main__":
    unittest.main()
