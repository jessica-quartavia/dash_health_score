"""Regressões — Estudo Preditivo 2.0."""
from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "predictive_study_v2.json"


class TestStudyV2Artifact(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not OUT.exists():
            raise unittest.SkipTest("predictive_study_v2.json ausente — rode npm run model:study-v2")

    def test_status_ok(self):
        data = json.loads(OUT.read_text(encoding="utf-8"))
        self.assertEqual(data.get("status"), "ok")

    def test_no_leakage_in_feature_names(self):
        data = json.loads(OUT.read_text(encoding="utf-8"))
        forbidden = {"desfecho_churn_90d", "desfecho_churn_180d", "data_observacao_asof"}
        for c in data.get("candidates") or []:
            feats = set(c.get("features_numeric") or []) | set(c.get("features_categorical") or [])
            self.assertFalse(forbidden & feats, msg=c.get("id"))

    def test_metrics_in_valid_range(self):
        data = json.loads(OUT.read_text(encoding="utf-8"))
        for c in data.get("candidates") or []:
            auc = c.get("test", {}).get("roc_auc")
            if auc is not None:
                self.assertGreaterEqual(auc, 0.0)
                self.assertLessEqual(auc, 1.0)

    def test_audit_rate_matches_pre_audit(self):
        data = json.loads(OUT.read_text(encoding="utf-8"))
        pre = data.get("audit", {}).get("pre_audit_summary") or {}
        pos = pre.get("positive_rows_90d")
        neg = pre.get("negative_rows_90d")
        rate = data.get("audit", {}).get("rate_by_observation")
        if pos and neg and rate is not None:
            self.assertAlmostEqual(rate, pos / (pos + neg), places=3)


if __name__ == "__main__":
    unittest.main()
