/** Máquina de estados — autenticação corporativa (fonte única de verdade). */

export const AuthPhase = Object.freeze({
  CHECKING: "checking",
  UNAUTHENTICATED: "unauthenticated",
  UNAUTHORIZED_DOMAIN: "unauthorizedDomain",
  AUTHORIZED: "authorized",
});

export function phaseRequiresAuthGate(phase) {
  return phase !== AuthPhase.AUTHORIZED;
}

export function canFetchProtectedData(phase, { corporateAuthRequired = true } = {}) {
  if (corporateAuthRequired === false) return true;
  return phase === AuthPhase.AUTHORIZED;
}

export function phaseFromBootSession({ corporateAuthRequired, session, authError }) {
  if (!corporateAuthRequired) return AuthPhase.AUTHORIZED;
  if (session?.access_token) return AuthPhase.AUTHORIZED;
  if (authError?.code === "AUTH_DOMAIN") return AuthPhase.UNAUTHORIZED_DOMAIN;
  return AuthPhase.UNAUTHENTICATED;
}

export function phaseFromApiAuthCode(code) {
  if (code === "AUTH_DOMAIN") return AuthPhase.UNAUTHORIZED_DOMAIN;
  if (code === "AUTH_REQUIRED" || code === "AUTH_INVALID" || code === "AUTH_NOT_CONFIGURED") {
    return AuthPhase.UNAUTHENTICATED;
  }
  return null;
}

export function statusLineForPhase(phase) {
  switch (phase) {
    case AuthPhase.CHECKING:
      return "Verificando acesso corporativo…";
    case AuthPhase.UNAUTHORIZED_DOMAIN:
      return "Domínio não autorizado";
    case AuthPhase.UNAUTHENTICATED:
      return "Login necessário para ver dados de clientes.";
    default:
      return "Utilize sua conta Google corporativa para continuar.";
  }
}
