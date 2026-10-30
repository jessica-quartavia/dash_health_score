import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_PORT = 3098;

function waitForServer(ms = 8000) {
  const deadline = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/predictive-study-v15`);
        if (res.headers.get("content-type")?.includes("json")) {
          resolve(res);
          return;
        }
      } catch {
        /* retry */
      }
      if (Date.now() > deadline) reject(new Error("server timeout"));
      else setTimeout(tick, 200);
    };
    tick();
  });
}

test("dev-server — rotas /api/predictive-study-* retornam JSON", async (t) => {
  const child = spawn(process.execPath, ["scripts/dev-server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(TEST_PORT) },
    stdio: "ignore",
  });
  t.after(() => {
    child.kill("SIGTERM");
  });

  const res = await waitForServer();
  const ct = res.headers.get("content-type") || "";
  assert.match(ct, /application\/json/i);
  const body = await res.text();
  assert.doesNotMatch(body.trimStart(), /^<!DOCTYPE/i);

  const labRef = await fetch(`http://127.0.0.1:${TEST_PORT}/api/predictive-lab-reference`);
  assert.match(labRef.headers.get("content-type") || "", /json/i);
  const labBody = await labRef.json();
  assert.equal(labBody.ok, true);
  assert.equal(labBody.referenceModel?.id, "E");

  const missing = await fetch(`http://127.0.0.1:${TEST_PORT}/api/nao-existe-rota-teste`);
  assert.match(missing.headers.get("content-type") || "", /json/i);
  const missBody = await missing.json();
  assert.equal(missBody.ok, false);
});
