"""Testes Etapa 5 — executar: python -m unittest research/modeling/tests/test_robustness.py"""
from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output"


class TestRobustnessArtifacts(unittest.TestCase):
    def test_robustness_json_when_present(self):
        path = OUT / "robustness_results.json"
        if not path.exists():
            self.skipTest("rode npm run model:robustness")
        data = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(data.get("version"), "etapa5-v1")
        self.assertIn("hs_bands", data)
        self.assertIn("bands", data["hs_bands"])
        self.assertTrue(len(data["hs_bands"]["bands"]) >= 3)
        self.assertIn("recencia", data)
        self.assertIn("feature_matrix", data)

    def test_etapa4_preserved(self):
        if not (OUT / "modeling_results_etapa4.json").exists():
            self.skipTest("etapa4 snapshot ausente")
        data = json.loads((OUT / "modeling_results_etapa4.json").read_text(encoding="utf-8"))
        self.assertEqual(data.get("status"), "ok")

    def test_no_outcome_in_feature_matrix(self):
        path = OUT / "robustness_results.json"
        if not path.exists():
            self.skipTest("robustness ausente")
        fm = json.loads(path.read_text(encoding="utf-8"))["feature_matrix"]
        names = [r["name"] for r in fm if r.get("type") == "outcome"]
        self.assertEqual(names, ["desfecho_churn_90d"])
        for r in fm:
            if r["name"] != "desfecho_churn_90d" and r.get("type") != "method":
                self.assertNotIn("outcome", r.get("experiments", []))


if __name__ == "__main__":
    unittest.main()
