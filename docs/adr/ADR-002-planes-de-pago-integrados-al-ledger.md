# ADR-002: Los planes de pago dejan de ser un sistema paralelo y pasan a generar Charges reales en el ledger

**Estado:** Aceptado  
**Fecha:** 2026-08-06  
**Autores:** Equipo EduPay  
**Contexto:** Módulo de Planes de Pago — Auditoría pre-pruebas

---

## Contexto

La auditoría de código realizada antes de escribir las pruebas del módulo reveló cuatro defectos
estructurales en la implementación actual de planes de pago. Se documentan con evidencia exacta
del código fuente, no con suposiciones.

### Defecto 1 — Desconexión total del ledger

`payment_plans` no tiene ninguna FK hacia `charges`. El monto que se convierte en plan es un
número libre que el administrador escribe en el formulario. El `POST /api/planes-pago`
(`server/routes/misc.ts:37`) acepta:

```typescript
const { student_id, guardian_id, total_adeudo_centavos,
        monto_inicial_centavos, numero_pagos, frecuencia,
        fecha_inicio, observaciones } = req.body;
// ← no hay charge_id, concept_id, ni ningún enlace al ledger
```

Las cuotas que genera el plan se insertan únicamente en `payment_plan_installments`
(`misc.ts:59`), una tabla paralela que no tiene relación con `charges`, `payments` ni
`payment_applications`. Las cuotas del plan son objetos que no existen para el resto del sistema.

**Consecuencia observable:** El estado de cuenta de una familia (que lee `charges`) no refleja
las cuotas del plan. La bandeja de excepciones de conciliación (que también trabaja contra
`charges`) no puede aplicar pagos SPEI a cuotas de un plan. El semáforo de riesgo calcula
el adeudo sumando `charges.monto_base_centavos WHERE estado='pendiente'`; las cuotas del plan
no aparecen ahí.

### Defecto 2 — Sin detección de mora

`payment_plan_installments` tiene `fecha_vencimiento` pero el sistema nunca la lee para
cambiar ningún estado. El schema define solo un valor activo para `estado`
(`shared/schema.ts:1033`):

```typescript
estado: varchar("estado", { length: 20 }).default("pendiente")
// ← solo dos valores en uso en todo el código: 'pendiente' y 'pagado'
```

No existe ningún scheduler, cron, trigger de PostgreSQL, ni endpoint que cambie
`estado='pendiente'` a `estado='vencida'` o equivalente. El dashboard reporta literalmente
`cuotas_vencidas: 0` como constante hardcodeada (`misc.ts:325`):

```typescript
res.json({ resumen: { ..., cuotas_vencidas: 0, ... } });
//                         ↑ nunca calculado, siempre cero
```

### Defecto 3 — Sin cancelación ni renegociación

`payment_plans.estado` tiene `default('activo')` en el schema (`shared/schema.ts:1019`), pero
ningún código lo modifica. No existe ninguna ruta `PATCH`, `PUT` ni `DELETE` sobre planes:

```
grep -rn "PATCH.*planes|PUT.*planes|DELETE.*planes|cancelar.*plan|renegociar" server/
→ (sin resultados)
```

Un plan creado queda en `estado='activo'` perpetuamente. Las cuotas ya pagadas dentro de ese
plan no se pueden vincular retroactivamente a nada si el plan se quisiera cancelar, porque
`payment_plan_installments` tampoco tiene FK hacia `payments`.

### Defecto 4 — Monto libre sin validación de negocio

`total_adeudo_centavos` no se valida contra ningún saldo real de `charges` del alumno.
Un administrador puede crear un plan de $1 para una deuda real de $50,000 sin que el sistema
lo detecte. No hay validación de mínimo, máximo, ni correlación con el estado de cuenta.

---

## Decisión

**Los planes de pago dejan de generar registros en `payment_plan_installments` y pasan a
generar `Charges` reales en el ledger existente, usando un `concept_type` nuevo: `'cuota_plan'`.**

El nuevo flujo al crear un plan de pago:

