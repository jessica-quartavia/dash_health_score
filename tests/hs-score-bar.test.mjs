import assert from "node:assert/strict";
import test from "node:test";
import { hsBarTone, hsScoreBarHtml } from "../lib/frontend/hs-score-bar.mjs";

test("hsBarTone usa classificação operacional", () => {
  assert.equal(hsBarTone("Saudável"), "healthy");
  assert.equal(hsBarTone("Sem registro"), "neutral");
  assert.equal(hsBarTone("Crítico"), "critical");
});

test("barra fina inline sem quebrar linha", () => {
  const html = hsScoreBarHtml(
    { healthScore: 72, finalClass: "Saudável", engagementScore: 60, mechanismScore: 80 },
    { formatNum: (n) => String(n) },
  );
  assert.match(html, /hs-inline-bar/);
  assert.match(html, /hs-inline-track/);
  assert.match(html, /healthy/);
  assert.match(html, />72</);
});

test("HS zero legítimo mantém tom neutro ou operacional", () => {
  const html = hsScoreBarHtml(
    { healthScore: 0, finalClass: "Sem registro", engagementScore: 0, mechanismScore: 0 },
    { formatNum: (n) => String(n) },
  );
  assert.match(html, /neutral/);
});
