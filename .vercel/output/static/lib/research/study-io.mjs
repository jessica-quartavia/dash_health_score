import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function readJsonIfExists(relPath) {
  const path = join(ROOT, relPath);
  if (!existsSync(path)) return { ok: false, path: relPath, data: null };
  try {
    return { ok: true, path: relPath, data: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { ok: false, path: relPath, error: error.message, data: null };
  }
}

export function writeJson(relPath, data) {
  const path = join(ROOT, relPath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return path;
}
