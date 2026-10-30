import assert from "node:assert/strict";
import test from "node:test";
import { renderResearchPanorama } from "../public/research-panorama.mjs";
import { buildResearchPanorama } from "../lib/research/panorama-aggregates.mjs";

const fmt = new Intl.NumberFormat("pt-BR");
const pctFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const uiStub = {
  escapeHtml: (s) => String(s ?? ""),
  fmt,
  pctFmt,
  formatNum: (n, d = 1) => {
    const x = Number(n);
    return Number.isFinite(x) ? x.toLocaleString("pt-BR", { maximumFractionDigits: d }) : "—";
  },
  bars: () => "<div class='bars'>ok</div>",
  hBarMetrics: () => "<div class='h-metrics'>ok</div>",
  card: (t, s, b) => `<article>${t}${b}</article>`,
  kpi: (l, v, h) => `<article>${l}:${v}</article>`,
};

test("panorama sem payload retorna objeto html string, não undefined", () => {
  const out = renderResearchPanorama(null, uiStub, { filters: {} });
  assert.equal(typeof out, "object");
  assert.equal(typeof out.html, "string");
  assert.ok(out.html.length > 10);
  assert.doesNotMatch(out.html, /undefined/);
  assert.equal(typeof out.bind, "function");
});

test("panorama com payload real não contém undefined no HTML", () => {
  const payload = buildResearchPanorama({});
  const out = renderResearchPanorama(payload, uiStub, { filters: {} });
  assert.equal(typeof out.html, "string");
  assert.doesNotMatch(out.html, /\bundefined\b/);
  assert.doesNotMatch(out.html, /\[object Object\]/);
  assert.doesNotMatch(out.html, /\bNaN\b/);
  assert.doesNotMatch(out.html, /Infinity/);
});

test("panorama com faixas incompletas não formata NaN na meta", () => {
  const payload = buildResearchPanorama({});
  if (!payload.descriptive?.hsBands?.length) return;
  const broken = structuredClone(payload);
  broken.descriptive.hsBands[0].uniqueClients = undefined;
  broken.descriptive.hsBands[0].churnRate = undefined;
  const out = renderResearchPanorama(broken, uiStub, { filters: {} });
  assert.doesNotMatch(out.html, /\bNaN\b/);
});

test("panorama com erro explícito", () => {
  const out = renderResearchPanorama({ error: "API indisponível" }, uiStub, {});
  assert.match(out.html, /indisponível/i);
});

test("visão executiva inclui hero e limitações em linguagem simples", () => {
  const payload = buildResearchPanorama({});
  const out = renderResearchPanorama(payload, uiStub, { filters: {} });
  assert.match(out.html, /Laboratório Preditivo/i);
  assert.match(out.html, /O que isso não significa/i);
  assert.match(out.html, /Resumo executivo/i);
  assert.doesNotMatch(out.html, /Matriz E × M/);
});
