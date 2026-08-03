/**
 * Motor de máquinas de estado para entidades financieras.
 *
 * Reglas de uso:
 * - SIEMPRE llamar a `transition(entity, from, to)` antes de hacer cualquier UPDATE de estado.
 * - Si la transición es inválida, se lanza `InvalidStateTransitionError` con mensaje en español.
 * - La función nunca modifica la base de datos; solo valida.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHARGE (Cargo de cobro)
 *   pendiente ──────────────────────────► pagado
 *   pendiente ─────────────────────────► parcial
 *   pendiente ──────────────────────────► vencido
 *   pendiente ──────────────────────────► cancelado
 *   parcial ──────────────────────────► pagado
 *   parcial ──────────────────────────► vencido
 *   parcial ──────────────────────────► cancelado
 *   vencido ──────────────────────────► pagado
 *   vencido ──────────────────────────► parcial
 *   vencido ──────────────────────────► cancelado
 *
 * PAYMENT (Pago)
 *   pendiente ────────────────────────► exitoso
 *   pendiente ────────────────────────► fallido
 *   exitoso ──────────────────────────► reversado
 *
 * INVOICE (Factura CFDI)
 *   pendiente ────────────────────────► emitido
 *   pendiente ────────────────────────► cancelado
 *   emitido ──────────────────────────► cancelado
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Error tipado lanzado cuando una transición de estado no es válida. */
export class InvalidStateTransitionError extends Error {
  public readonly entity: string;
  public readonly from: string;
  public readonly to: string;

  constructor(entity: string, from: string, to: string) {
    super(
      `Transición inválida en ${entity}: '${from}' → '${to}' no está permitida`
    );
    this.name = "InvalidStateTransitionError";
    this.entity = entity;
    this.from = from;
    this.to = to;
  }
}

/** Mapa de transiciones permitidas por entidad.
 *  Clave: estado_origen  Valor: conjunto de estados_destino permitidos. */
type TransitionMap = Record<string, ReadonlySet<string>>;

const CHARGE_TRANSITIONS: TransitionMap = {
  pendiente: new Set(["pagado", "parcial", "vencido", "cancelado"]),
  parcial:   new Set(["pagado", "vencido", "cancelado"]),
  vencido:   new Set(["pagado", "parcial", "cancelado"]),
  // pagado y cancelado son estados terminales — no se puede salir de ellos
  pagado:    new Set(),
  cancelado: new Set(),
};

const PAYMENT_TRANSITIONS: TransitionMap = {
  pendiente: new Set(["exitoso", "fallido"]),
  exitoso:   new Set(["reversado"]),
  fallido:   new Set(), // terminal
  reversado: new Set(), // terminal
};

const INVOICE_TRANSITIONS: TransitionMap = {
  pendiente: new Set(["emitido", "cancelado"]),
  emitido:   new Set(["cancelado"]),
  cancelado: new Set(), // terminal
};

const ENTITY_MAPS: Record<string, TransitionMap> = {
  charge:  CHARGE_TRANSITIONS,
  payment: PAYMENT_TRANSITIONS,
  invoice: INVOICE_TRANSITIONS,
};

/** Tipo de entidad válido para el motor de transiciones. */
export type StateMachineEntity = "charge" | "payment" | "invoice";

/**
 * Valida que la transición `from → to` sea permitida para la `entity` dada.
 *
 * @throws {InvalidStateTransitionError} si la transición no está permitida.
 *
 * @example
 * transition("charge", "pendiente", "pagado");   // OK
 * transition("charge", "pagado",    "pendiente"); // lanza InvalidStateTransitionError
 */
export function transition(
  entity: StateMachineEntity,
  from: string,
  to: string
): void {
  // Si el estado no cambia no hace falta validar
  if (from === to) return;

  const map = ENTITY_MAPS[entity];
  if (!map) {
    throw new InvalidStateTransitionError(entity, from, to);
  }

  const allowed = map[from];
  if (!allowed || !allowed.has(to)) {
    throw new InvalidStateTransitionError(entity, from, to);
  }
}

/**
 * Retorna todos los estados destino válidos desde un estado dado.
 * Útil para construir menús de cambio de estado en la UI.
 */
export function allowedTransitions(
  entity: StateMachineEntity,
  from: string
): string[] {
  const map = ENTITY_MAPS[entity];
  if (!map) return [];
  return Array.from(map[from] ?? []);
}
