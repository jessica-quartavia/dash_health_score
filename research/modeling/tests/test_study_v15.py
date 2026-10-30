"""Etapa 15 — regressões."""
from __future__ import annotations

import json
import unittest
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "output" / "predictive_study_v15.json"


class TestStudyV15(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not OUT.exists():
            raise unittest.SkipTest("run npm run model:study-v15")

    def test_fair_comparison_present(self):
        data = json.loads(OUT.read_text(encoding="utf-8"))
        fair = data["fair_comparison"]
        self.assertTrue(fair["protocol"]["same_temporal_split"])
        self.assertIn("2026-06", fair["protocol"]["test_months"])

    def test_paired_ci(self):
        data = json.loads(OUT.read_text(encoding="utf-8"))
        p = data["fair_comparison"]["paired_v2_minus_E_auc"]
        self.assertIsNotNone(p.get("ci_low"))
        self.assertIsNotNone(p.get("ci_high"))

    def test_diagnosis_section(self):
        data = json.loads(OUT.read_text(encoding="utf-8"))
        self.assertIn("bullets", data["diagnosis"])


if __name__ == "__main__":
    unittest.main()
