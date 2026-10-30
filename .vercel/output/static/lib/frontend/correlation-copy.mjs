/** Textos de associação (Pearson) — não causalidade. */

export function correlationStrength(absR) {
  if (absR == null || Number.isNaN(absR)) return null;
  if (absR < 0.1) return "negligível";
  if (absR < 0.3) return "fraca";
  if (absR < 0.5) return "moderada";
  return "forte";
}

export function describeCorrelation({ pearson, sampleSize, subject = "engajamento e satisfação (NPS)" }) {
  const n = Number(sampleSize) || 0;
  if (n < 3 || pearson == null) {
    return {
      headline: "Amostra insuficiente",
      detail: `Menos de 3 pares válidos (n=${n}). Não calculamos associação confiável.`,
    };
  }
  if (n < 30) {
    const base = `Com apenas ${n} respostas, qualquer padrão é exploratório.`;
    if (pearson == null) return { headline: "Sem coeficiente", detail: base };
    const r = Number(pearson);
    const strength = correlationStrength(Math.abs(r));
    const dir = r > 0 ? "positiva" : r < 0 ? "negativa" : "nula";
    return {
      headline: `Associação ${dir} ${strength}`,
      detail: `${base} Coeficiente ${r.toFixed(2)} — associação, não causa.`,
    };
  }
  const r = Number(pearson);
  const strength = correlationStrength(Math.abs(r));
  if (strength === "negligível") {
    return {
      headline: "Sem associação linear clara",
      detail: `Entre ${subject} nesta amostra (n=${n}), o coeficiente (${r.toFixed(2)}) sugere relação linear fraca ou ausente.`,
    };
  }
  const dir = r > 0 ? "positiva" : "negativa";
  return {
    headline: `Associação ${dir} ${strength}`,
    detail: `Entre ${subject} nesta amostra (n=${n}): coeficiente ${r.toFixed(2)}. Isso descreve co-ocorrência no recorte — não prova que um fator cause o outro.`,
  };
}
