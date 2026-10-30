import { loadProjectEnv, PROJECT_ROOT } from "../lib/load-env.mjs";
import { dispatchHttpApi, normalizeApiPath } from "../lib/api/dispatch-http-api.mjs";

loadProjectEnv();

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  const segments = req.query.path;
  const parts = Array.isArray(segments) ? segments : segments ? [segments] : [];
  const apiPath = normalizeApiPath(`/api/${parts.join("/")}`);
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const url = new URL(req.url || apiPath, `${proto}://${host}`);

  await dispatchHttpApi({ apiPath, req, res, url, root: PROJECT_ROOT });
}
