/** Valida contrato mínimo de /api/health-score (sem inspecionar clientes). */

export function validateHealthScorePayload(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    errors.push("corpo ausente ou inválido");
    return { ok: false, errors };
  }
  if (!Array.isArray(body.clients)) errors.push("clients (array)");
  const options = body.filters?.options;
  if (!options || typeof options !== "object") {
    errors.push("filters.options");
  } else {
    for (const key of ["cluster", "ep", "program", "finalClass"]) {
      if (!Array.isArray(options[key])) errors.push(`filters.options.${key}`);
    }
  }
  if (!body.summary || typeof body.summary !== "object") errors.push("summary");
  if (!body.metadata || typeof body.metadata !== "object") errors.push("metadata");
  return { ok: errors.length === 0, errors };
}