1. Se crea el registro cabecera en `payment_plans` (tabla existente, sin eliminar).
2. Por cada cuota, en lugar de insertar en `payment_plan_installments`, se inserta un `Charge`
   real en la tabla `charges` con:
   - `concept_id` apuntando a un concepto de tipo `'cuota_plan'` (nuevo valor en
     `concepts.tipo`, que hoy admite `'colegiatura'`, `'inscripcion'`, `'extra'`)
   - `fecha_vencimiento` calculada igual que hoy (base + `i * diasFrec`)
   - `monto_base_centavos` = `montoPorCuota`
   - `estado = 'pendiente'`
   - Una FK nueva en `charges`: `plan_id` → `payment_plans.id` (nullable, para que los
     charges normales no se vean afectados)
3. `payment_plan_installments` se mantiene en el schema para no romper datos existentes,
   pero las nuevas cuotas no se escriben ahí.

El pago de una cuota de plan pasa a ser idéntico al pago de cualquier `Charge`:
`POST /api/guardian/pagar` con el `charge_id` correspondiente. No se necesita el endpoint
especializado `POST /api/planes-pago/cuotas/:cuotaId/pagar`.

La mora deja de requerir código nuevo: el mecanismo de recargos (`recargo_aplicado_centavos`
en `charges`) ya existe y aplica a cualquier charge pendiente vencido. Si el campus tiene
reglas de recargo configuradas, las cuotas del plan las heredan automáticamente.

La bandeja de excepciones de conciliación puede aplicar pagos SPEI a cuotas de un plan
sin ningún código nuevo, porque las cuotas son `charges` normales.

### Alcance exacto del cambio

| Componente | Acción |
|---|---|
| `concepts.tipo` | Agregar valor `'cuota_plan'` al dominio documentado |
| `charges` | Agregar columna nullable `plan_id INTEGER REFERENCES payment_plans(id)` |
| `POST /api/planes-pago` | Reemplazar INSERT en `payment_plan_installments` por INSERT en `charges`; ver reglas de origen del monto |
| `GET /api/planes-pago/:campusId` | Leer cuotas desde `charges WHERE plan_id = pp.id` en lugar de `payment_plan_installments` |
| `POST /api/planes-pago/cuotas/:cuotaId/pagar` | Deprecar; el pago ocurre por el flujo normal de `charges` |
| `PATCH /api/planes-pago/:id/cancelar` | Nuevo endpoint; requiere motivo obligatorio; ver reglas de cancelación |
| `payment_plan_installments` | Mantener tabla; no escribir nuevos registros en ella |
| Datos de prueba existentes | Migrar o truncar (ver Consecuencias) |

---

## Origen del monto — regla obligatoria

Esta sección cierra el Defecto 4. El `POST /api/planes-pago` distingue dos modos mutuamente
excluyentes según si el plan reestructura deuda existente o formaliza un acuerdo a futuro.
**El monto libre (`total_adeudo_centavos` escrito por el administrador sin fuente validada)
queda prohibido en ambos modos.**

### Modo A — Reestructuración de Charges existentes

Se usa cuando el alumno ya tiene deuda vencida o próxima a vencer y la escuela negocia
convertirla en cuotas (convenio de pago, plan de diferimiento).

**Contrato del endpoint:**

```typescript
// Body requerido en Modo A
{
  charge_ids: number[],          // ← obligatorio; mínimo 1; todos del mismo tenant
  monto_inicial_centavos?: number, // enganche opcional, validado contra suma de charges
  numero_pagos: number,
  frecuencia: 'mensual' | 'quincenal' | 'semanal',
  fecha_inicio: string,          // ISO date
  recargo_centavos?: number,     // si aplica mora o interés; debe ser > 0 y estar en observaciones
  observaciones: string          // obligatorio cuando recargo_centavos > 0
}
// Prohibido: total_adeudo_centavos como campo libre
```

**Invariantes que el servidor debe verificar antes de COMMIT:**

1. Todos los `charge_ids` pertenecen al mismo `tenant_id` y `student_id` del JWT.
   Cualquier `charge_id` de otro tenant o alumno → HTTP 403.
2. Todos los `charge_ids` tienen `estado IN ('pendiente', 'parcial')`.
   Un charge ya `'pagado'` o `'cancelado'` no puede reestructurarse → HTTP 422.
3. `total_adeudo_centavos` del plan = `SUM(charges.monto_base_centavos) + recargo_centavos`.
   Si el servidor calcula un total distinto al que produciría las cuotas → HTTP 422 con diff.
