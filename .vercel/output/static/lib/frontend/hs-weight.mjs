/** Pesos experimentais E/M — incrementos de 5%, soma 100%. */

export function snapEngagementWeight(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  const snapped = Math.round(n / 5) * 5;
  return Math.max(0, Math.min(100, snapped));
}

export function weightsFromEngagement(engagementValue) {
  const engagement = snapEngagementWeight(engagementValue);
  return { engagement, mechanism: 100 - engagement };
}

export function isOfficialHsWeights(weights) {
  return snapEngagementWeight(weights?.engagement) === 50 && snapEngagementWeight(weights?.mechanism) === 50;
}
