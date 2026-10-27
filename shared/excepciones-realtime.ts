export interface ExcepcionesCount {
  total_pendiente: number;
  campus_id: number;
  tenant_id: number;
}

// Mismo alcance de lectura que la bandeja y el endpoint de conteo.
export function canReceiveExcepciones(user: { role: string; is_super_admin?: boolean }) {
  return user.is_super_admin || [
    'administrador_general', 'administrador_campus', 'super_admin',
    'caja', 'auxiliar_caja', 'contador_general', 'asistente',
  ].includes(user.role);
}

export function isExcepcionesCount(value: unknown): value is ExcepcionesCount {
  const count = value as ExcepcionesCount | null;
  return !!count && Number.isSafeInteger(count.total_pendiente) && count.total_pendiente >= 0
    && Number.isSafeInteger(count.campus_id) && count.campus_id > 0
    && Number.isSafeInteger(count.tenant_id) && count.tenant_id > 0;
}
