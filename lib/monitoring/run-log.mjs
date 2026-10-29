import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { monitoringRoot } from "./storage-backend.mjs";

const MAX_RUNS = 400;

export function appendRunLog(entry) {
  const dir = join(monitoringRoot(), "runs");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "run-log.json");
  let log = { version: 1, runs: [] };
  if (existsSync(path)) {
    try {
      log = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      log = { version: 1, runs: [] };
    }
  }
  log.runs = [entry, ...(log.runs || [])].slice(0, MAX_RUNS);
  writeFileSync(path, `${JSON.stringify(log, null, 2)}\n`, "utf8");
  return entry;
}

export function listRunLogs(limit = 20) {
  const path = join(monitoringRoot(), "runs", "run-log.json");
  if (!existsSync(path)) return [];
  try {
    return (JSON.parse(readFileSync(path, "utf8")).runs || []).slice(0, limit);
  } catch {
    return [];
  }
}

export function startRunMeta({ referenceDay, scheduleMode, force }) {
  return {
    runId: `${referenceDay}_${Date.now()}`,
    referenceDay,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    scheduleMode: scheduleMode || "manual",
    force: Boolean(force),
    clientCount: null,
    snapshot: null,
    prospectiveFreeze: null,
    errors: [],
    warnings: [],
  };
}

export function finishRunMeta(meta, patch) {
  return {
    ...meta,
    ...patch,
    finishedAt: new Date().toISOString(),
  };
}
