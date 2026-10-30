#!/usr/bin/env node
import { loadResearchArtifacts } from "../lib/research/artifact-loader.mjs";
import { buildHsWeightStudy, renderHsWeightStudyMarkdown } from "../lib/research/hs-weight-study.mjs";
import { writeJson, readJsonIfExists } from "../lib/research/study-io.mjs";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = loadResearchArtifacts();
const robustness = readJsonIfExists("research/modeling/output/robustness_results.json").data;

const study = buildHsWeightStudy({
  modeling: bundle.data?.modelingResults,
  robustness,
  readiness: bundle.data?.predictiveReadiness,
});

writeJson("research/modeling/output/hs_weight_study.json", study);
writeFileSync(join(ROOT, "docs/HS_WEIGHT_STUDY.md"), renderHsWeightStudyMarkdown(study), "utf8");
console.log("[hs-weight-study]", study.recommendation.decision, "→ docs/HS_WEIGHT_STUDY.md");
