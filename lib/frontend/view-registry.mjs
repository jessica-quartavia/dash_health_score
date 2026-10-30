/** Contrato de views — usado em testes de navegação. */

export const VIEW_IDS = [
  "overview",
  "portfolio",
  "health",
  "evolution",
  "engagement",
  "mechanisms",
  "nps",
  "quality",
  "research",
  "base",
];

export const VIEWS_REQUIRING_PAYLOAD = new Set(VIEW_IDS);

export const ASYNC_VIEWS = new Set(["quality", "evolution", "research"]);

export function shouldRefetchOnLeaveResearch(prevView, nextView) {
  return prevView === "research" && nextView !== "research";
}

export function shouldRefetchOnEnterResearch(prevView, nextView) {
  return nextView === "research" && prevView !== "research";
}
