import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export function loadPredictiveStudyV17(root) {
  const path = join(root, "research", "modeling", "output", "predictive_study_v17.json");
  if (!existsSync(path)) {
    return { ok: false, error: "predictive_study_v17.json ausente — npm run model:study-v17" };
  }
  try {
    const data = JSON.parse(readFileSync(path, "utf8"));
    return { ok: data.status === "ok", data, error: data.status !== "ok" ? data.error : null };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
