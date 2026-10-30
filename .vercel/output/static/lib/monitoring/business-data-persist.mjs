import { createHash } from "node:crypto";
import { businessDataConfig } from "../business-data/config.mjs";
import { bdInsert, bdInsertChunks, bdPatch, bdSelect } from "../business-data/rest.mjs";
import { shouldSkipIdempotentRun } from "../business-data/reporting-filters.mjs";
import { HS2A_VERSION, OFFICIAL_FORMULA_VERSION } from "../hs2a-interpretation.mjs";
import { stableClientRef } from "./snapshot-store.mjs";
import { freezeIntegrity } from "./prospective-freeze.mjs";

export const PIPELINE_DB_VERSION = "etapa12-v1";

export function buildRunIdempotencyKey({ referenceDay, population, versionFingerprint, filtersFingerprint = "" }) {
  return `${referenceDay}|${population}|${versionFingerprint}|${filtersFingerprint}`;
}

export function rowChecksum(row) {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex").slice(0, 32);
}

function maturationDate(referenceDay, horizonDays = 90) {
  const d = new Date(`${referenceDay}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + horizonDays);
  return d.toISOString().slice(0, 10);
}

export async function findExistingRun(idempotencyKey) {
  const q = `idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=run_id,status,snapshot_rows,client_count,reference_date`;
  const rows = await bdSelect("pipeline_runs", { query: q });
  return rows?.[0] || null;
}

async function markRunFailed(runId, error, extra = {}) {
  await bdPatch("pipeline_runs", `run_id=eq.${runId}`, {
    status: "failed",
    finished_at: new Date().toISOString(),
    errors: [{ at: new Date().toISOString(), message: String(error?.message || error) }],
    ...extra,
  });
}

function verifyPersistIntegrity({
  expectedSnapshots,
  insertedSnaps,
  components,
  issuePayload,
  clientCount,
}) {
  const problems = [];
  if (insertedSnaps.length !== expectedSnapshots) {
    problems.push(`snapshots: esperado ${expectedSnapshots}, gravado ${insertedSnaps.length}`);
  }
  if (components.length !== insertedSnaps.length) {
    problems.push(`componentes: esperado ${insertedSnaps.length}, gravado ${components.length}`);
  }
  if (clientCount > 0 && insertedSnaps.length !== clientCount) {
    problems.push(`client_count ${clientCount} ≠ snapshots ${insertedSnaps.length}`);
  }
  return problems;
}

export async function persistMonitoringToBusinessData({
  runMeta,
  snapshot,
  freeze,
  issues = [],
  clients = [],
  n8nExecutionId = null,
  force = false,
}) {
  const cfg = businessDataConfig();
  if (!cfg.ready) {
    return { ok: false, skipped: true, reason: "BUSINESS_DATA_NOT_CONFIGURED" };
  }

  const referenceDay = snapshot.referenceDay || snapshot.referenceDate?.slice(0, 10);
  const versionFingerprint = snapshot.versionFingerprint;
  const filtersFingerprint = snapshot.filtersFingerprint || "";
  const idempotencyKey = buildRunIdempotencyKey({
    referenceDay,
    population: snapshot.population,
    versionFingerprint,
    filtersFingerprint,
  });

  if (!force) {
    const existing = await findExistingRun(idempotencyKey);
    if (shouldSkipIdempotentRun(existing)) {
      return {
        ok: true,
        skipped: true,
        idempotent: true,
        runId: existing.run_id,
        snapshotRows: existing.snapshot_rows,
        referenceDay: existing.reference_date,
      };
    }
  }

  const startedAt = runMeta.startedAt || new Date().toISOString();
  const bundleChecksum = createHash("sha256")
    .update(JSON.stringify({ snapshot: snapshot.rows?.length, freeze: freeze?.rows?.length, issues: issues.length }))
    .digest("hex");

  const expectedSnapshots = snapshot.rows?.length || 0;
  const clientCount = clients.length || expectedSnapshots;

  const runRows = await bdInsert("pipeline_runs", [
    {
      reference_date: referenceDay,
      started_at: startedAt,
      finished_at: null,
      status: "running",
      pipeline_version: PIPELINE_DB_VERSION,
      formula_version: snapshot.formulaVersion || OFFICIAL_FORMULA_VERSION,
      hs2a_version: snapshot.hs2aVersion || HS2A_VERSION,
      population: snapshot.population,
      client_count: clientCount,
      snapshot_rows: 0,
      issue_rows: 0,
      freeze_rows: 0,
      errors: [],
      warnings: runMeta.warnings || [],
      bundle_checksum: bundleChecksum,
      n8n_execution_id: n8nExecutionId,
      filters_fingerprint: filtersFingerprint,
      version_fingerprint: versionFingerprint,
      idempotency_key: idempotencyKey,
    },
  ]);
  const runId = runRows?.[0]?.run_id;
  if (!runId) throw new Error("Falha ao criar pipeline_runs.");

  try {
    const clientByRef = new Map(clients.map((c) => [stableClientRef(c.clientId), c]));

    const snapshotPayload = (snapshot.rows || []).map((r) => ({
      run_id: runId,
      client_ref: r.clientRef,
      reference_date: referenceDay,
      population: snapshot.population,
      health_score: r.hs,
      engagement_score: r.e,
      mechanism_score: r.m,
      final_class: r.classificacao,
      profile_code: r.perfil,
      quality_code: r.qualidade,
      phase_code: r.fase,
      program: r.programa,
      engineer: r.ep,
      analytical_status: r.status,
      formula_version: snapshot.formulaVersion,
      hs2a_version: snapshot.hs2aVersion,
      version_fingerprint: versionFingerprint,
      filters_fingerprint: filtersFingerprint,
      row_checksum: rowChecksum(r),
    }));

    const insertedSnaps = await bdInsertChunks("client_snapshots", snapshotPayload, {
      onConflict: "client_ref,reference_date,population,version_fingerprint,filters_fingerprint",
    });

    const components = insertedSnaps.map((snap) => {
      const src = snapshot.rows.find((r) => r.clientRef === snap.client_ref) || {};
      const full = clientByRef.get(snap.client_ref);
      return {
        snapshot_id: snap.snapshot_id,
        total_meetings: full?.totalMeetings ?? null,
        days_since_last_meeting: full?.daysSinceLastMeeting ?? null,
        avg_meetings_per_month: full?.avgMeetingsPerMonth ?? null,
        implemented_count: full?.implementedCount ?? null,
        reunioes_30d: full?.reunioes30d ?? null,
        attendance_rate: full?.attendanceRate ?? null,
        cobertura_reuniao: src.coberturaReuniao ?? null,
        cobertura_mec: src.coberturaMec ?? null,
        issue_keys: src.issueKeys || [],
      };
    });
    await bdInsertChunks("snapshot_components", components);

    const issuePayload = issues.map((issue) => ({
      run_id: runId,
      client_ref: issue.clientRef,
      reference_date: referenceDay,
      issue_type: issue.tipo,
      category: issue.categoria,
      priority: issue.prioridade,
      evidence: issue.evidencia,
      source_field: issue.campo,
      recommended_action: issue.acaoRecomendada,
      rule_version: snapshot.hs2aVersion || HS2A_VERSION,
      status: "open",
      identified_at: issue.identificadoEm || referenceDay,
    }));
    if (issuePayload.length) {
      await bdInsertChunks("quality_issues", issuePayload, {
        onConflict: "client_ref,reference_date,issue_type,rule_version",
      });
    }

    let freezeId = null;
    let freezeRowCount = 0;
    if (freeze?.rows?.length) {
      const freezeKey = `${freeze.referenceMonth}|${freeze.population}|${freeze.transformVersion}`;
      const integrity = freeze.integrity || freezeIntegrity(freeze);
      const freezeIns = await bdInsert(
        "prospective_freezes",
        [
          {
            run_id: runId,
            reference_month: freeze.referenceMonth,
            reference_date: freeze.referenceDay,
            population: freeze.population,
            formula_version: freeze.formulaVersion,
            hs2a_version: freeze.hs2aVersion,
            transform_version: freeze.transformVersion,
            horizon_days: freeze.labelPolicy?.horizonDays || 90,
            maturation_date: maturationDate(freeze.referenceDay, freeze.labelPolicy?.horizonDays || 90),
            row_count: freeze.rows.length,
            integrity_hash: integrity,
            features_catalog: freeze.features || [],
            sources: freeze.sourcesAvailable || {},
            idempotency_key: freezeKey,
          },
        ],
        { onConflict: "idempotency_key" },
      );
      freezeId = freezeIns?.[0]?.freeze_id;
      if (freezeId) {
        const featRows = freeze.rows.map((r) => ({
          freeze_id: freezeId,
          client_ref: r.clientRef,
          features: r,
        }));
        await bdInsertChunks("prospective_features", featRows, { onConflict: "freeze_id,client_ref" });
        freezeRowCount = featRows.length;
      }
    }

    const integrityProblems = verifyPersistIntegrity({
      expectedSnapshots,
      insertedSnaps,
      components,
      issuePayload,
      clientCount,
    });
    if (integrityProblems.length) {
      const msg = integrityProblems.join("; ");
      await markRunFailed(runId, msg, {
        snapshot_rows: insertedSnaps.length,
        issue_rows: issuePayload.length,
        freeze_rows: freezeRowCount,
      });
      const err = new Error(`Persistência incompleta: ${msg}`);
      err.code = "BUSINESS_DATA_PARTIAL";
      throw err;
    }

    await bdPatch("pipeline_runs", `run_id=eq.${runId}`, {
      status: "success",
      finished_at: runMeta.finishedAt || new Date().toISOString(),
      snapshot_rows: insertedSnaps.length,
      issue_rows: issuePayload.length,
      freeze_rows: freezeRowCount,
    });

    return {
      ok: true,
      skipped: false,
      runId,
      referenceDay,
      snapshotRows: insertedSnaps.length,
      issueRows: issuePayload.length,
      freezeRows: freezeRowCount,
      freezeId,
      bundleChecksum,
      idempotencyKey,
    };
  } catch (error) {
    if (error?.code !== "BUSINESS_DATA_PARTIAL") {
      await markRunFailed(runId, error).catch(() => {});
    }
    throw error;
  }
}
