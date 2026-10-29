import { loadResearchArtifacts } from "../research/artifact-loader.mjs";

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

export function handleResearchBundleApi(_req, res) {
  const bundle = loadResearchArtifacts();
  sendJson(res, 200, bundle);
  return true;
}
