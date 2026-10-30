/**
 * Caminhos duráveis: monitoring/{ano}/{mes}/{tipo}/{arquivo}
 */
export const ARTIFACT_TYPES = ["snapshots", "prospective", "manifest", "reports", "runs", "meta"];

export function artifactObjectKey({ referenceDate = new Date(), type, fileName }) {
  if (!ARTIFACT_TYPES.includes(type)) throw new Error(`Tipo de artefato inválido: ${type}`);
  const iso = typeof referenceDate === "string" ? referenceDate : referenceDate.toISOString();
  const [year, month] = iso.slice(0, 7).split("-");
  const safeName = String(fileName).replace(/[/\\]/g, "_");
  return `monitoring/${year}/${month}/${type}/${safeName}`;
}

export function mirrorRelativePath(key) {
  return key.replace(/^monitoring\//, "");
}
