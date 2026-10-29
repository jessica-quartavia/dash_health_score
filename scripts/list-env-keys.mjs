import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const envPath = join(process.cwd(), ".env");
if (!existsSync(envPath)) {
  console.log("no .env");
  process.exit(0);
}
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq < 1) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  console.log(`${k}: ${v ? `set (len ${v.length})` : "empty"}`);
}