4. `SUM(cuotas nuevas) = total_adeudo_centavos - monto_inicial_centavos` exactamente,
   salvo redondeo de centavo en la última cuota (ajuste permitido: ±1 centavo por cuota,
   absorbido en la última cuota del plan).

**Escrituras dentro de una sola transacción:**

```sql
BEGIN;

-- 1. Crear cabecera del plan
INSERT INTO payment_plans (..., tipo_origen, charge_ids_origen)
VALUES (..., 'reestructuracion', $charge_ids_json)
RETURNING id AS plan_id;

-- 2. Cancelar los Charges originales (uno por uno para que cada UPDATE sea atómico)
UPDATE charges
SET estado = 'cancelado', updated_at = NOW()
WHERE id = ANY($charge_ids) AND tenant_id = $tenant_id;

-- 3. Registrar en audit_log por cada Charge cancelado
INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
SELECT $tenant_id, $user_id, 'charge_cancelado_por_plan',
       'charge', id,
       jsonb_build_object('plan_id', $plan_id, 'motivo', 'reestructurado en plan de pago')
FROM charges WHERE id = ANY($charge_ids);

-- 4. Generar los Charges de cuota_plan
INSERT INTO charges (tenant_id, student_id, concept_id, plan_id, fecha_emision,
                     fecha_vencimiento, monto_base_centavos, estado)
VALUES (...) -- una fila por cuota

COMMIT;
```

> **Nota:** Si `recargo_centavos > 0`, el campo `observaciones` del plan es obligatorio
> y debe incluir la justificación del recargo. El AuditLog del paso 3 incluye también
> `recargo_centavos` en el metadata para trazabilidad.

**Nuevo campo en `payment_plans`:** `tipo_origen VARCHAR(20) DEFAULT 'futuro'` con valores
`'reestructuracion'` y `'futuro'` (ver Modo B). Campo `charge_ids_origen JSONB` guarda
el array de IDs originales como referencia histórica inmutable.

---

### Modo B — Acuerdo a futuro (sin deuda vencida)

Se usa cuando la escuela negocia un plan de pagos antes de que exista deuda, por ejemplo
para un alumno nuevo o para fraccionar una inscripción que aún no está emitida.

**Regla:** Las cuotas nuevas deben generarse exactamente igual que cualquier generación
de cargos por plantilla del sistema: a partir de un `concept_id` validado que pertenece
al tenant, con `monto_base_centavos` tomado de ese concepto (o del monto que el concepto
permite dentro de sus reglas de periodicidad). **No se acepta un número libre del
administrador sin anclaje a un concepto.**

```typescript
// Body requerido en Modo B
{
  concept_id: number,            // ← obligatorio; concepto del tenant que origina el plan
  numero_pagos: number,
  frecuencia: 'mensual' | 'quincenal' | 'semanal',
  fecha_inicio: string,
  monto_inicial_centavos?: number,  // enganche; debe ser < monto total del concepto
  student_id: number,
  guardian_id?: number,
  observaciones?: string
}
// Prohibido: total_adeudo_centavos sin concept_id
```

El servidor deriva `total_adeudo_centavos = concept.monto_centavos` (el monto registrado
en el concepto, no lo que escriba el admin). El campo `tipo_origen = 'futuro'` en la
cabecera del plan.

**Invariantes:**

1. `concept_id` pertenece al mismo `campus_id` y `tenant_id` del JWT → HTTP 403 si no.
2. `concept.tipo` ≠ `'cuota_plan'` (un plan no puede originarse en otro plan) → HTTP 422.
3. `monto_inicial_centavos < concept.monto_centavos` si se proporciona → HTTP 422 si no.

---

### Tabla resumen: qué acepta el servidor en cada modo

| Campo en body | Modo A (reestructuración) | Modo B (futuro) |
|---|---|---|
| `charge_ids` | **Obligatorio** | Prohibido (causa error 400) |
| `concept_id` | Prohibido (causa error 400) | **Obligatorio** |
| `total_adeudo_centavos` libre | Prohibido | Prohibido |
| `recargo_centavos` | Opcional (requiere `observaciones`) | Prohibido |
| `student_id` | Se infiere de los charges | Obligatorio |

