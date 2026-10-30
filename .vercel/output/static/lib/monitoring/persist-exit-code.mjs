/** Código de saída quando --persist-business-data foi solicitado. */
export function businessDataPersistExitCode(bd, { required = true } = {}) {
  if (!required) return 0;
  if (!bd) return 1;
  if (bd.ok === false) return 1;
  if (bd.skipped && bd.reason === "BUSINESS_DATA_NOT_CONFIGURED") return 1;
  if (bd.skipped && !bd.idempotent) return 1;
  return 0;
}
