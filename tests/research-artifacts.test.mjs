import assert from "node:assert/strict";
import test from "node:test";
import { loadResearchArtifacts } from "../lib/research/artifact-loader.mjs";

test("loadResearchArtifacts expõe estado e comandos de regeneração", () => {
  const bundle = loadResearchArtifacts();
  assert.equal(bundle.version, "research-bundle-v1");
  assert.ok(Array.isArray(bundle.regenerateCommands));
  assert.ok(bundle.regenerateCommands.includes("npm run model:all"));
  assert.ok(bundle.artifacts.modelingResults);
  if (bundle.artifacts.modelingResults.available) {
    assert.equal(bundle.researchState, "models_trained_not_operational");
    assert.match(bundle.researchStateLabel, /experimentais treinados/i);
    assert.equal(bundle.data.modelingResults?.status, "ok");
  }
});

test("bundle não mistura operacional com pesquisa na documentação", () => {
  const bundle = loadResearchArtifacts();
  assert.ok(bundle.separation?.operacional);
  assert.ok(bundle.separation?.pesquisa);
});