El servidor detecta el modo por la presencia de `charge_ids` vs. `concept_id` en el body.
Enviar ambos o ninguno → HTTP 400 `"El plan debe especificar charge_ids (reestructuración) o concept_id (futuro), no ambos ni ninguno"`.

---

## Reglas de cancelación de un plan

La cancelación opera a nivel de la cabecera del plan y de sus charges pendientes.
Ambas escrituras ocurren en una sola transacción.

**Endpoint:** `PATCH /api/planes-pago/:id/cancelar`

**Body requerido:**

```typescript
{
  motivo: string   // obligatorio; mínimo 10 caracteres; igual que condonaciones
}
```

**Invariante de autorización:** Solo puede cancelar un plan el mismo `tenant_id` que lo
creó. Cancelar un plan ajeno → HTTP 403.

**Invariante de estado:** Solo se puede cancelar un plan en `estado = 'activo'`. Un plan
ya `'cancelado'` → HTTP 409 `"El plan ya está cancelado"`.

**Escrituras dentro de una sola transacción:**

```sql
BEGIN;

-- 1. Actualizar cabecera del plan
UPDATE payment_plans
SET estado = 'cancelado', updated_at = NOW()
WHERE id = $plan_id AND tenant_id = $tenant_id AND estado = 'activo';
-- Si 0 filas afectadas → ROLLBACK + HTTP 409

-- 2. Cancelar únicamente las cuotas pendientes; las pagadas permanecen intactas
UPDATE charges
SET estado = 'cancelado', updated_at = NOW()
WHERE plan_id = $plan_id AND estado = 'pendiente';

-- 3. Registrar en audit_log
INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
VALUES ($tenant_id, $user_id, 'plan_cancelado', 'payment_plan', $plan_id,
        jsonb_build_object(
          'motivo', $motivo,
          'cuotas_canceladas', (SELECT COUNT(*) FROM charges
                                 WHERE plan_id = $plan_id AND estado = 'cancelado'
                                   AND updated_at >= NOW() - INTERVAL '5 seconds'),
          'cuotas_pagadas_preservadas', (SELECT COUNT(*) FROM charges
                                          WHERE plan_id = $plan_id AND estado = 'pagado')
        ));

COMMIT;
```

**Estado final después de cancelación:**

| Objeto | Estado antes | Estado después |
|---|---|---|
| `payment_plans` cabecera | `'activo'` | `'cancelado'` |
| `charges` cuotas pendientes | `'pendiente'` | `'cancelado'` |
| `charges` cuotas ya pagadas | `'pagado'` | `'pagado'` (sin cambio) |
| `audit_log` | — | 1 entrada con motivo y conteos |

> **Nota de consistencia con condonaciones:** El campo `motivo` sigue exactamente el mismo
> contrato que ya exige el endpoint de condonaciones en este proyecto: string obligatorio,
> mínimo 10 caracteres, registrado en `audit_log.metadata.motivo`. No se introduce un
> contrato nuevo.

---

## Alternativas descartadas

### Alternativa A — Mantener el sistema paralelo tal como está

Agregar los cuatro defectos a la lista de deuda técnica y dejarlos para después.

**Por qué se descarta:** Los defectos no son cosméticos. El estado de cuenta, el semáforo de
riesgo y la bandeja de excepciones ya están construidos sobre `charges`. Mantener dos sistemas
paralelos significa que cualquier feature nuevo que lea el ledger (notificaciones de vencimiento,
corte de acceso por mora, reportes fiscales) tiene que ser implementado dos veces, o
deliberadamente ignora a los alumnos con plan de pago. El costo de integrar crece con cada
feature nuevo que se construya sobre esta base.

### Alternativa B — Agregar un cron de mora sin integrar al ledger

Mantener `payment_plan_installments` como está y agregar un job periódico que cambie
`estado='pendiente'` a `estado='vencida'` cuando `fecha_vencimiento < NOW()`.

**Por qué se descarta:** Resuelve solo el Defecto 2 (detección de mora) y solo a nivel de
reporting. No resuelve el Defecto 1 (desconexión del ledger), el Defecto 3 (cancelación), ni
el Defecto 4 (monto libre). El estado de cuenta y la conciliación siguen ciegos a las cuotas.
Agrega complejidad operacional (un proceso nuevo que puede fallar silenciosamente) sin reducir
la deuda estructural. Sería un parche sobre un problema de diseño.

