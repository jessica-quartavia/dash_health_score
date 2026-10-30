import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPredictiveLabReference } from "../research/predictive-lab-reference.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function handlePredictiveLabReferenceApi(req, res) {
  if (req.method !== "GET") {
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
    return true;
  }
  const pack = buildPredictiveLabReference(ROOT);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify({ ok: pack.ok, loadState: pack.loadState, ...pack }));
  return true;
}
