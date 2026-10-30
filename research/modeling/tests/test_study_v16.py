import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "predictive_study_v16.json"


class TestStudyV16(unittest.TestCase):
    def test_artifact_when_present(self):
        if not OUT.exists():
            self.skipTest("predictive_study_v16.json ausente — rode npm run model:study-v16")
        data = json.loads(OUT.read_text(encoding="utf-8"))
        self.assertEqual(data.get("status"), "ok")
        tv = data.get("temporal_validation") or {}
        self.assertNotIn("2026-06", tv.get("test_months") or [])
        self.assertEqual(tv.get("june_2026_role"), "reference_only_not_used_for_selection")
        self.assertTrue(data.get("models_compared"))
        self.assertTrue(data.get("manifest", {}).get("dataset_hash_sha256_16"))

    def test_no_individual_probabilities_field(self):
        if not OUT.exists():
            self.skipTest("artifact ausente")
        raw = OUT.read_text(encoding="utf-8")
        self.assertNotIn("client_probabilities", raw)
        self.assertNotIn("churn_probability_by_client", raw)


if __name__ == "__main__":
    unittest.main()
