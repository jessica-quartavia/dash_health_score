#!/usr/bin/env node
import { loadResearchArtifacts } from "../lib/research/artifact-loader.mjs";
import { assessHsFutureFeasibility } from "../lib/research/hs-future-feasibility.mjs";
import { writeJson, readJsonIfExists } from "../lib/research/study-io.mjs";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const temporalPath = join(ROOT, "research/monitoring/output/temporal_comparison_report.json");
let trend = [];
if (existsSync(temporalPath)) {
  try {
    trend = JSON.parse(readFileSync(temporalPath, "utf8")).trend || [];
  } catch { /* ignore */ }
}

const bundle = loadResearchArtifacts();
const report = assessHsFutureFeasibility({
  snapshotTrend: trend,
  freezes: [],
  modeling: bundle.data?.modelingResults,
});

writeJson("research/modeling/output/hs_future_feasibility.json", report);
console.log("[hs-future-feasibility]", report.feasible ? "exploratory_ok" : "not_ready", report.reason);
