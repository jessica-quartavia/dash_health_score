import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXPORT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "exports", "predictive-study");

export function pseudonymSecret(exportDir = EXPORT_DIR) {
  mkdirSync(exportDir, { recursive: true });
  const file = join(exportDir, ".pseudonym-secret");
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("hex"), "utf8");
  return readFileSync(file, "utf8").trim();
}

export function clientRef(clientId, secret = pseudonymSecret()) {
  if (clientId == null || clientId === "") return "";
  const digest = createHmac("sha256", secret).update(`c:${String(clientId)}`).digest("hex").slice(0, 20);
  return `c_${digest}`;
}

export function episodeRef(clientId, index, secret = pseudonymSecret()) {
  const digest = createHmac("sha256", secret).update(`ep:${String(clientId)}:${index}`).digest("hex").slice(0, 16);
  return `ep_${digest}`;
}
