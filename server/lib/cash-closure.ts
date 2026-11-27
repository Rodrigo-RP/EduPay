import { schoolDate } from "../../shared/school-date";

/** El corte de caja de hoy ya se hizo: el personal no puede registrar más cobros ese día. */
export class CashClosedError extends Error {
  readonly status = 409;
  readonly code = "CAJA_CERRADA";
  constructor() {
    super("La caja de hoy ya está cerrada; no se pueden registrar más cobros");
  }
}

type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

/**
 * Toma el mismo candado por escuela y campus que usa `cerrar-dia`, de modo que un cobro y un cierre nunca se
 * crucen: o el cobro entra antes del corte (y queda en su resumen) o ve el corte y se rechaza.
 * Debe llamarse dentro de una transacción (el candado es de transacción).
 */
export async function lockCashDay(client: Queryable, tenantId: number, campusId: number): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock($1,$2)", [tenantId, campusId]);
}

/** Lanza `CashClosedError` si el día escolar de hoy ya tiene corte. Toma el candado antes de revisar. */
export async function assertCashDayOpen(client: Queryable, tenantId: number, campusId: number): Promise<void> {
  await lockCashDay(client, tenantId, campusId);
  const closure = await client.query(
    "SELECT 1 FROM cash_closures WHERE tenant_id=$1 AND campus_id=$2 AND fecha=$3",
    [tenantId, campusId, schoolDate()],
  );
  if (closure.rows.length) throw new CashClosedError();
}
