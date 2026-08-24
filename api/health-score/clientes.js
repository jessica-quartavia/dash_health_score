import { handleHealthScoreApi } from "../../lib/api/health-score-handler.mjs";

export default async function handler(req, res) {
  return handleHealthScoreApi(req, res);
}
