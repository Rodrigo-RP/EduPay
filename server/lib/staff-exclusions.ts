/**
 * Personal del Dashboard que NO debe proponerse como candidato a usuario de EduPay.
 * Regla (Karla, 25-nov-2026): con rol Administrativo, se omiten los departamentos de apoyo y operación listados abajo.
 * Fuente única: la usan la sincronización (no crea ni actualiza candidatos), el listado y la asignación.
 */
const norm = (v: string | null | undefined): string =>
  (typeof v === "string" ? v : "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const ROL_AFECTADO = "administrativo";

const DEPARTAMENTOS_EXCLUIDOS: ReadonlySet<string> = new Set(
  ["Recepción", "Limpieza", "Responsable Limpieza", "Vigilancia", "Director de Área", "Mantenimiento"].map(norm),
);

export function isStaffExcludedFromCandidates(rolDashboard: string | null | undefined, departamento: string | null | undefined): boolean {
  return norm(rolDashboard) === ROL_AFECTADO && DEPARTAMENTOS_EXCLUIDOS.has(norm(departamento));
}
