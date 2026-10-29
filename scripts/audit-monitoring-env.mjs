import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProjectEnv } from "../lib/load-env.mjs";
import { auditMonitoringEnvironment } from "../lib/monitoring/storage-backend.mjs";

loadProjectEnv();

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "research", "monitoring", "output");

const audit = await auditMonitoringEnvironment({ probeRemote: process.argv.includes("--probe-storage") });
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "ENV_AUDIT_ETAPA11.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");

console.log(JSON.stringify(audit.publicSummary, null, 2));
console.log(`\nPersistência comprovada: ${audit.persistence.comprovada ? "sim" : "pendente"}`);
if (audit.credentialReuseRisks.length) {
  console.warn("Riscos:", audit.credentialReuseRisks.join("; "));
}
process.exitCode = audit.persistence.comprovada ? 0 : 2;
