import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "predictive_study_v17.json"


class TestStudyV17(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not OUT.exists():
            raise unittest.SkipTest("predictive_study_v17.json ausente — rode npm run model:study-v17")
        cls.payload = json.loads(OUT.read_text(encoding="utf-8"))

    def test_status_ok(self):
        self.assertEqual(self.payload.get("status"), "ok")

    def test_experiments_include_E_and_prevalence(self):
        ids = {e["id"] for e in self.payload.get("experiments") or []}
        self.assertIn("model_E_balanced", ids)
        self.assertIn("baseline_prevalence", ids)
        self.assertIn("hgb_best_pack", ids)

    def test_conclusion_abc(self):
        c = self.payload.get("conclusion_abc") or {}
        self.assertIn(c.get("letter"), ("A", "B", "C"))
        self.assertTrue(c.get("summary"))

    def test_no_operational_flag(self):
        self.assertFalse(self.payload.get("operational_limits", {}).get("operational_deployment"))

    def test_risk_groups_on_E(self):
        e = next(x for x in self.payload["experiments"] if x["id"] == "model_E_balanced")
        groups = e["test"].get("risk_groups") or []
        self.assertGreaterEqual(len(groups), 3)


class TestCalibrationModule(unittest.TestCase):
    def test_risk_groups_monotonic_bins(self):
        import sys

        sys.path.insert(0, str(ROOT))
        from src.calibration import risk_groups
        import numpy as np

        y = np.array([0, 0, 0, 1, 1, 1, 0, 1, 0, 1] * 20)
        p = np.linspace(0.05, 0.95, len(y))
        g = risk_groups(y, p, n_groups=5)
        self.assertEqual(len(g), 5)
        self.assertLess(g[0]["pred_mean"], g[-1]["pred_mean"])


if __name__ == "__main__":
    unittest.main()
