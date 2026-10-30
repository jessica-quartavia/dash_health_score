import assert from "node:assert/strict";
import test from "node:test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { handleResearchPanoramaApi } from "../lib/api/research-panorama-handler.mjs";
import { probePanoramaArtifacts } from "../lib/research/panorama-artifacts.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function mockRes() {
  let status = 0;
  let headers = {};
  let body = "";
  return {
    writeHead(code, h) {
      status = code;
      headers = h;
    },
    end(chunk) {
      body = chunk;
    },
    get result() {
      return { status, headers, json: JSON.parse(body) };
    },
  };
}

test("handler retorna JSON application/json com status e processingMs", () => {
  const res = mockRes();
  const url = new URL("http://localhost/api/research-panorama");
  handleResearchPanoramaApi({ method: "GET" }, res, url);
  const out = res.result;
  assert.equal(out.status, 200);
  assert.match(out.headers["Content-Type"], /json/);
  assert.equal(out.json.version, "panorama-v1");
  assert.ok(["ok", "partial", "unavailable"].includes(out.json.status));
  assert.ok(Number.isFinite(out.json.processingMs));
  assert.ok(out.json.descriptiveAvailability?.reason != null || out.json.descriptiveAvailability?.ok === true);
  assert.ok(out.json.artifacts?.entries);
});

test("probe marca CSV e pre_audit quando presentes no repo de dev", () => {
  const probe = probePanoramaArtifacts(ROOT);
  assert.ok(probe.entries.preAudit);
  assert.ok(probe.entries.robustness);
  if (probe.entries.datasetValidado.present) {
    assert.equal(probe.readiness, "full");
    assert.ok(probe.entries.churnConsolidado.present);
  }
});

test("contrato nunca inclui descriptive null com ok true", () => {
  const out = mockRes();
  handleResearchPanoramaApi({ method: "GET" }, out, new URL("http://x/api/research-panorama"));
  const j = out.result.json;
  if (j.descriptiveAvailability?.ok === true) {
    assert.ok(j.descriptive);
    assert.ok(j.descriptive.hsBands?.length);
  }
});
