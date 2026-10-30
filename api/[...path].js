import { loadProjectEnv, PROJECT_ROOT } from "../lib/load-env.mjs";
import {
  dispatchHttpApi,
  resolveApiPathFromRequest,
} from "../lib/api/dispatch-http-api.mjs";
import { sendApiNotFound } from "../lib/api/json-artifact.mjs";

loadProjectEnv();

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  try {
    const apiPath = resolveApiPathFromRequest(req);
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const url = new URL(req.url || apiPath, `${proto}://${host}`);

    const handled = await dispatchHttpApi({ apiPath, req, res, url, root: PROJECT_ROOT });
    if (!handled && !res.headersSent) {
      sendApiNotFound(res, apiPath);
    }
  } catch (error) {
    console.error("[api] handler", error?.message || error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ ok: false, error: "Falha interna na API.", code: "INTERNAL" }));
    }
  }
}