### Alternativa C — Tabla intermedia `plan_charges` que linkea ambos mundos

Mantener `payment_plan_installments` y agregar una tabla join que asocie cada cuota con un
`charge` existente, generado externamente.

**Por qué se descarta:** La complejidad de mantener dos representaciones del mismo dato
(la cuota del plan y su charge gemelo) introduce riesgo de inconsistencia: ¿qué pasa si el
charge se paga por conciliación pero `payment_plan_installments.estado` no se actualiza?
Se gana la visibilidad en el ledger al costo de un invariante adicional que el sistema tendría
que garantizar en toda escritura financiera. La alternativa elegida (generar charges directamente)
logra lo mismo sin el invariante.

---

## Consecuencias

### Se gana

- **Estado de cuenta correcto sin código nuevo.** Las cuotas del plan aparecen en el estado
  de cuenta del alumno automáticamente porque son `charges` normales.

- **Mora automática sin scheduler.** Los mecanismos de recargo existentes sobre `charges`
  aplican a las cuotas del plan sin código adicional. `cuotas_vencidas` en el dashboard
  deja de ser un literal `0` y se puede calcular con el mismo `COUNT` que ya existe.

- **Conciliación SPEI funciona sin código nuevo.** La bandeja de excepciones puede aplicar
  una transferencia bancaria a una cuota de plan exactamente igual que a cualquier otro cargo.

- **Semáforo de riesgo incluye deuda de planes.** El semáforo suma
  `charges.monto_base_centavos WHERE estado='pendiente'`; con `plan_id` nullable, las cuotas
  del plan quedan incluidas sin tocar la query del semáforo.

- **Un solo flujo de pago.** El portal de padres y cualquier integración futura usan
  `POST /api/guardian/pagar` para todo. No hay rutas especializadas por tipo de adeudo.

- **Cancelación de plan posible con semántica clara.** Cancelar un plan puede significar
  cambiar `charges WHERE plan_id = X AND estado = 'pendiente'` a `estado = 'cancelado'`.
  Las cuotas ya pagadas (`estado = 'pagado'`) quedan intactas como registro histórico.

### Se pierde / Se asume

- **Hay que migrar los datos de prueba existentes.** Los planes de demostración insertados
  en `payment_plan_installments` por el seed actual no son visibles en el nuevo ledger.
  Se requiere un script de migración o truncar `payment_plan_installments` y recrear los
  planes de demo como charges. Esto es trabajo puntual, no deuda recurrente.

- **`payment_plan_installments` queda como tabla huérfana temporal.** Se mantiene para
  no romper datos existentes, pero no recibe nuevas escrituras. En un ciclo posterior
  puede eliminarse una vez confirmado que ningún dato histórico depende de ella. Por ahora
  se documenta como _legacy-read-only_.

- **`POST /api/planes-pago/cuotas/:cuotaId/pagar` queda deprecado.** Si el frontend lo
  llama, hay que actualizarlo para usar el endpoint de `charges`. El cliente
  `client/src/pages/planes-pago.tsx` (PL-05 en la matriz) debe ser ajustado.

- **El concepto `'cuota_plan'` debe excluirse de ciertos reportes fiscales.** Dependiendo
  de la configuración de CFDI, las cuotas de un convenio pueden tener tratamiento fiscal
  distinto a una colegiatura normal. El motor fiscal (`shared/fiscal-engine.ts`) deberá
  distinguir `concept.tipo === 'cuota_plan'` si aplica.

---

## Checklist de implementación (para la tarea que ejecute este ADR)

### Schema y migración
- [ ] Migración SQL: `ALTER TABLE charges ADD COLUMN plan_id INTEGER REFERENCES payment_plans(id)`
- [ ] Migración SQL: `ALTER TABLE payment_plans ADD COLUMN tipo_origen VARCHAR(20) DEFAULT 'futuro'`
- [ ] Migración SQL: `ALTER TABLE payment_plans ADD COLUMN charge_ids_origen JSONB` (referencia histórica inmutable para Modo A)
- [ ] Concepto sentinel por campus: INSERT de un concepto `tipo='cuota_plan'` si no existe al crear el primer plan

