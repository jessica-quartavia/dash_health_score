import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { finiteNumber } from "../frontend/display-format.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const STUDY_PATH = join(ROOT, "research", "modeling", "output", "predictive_study_v2.json");
const MANIFEST_PATH = join(ROOT, "research", "modeling", "output", "predictive_study_v2_manifest.json");

export function loadPredictiveStudyV2() {
  if (!existsSync(STUDY_PATH)) {
    return { ok: false, status: "missing", error: "predictive_study_v2.json ausente — execute npm run model:study-v2" };
  }
  try {
    const study = JSON.parse(readFileSync(STUDY_PATH, "utf8"));
    if (study.status !== "ok") {
      return { ok: false, status: study.status || "failed", error: study.error || "Processamento incompleto", study };
    }
    const manifest = existsSync(MANIFEST_PATH)
      ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
      : study.manifest;
    return { ok: true, study: { ...study, manifest }, manifest };
  } catch (err) {
    return { ok: false, status: "parse_error", error: err.message };
  }
}

export function assertStudyV2Contract(study) {
  const issues = [];
  if (!study?.candidates?.length) issues.push("sem candidatos");
  for (const c of study.candidates || []) {
    const auc = finiteNumber(c.test?.roc_auc);
    if (auc != null && (auc > 1 || auc < 0)) issues.push(`AUC inválida ${c.id}`);
  }
  return issues;
}
