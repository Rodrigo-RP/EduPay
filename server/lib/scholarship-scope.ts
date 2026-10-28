/**
 * Canonical current beneficiary scope. Aliases/parameter numbers are supplied
 * only by server code, never from request input.
 */
export function currentScholarshipScope(
  assignment: string, student: string, campusParam: string, tenantParam: string,
): string {
  return `${student}.campus_id = ${campusParam}
    AND ${assignment}.tenant_id = ${tenantParam}
    AND ${student}.status = 'activo'
    AND COALESCE(${assignment}.estado, 'activa') = 'activa'
    AND ${assignment}.vigencia_inicio <= CURRENT_DATE
    AND (${assignment}.vigencia_fin IS NULL OR ${assignment}.vigencia_fin >= CURRENT_DATE)`;
}