### Endpoint: crear plan (`POST /api/planes-pago`)
- [ ] Detectar modo por presencia de `charge_ids` vs. `concept_id`; rechazar si llegan ambos o ninguno → HTTP 400
- [ ] **Modo A:** validar que todos los `charge_ids` pertenecen al mismo `tenant_id` y `student_id`; cualquier cruce → HTTP 403
- [ ] **Modo A:** validar que todos los `charge_ids` tienen `estado IN ('pendiente', 'parcial')`; cualquier otro estado → HTTP 422
- [ ] **Modo A:** validar que `SUM(cuotas nuevas) = SUM(charges originales) + recargo_centavos`; diff → HTTP 422
- [ ] **Modo A:** rechazar `recargo_centavos > 0` sin `observaciones` → HTTP 400
- [ ] **Modo B:** validar que `concept_id` pertenece al mismo `campus_id` y `tenant_id` → HTTP 403 si no
- [ ] **Modo B:** rechazar `concept.tipo === 'cuota_plan'` como origen → HTTP 422
- [ ] Dentro de una sola transacción: (A) UPDATE charges originales a `'cancelado'`, (B) INSERT audit_log por cada charge cancelado, (C) INSERT charges de `cuota_plan` con `plan_id`; COMMIT al final (ver ADR-001)
- [ ] Reemplazar loop de INSERT en `payment_plan_installments` por loop de INSERT en `charges`

### Endpoint: listar planes (`GET /api/planes-pago/:campusId`)
- [ ] Leer cuotas desde `charges WHERE plan_id = pp.id` en lugar de `payment_plan_installments`

### Endpoint: cancelar plan (`PATCH /api/planes-pago/:id/cancelar`) — nuevo
- [ ] Validar `motivo` obligatorio, mínimo 10 caracteres → HTTP 400 si falta o es corto
- [ ] Validar que el plan pertenece al `tenant_id` del JWT → HTTP 403 si no
- [ ] Validar que `payment_plans.estado = 'activo'` → HTTP 409 si ya está cancelado
- [ ] Dentro de una sola transacción: (A) `UPDATE payment_plans SET estado='cancelado'`, (B) `UPDATE charges SET estado='cancelado' WHERE plan_id=X AND estado='pendiente'` — las cuotas `'pagado'` no se tocan, (C) INSERT en `audit_log` con `motivo`, `cuotas_canceladas` y `cuotas_pagadas_preservadas` en metadata
- [ ] `payment_plans.estado` pasa a `'cancelado'`; nunca queda en `'activo'` después de cancelado

### Endpoint deprecado
- [ ] `POST /api/planes-pago/cuotas/:cuotaId/pagar`: responder HTTP 410 + `"Use POST /api/guardian/pagar con el charge_id de la cuota"`

### Frontend
- [ ] `client/src/pages/planes-pago.tsx`: cambiar llamada de pago al endpoint estándar de `charges`

### Datos y pruebas
- [ ] Script de migración de datos de demo existentes en `payment_plan_installments` (o truncar y re-seedear como charges)
- [ ] Actualizar la matriz de pruebas `docs/qa/matriz-de-pruebas.md` (PL-01 a PL-05 + casos de cancelación)
- [ ] Pruebas: Modo A crear plan → charges originales cancelados + audit_log + cuotas nuevas en ledger
- [ ] Pruebas: Modo B crear plan → cuotas generadas a partir del concepto, no monto libre
- [ ] Pruebas: cancelar plan → `payment_plans.estado='cancelado'` + cuotas pendientes canceladas + cuotas pagadas intactas + audit_log con motivo
- [ ] Pruebas: cancelar sin motivo → HTTP 400; cancelar plan ajeno → HTTP 403; cancelar plan ya cancelado → HTTP 409
- [ ] Verificar que `shared/fiscal-engine.ts` distingue `'cuota_plan'` si emite CFDI

---

## Patrón de referencia

Este ADR sigue el principio documentado en ADR-001: **las escrituras financieras secundarias
no crean estructuras paralelas al ledger**. Un plan de pago es una intención de cobro; los
charges son la materialización de esa intención. Separar ambas capas sin enlace es equivalente
al bug del rollback silencioso: el sistema reporta éxito pero la escritura que importa
(la del ledger) nunca ocurrió.
