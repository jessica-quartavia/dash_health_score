import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PATH = join(ROOT, "research", "modeling", "output", "predictive_study_v16.json");

export function loadPredictiveStudyV16() {
  if (!existsSync(PATH)) {
    return { ok: false, error: "predictive_study_v16.json ausente — npm run model:study-v16" };
  }
  try {
    const study = JSON.parse(readFileSync(PATH, "utf8"));
    if (study.status !== "ok") return { ok: false, error: study.error || "failed", study };
    return { ok: true, study };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
