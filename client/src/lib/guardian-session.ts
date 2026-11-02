export const GUARDIAN_LOGIN_PATH = "/acceso-padres";
export const GUARDIAN_SESSION_MESSAGE = "guardian-session-message";
export function redirectGuardianToLogin() {
  sessionStorage.setItem(GUARDIAN_SESSION_MESSAGE,
    "Tu sesión terminó o ya no tienes acceso. Ingresa de nuevo al portal de padres; si continúa, comunícate con la escuela.");
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_type");
  localStorage.removeItem("auth_user");
  window.location.assign(GUARDIAN_LOGIN_PATH);
}
