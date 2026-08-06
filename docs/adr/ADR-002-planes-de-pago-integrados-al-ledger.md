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
3. El monto base del plan se calcula usando el **saldo pendiente real** de cada charge,
   no el monto original:
   ```sql
   -- Saldo pendiente por charge_id
   SELECT c.id,
          c.monto_base_centavos
          - COALESCE(SUM(pa.amount_centavos), 0) AS saldo_pendiente_centavos
   FROM charges c
   LEFT JOIN payment_applications pa ON pa.charge_id = c.id
   WHERE c.id = ANY($charge_ids)
   GROUP BY c.id, c.monto_base_centavos
   ```
   Para charges en `estado='pendiente'` sin PaymentApplications, `saldo_pendiente = monto_base_centavos` (igual que antes).
   Para charges en `estado='parcial'`, `saldo_pendiente < monto_base_centavos`; usar **siempre** el saldo pendiente.
   El servidor rechaza con HTTP 422 si algún charge tiene `saldo_pendiente <= 0` (edge case: charge marcado 'parcial' por error sin aplicaciones reales).

4. `SUM(saldos_pendientes) + recargo_centavos` debe coincidir exactamente con
   `SUM(cuotas nuevas) + monto_inicial_centavos`, salvo redondeo absorbido en la
   última cuota del plan (tolerancia: ±1 centavo). Diff fuera de tolerancia → HTTP 422
   con body `{ diff_centavos, saldo_calculado, total_cuotas }`.

> **Por qué saldo pendiente y no monto original:** Un charge en `estado='parcial'`
> significa que parte de él ya fue cobrada y registrada en `payment_applications`.
> Reestructurar por el monto original duplicaría la deuda ya pagada. El ledger debe
> reflejar únicamente lo que queda por cobrar.

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
Todas las escrituras ocurren en una sola transacción.

**Endpoint:** `PATCH /api/planes-pago/:id/cancelar`

**Invariante de autorización:** Solo puede cancelar un plan el mismo `tenant_id` que lo
creó. Cancelar un plan ajeno → HTTP 403.

**Invariante de estado:** Solo se puede cancelar un plan en `estado = 'activo'`. Un plan
ya `'cancelado'` → HTTP 409 `"El plan ya está cancelado"`.

### Decisión: ¿qué pasa con la deuda pendiente al cancelar un plan de reestructuración?

Cuando un plan de `tipo_origen='reestructuracion'` se cancela a medio camino, las cuotas
pendientes representan deuda real que la escuela negoció y que los charges originales ya
no reflejan (fueron cancelados al crear el plan). Dejar esa deuda en el aire sería un
efecto secundario silencioso: el ledger quedaría limpio para ese alumno sin que nadie haya
decidido perdonarlo.

**Decisión adoptada: el campo `destino_saldo_pendiente` en el body es obligatorio para
planes de `tipo_origen='reestructuracion'`. El servidor exige que el administrador
elija explícitamente entre dos rutas.**

Para planes de `tipo_origen='futuro'`, este campo no aplica: cancelar solo anula cuotas
futuras que nunca representaron deuda preexistente, sin reinstatement ni condonación.

#### Opción `'reinstalar'` — la deuda vuelve al ledger como un nuevo charge

La escuela quiere seguir cobrando la deuda por otra vía (un nuevo plan, cobro directo,
proceso legal). El servidor crea un único charge nuevo que consolida el saldo pendiente
de todas las cuotas del plan que quedaban sin pagar.

```typescript
// Body para planes tipo_origen='reestructuracion'
{
  motivo: string,                        // obligatorio; ≥ 10 chars
  destino_saldo_pendiente: 'reinstalar', // obligatorio
  // No se requiere campo adicional; la fecha de vencimiento del nuevo charge = hoy
}
```

#### Opción `'condonar'` — la deuda se perdona de forma explícita y auditada

La escuela decide absorber la deuda restante (acuerdo especial, insolvencia verificada,
error del plan original). Requiere `motivo_condonacion` adicional igual que cualquier
condonación del sistema.

```typescript
// Body para planes tipo_origen='reestructuracion' con condonación
{
  motivo: string,                       // obligatorio; ≥ 10 chars
  destino_saldo_pendiente: 'condonar',  // obligatorio
  motivo_condonacion: string,           // obligatorio adicional; ≥ 10 chars
}
```

Omitir `destino_saldo_pendiente` en un plan de reestructuración → HTTP 400
`"Los planes de reestructuración requieren destino_saldo_pendiente: 'reinstalar' | 'condonar'"`.

**Escrituras dentro de una sola transacción (plan de reestructuración — opción reinstalar):**

```sql
BEGIN;

-- 1. Actualizar cabecera del plan
UPDATE payment_plans
SET estado = 'cancelado', updated_at = NOW()
WHERE id = $plan_id AND tenant_id = $tenant_id AND estado = 'activo';
-- 0 filas → ROLLBACK + HTTP 409

-- 2. Calcular saldo pendiente de las cuotas no pagadas
-- (este valor se calcula en la capa de aplicación antes del BEGIN)
-- saldo_reinstalar = SUM(monto_base_centavos) WHERE plan_id=$plan_id AND estado='pendiente'

-- 3. Cancelar las cuotas pendientes del plan
UPDATE charges
SET estado = 'cancelado', updated_at = NOW()
WHERE plan_id = $plan_id AND estado = 'pendiente';

-- 4. Crear nuevo charge que reinstala la deuda
INSERT INTO charges (
  tenant_id, student_id, concept_id, plan_id,
  fecha_emision, fecha_vencimiento,
  monto_base_centavos, estado
)
SELECT
  $tenant_id, pp.student_id,
  -- concept_id: usar el mismo concepto del primer charge original, o un concepto
  -- de tipo 'extra' genérico del campus si el original ya no existe
  (SELECT concept_id FROM charges
   WHERE id = (pp.charge_ids_origen->>0)::int),
  NULL,                         -- plan_id NULL: este charge ya no pertenece al plan
  NOW()::date, NOW()::date,     -- vencido desde hoy para que aparezca en el semáforo
  $saldo_reinstalar, 'pendiente'
FROM payment_plans pp WHERE pp.id = $plan_id;

-- 5. Registrar en audit_log (una entrada para el plan, con toda la trazabilidad)
INSERT INTO audit_log (tenant_id, user_id, action, entity_type, entity_id, metadata)
VALUES ($tenant_id, $user_id, 'plan_cancelado_reinstalado', 'payment_plan', $plan_id,
        jsonb_build_object(
          'motivo', $motivo,
          'destino_saldo_pendiente', 'reinstalar',
          'saldo_reinstalado_centavos', $saldo_reinstalar,
          'nuevo_charge_id', <id del charge creado en paso 4>,
          'cuotas_canceladas', <count>,
          'cuotas_pagadas_preservadas', <count>
        ));

COMMIT;
```

**Escrituras dentro de una sola transacción (plan de reestructuración — opción condonar):**

Igual que el bloque anterior pero sin el paso 4 (no se crea charge nuevo) y con:
```sql
-- Paso 5 (audit_log)
jsonb_build_object(
  'motivo', $motivo,
  'destino_saldo_pendiente', 'condonar',
  'motivo_condonacion', $motivo_condonacion,
  'monto_condonado_centavos', $saldo_que_se_perdona,
  'cuotas_canceladas', <count>,
  'cuotas_pagadas_preservadas', <count>
)
```

**Escrituras dentro de una sola transacción (plan de tipo `futuro`):**

No requiere `destino_saldo_pendiente`. El flujo es idéntico al bloque original sin paso 4.

**Estado final garantizado por la transacción:**

| Objeto | Plan `'futuro'` | Plan `'reestructuracion'` — reinstalar | Plan `'reestructuracion'` — condonar |
|---|---|---|---|
| `payment_plans` cabecera | `'cancelado'` | `'cancelado'` | `'cancelado'` |
| Cuotas pendientes | `'cancelado'` | `'cancelado'` | `'cancelado'` |
| Cuotas ya pagadas | `'pagado'` sin cambio | `'pagado'` sin cambio | `'pagado'` sin cambio |
| Nuevo charge reinstatement | No aplica | Creado, `estado='pendiente'` | No se crea |
| `audit_log` | 1 entrada | 1 entrada con `nuevo_charge_id` | 1 entrada con `monto_condonado` |

> **Por qué esta decisión y no la alternativa de reinstatement automático siempre:**
> El reinstatement automático sin decisión explícita del admin produce el mismo problema
> que queríamos evitar en el Defecto 4: deuda que aparece en el ledger sin que un humano
> haya revisado si el monto y el concepto son correctos. Un plan puede haberse cancelado
> porque el monto fue negociado diferente; el reinstatement automático instalaría el monto
> incorrecto. Forzar la elección en el mismo request garantiza que el administrador sabe
> exactamente qué está autorizando.

> **Nota de consistencia con condonaciones:** Tanto `motivo` como `motivo_condonacion`
> siguen el mismo contrato que ya exige el endpoint de condonaciones: string obligatorio,
> mínimo 10 caracteres, registrado íntegro en `audit_log.metadata`. No se introduce
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
- [ ] **Modo A — saldo pendiente:** para cada `charge_id`, calcular `saldo_pendiente = monto_base_centavos - COALESCE(SUM(payment_applications.amount_centavos), 0)`; nunca usar `monto_base_centavos` directamente cuando `estado='parcial'`; rechazar con HTTP 422 si `saldo_pendiente <= 0` en algún charge
- [ ] **Modo A — invariante de suma:** `SUM(saldos_pendientes) + recargo_centavos` debe coincidir con `SUM(cuotas nuevas) + monto_inicial_centavos` dentro de la tolerancia de ±1 centavo absorbido en la última cuota; diff fuera de tolerancia → HTTP 422 con `{ diff_centavos, saldo_calculado, total_cuotas }`
- [ ] **Modo A:** rechazar `recargo_centavos > 0` sin `observaciones` → HTTP 400
- [ ] **Modo B:** validar que `concept_id` pertenece al mismo `campus_id` y `tenant_id` → HTTP 403 si no
- [ ] **Modo B:** rechazar `concept.tipo === 'cuota_plan'` como origen → HTTP 422
- [ ] Dentro de una sola transacción: (A) UPDATE charges originales a `'cancelado'`, (B) INSERT audit_log por cada charge cancelado (incluye `saldo_pendiente_centavos` en metadata cuando el charge era `'parcial'`), (C) INSERT charges de `cuota_plan` con `plan_id`; COMMIT al final (ver ADR-001)
- [ ] Reemplazar loop de INSERT en `payment_plan_installments` por loop de INSERT en `charges`

### Endpoint: listar planes (`GET /api/planes-pago/:campusId`)
- [ ] Leer cuotas desde `charges WHERE plan_id = pp.id` en lugar de `payment_plan_installments`

### Endpoint: cancelar plan (`PATCH /api/planes-pago/:id/cancelar`) — nuevo
- [ ] Validar `motivo` obligatorio, mínimo 10 caracteres → HTTP 400 si falta o es corto
- [ ] Validar que el plan pertenece al `tenant_id` del JWT → HTTP 403 si no
- [ ] Validar que `payment_plans.estado = 'activo'` → HTTP 409 si ya está cancelado
- [ ] **Planes `tipo_origen='reestructuracion'`:** exigir `destino_saldo_pendiente: 'reinstalar' | 'condonar'` → HTTP 400 si ausente o valor inválido
- [ ] **`destino_saldo_pendiente='condonar'`:** exigir `motivo_condonacion` (string, ≥ 10 chars) → HTTP 400 si ausente
- [ ] **`destino_saldo_pendiente='reinstalar'`:** dentro de la transacción, crear un nuevo charge con `monto_base_centavos = SUM(cuotas pendientes)`, `estado='pendiente'`, `fecha_vencimiento=NOW()::date`, `plan_id=NULL`; incluir `nuevo_charge_id` en el audit_log
- [ ] **`destino_saldo_pendiente='condonar'`:** no crear charge nuevo; registrar `monto_condonado_centavos` en audit_log
- [ ] **Planes `tipo_origen='futuro'`:** no requiere `destino_saldo_pendiente`; el flujo es: UPDATE plan a `'cancelado'`, UPDATE cuotas pendientes a `'cancelado'`, INSERT audit_log
- [ ] En todos los casos: cuotas `'pagado'` permanecen intactas sin cambio de estado
- [ ] `payment_plans.estado` pasa a `'cancelado'`; nunca queda en `'activo'` después de cancelado

### Endpoint deprecado
- [ ] `POST /api/planes-pago/cuotas/:cuotaId/pagar`: responder HTTP 410 + `"Use POST /api/guardian/pagar con el charge_id de la cuota"`

### Frontend
- [ ] `client/src/pages/planes-pago.tsx`: cambiar llamada de pago al endpoint estándar de `charges`

### Datos y pruebas
- [ ] Script de migración de datos de demo existentes en `payment_plan_installments` (o truncar y re-seedear como charges)
- [ ] Actualizar la matriz de pruebas `docs/qa/matriz-de-pruebas.md` (PL-01 a PL-05 + casos de cancelación)
- [ ] **Prueba Modo A — cargo completamente pendiente:** crear plan con un charge en `estado='pendiente'`; confirmar que `SUM(cuotas nuevas) = monto_base_centavos` del charge original
- [ ] **Prueba Modo A — cargo parcialmente pagado:** crear un charge con `monto_base_centavos=100_000`, registrar un PaymentApplication de `40_000`; reestructurar ese charge en un plan; confirmar que `SUM(cuotas nuevas) = 60_000` (saldo pendiente real), no `100_000` (monto original); confirmar que el charge original queda `'cancelado'` y el audit_log incluye `saldo_pendiente_centavos: 60000`
- [ ] **Prueba Modo A — suma incorrecta detectada:** enviar cuotas que sumen distinto al saldo pendiente → HTTP 422 con `diff_centavos` en la respuesta
- [ ] **Prueba Modo B:** crear plan con `concept_id` válido → cuotas generadas por `concept.monto_centavos`, no por monto libre
- [ ] **Prueba cancelación plan `futuro`:** cancelar → `payment_plans.estado='cancelado'`, cuotas pendientes `'cancelado'`, cuotas pagadas intactas, audit_log con motivo
- [ ] **Prueba cancelación plan `reestructuracion` — reinstalar:** cancelar con `destino_saldo_pendiente='reinstalar'`; confirmar que: `payment_plans.estado='cancelado'`, cuotas pendientes `'cancelado'`, nuevo charge creado con monto = saldo pendiente de cuotas canceladas, audit_log incluye `nuevo_charge_id`
- [ ] **Prueba cancelación plan `reestructuracion` — condonar:** cancelar con `destino='condonar'`; confirmar que: no se crea charge nuevo, audit_log incluye `monto_condonado_centavos` y `motivo_condonacion`
- [ ] **Prueba cancelación — errores de validación:** sin motivo → HTTP 400; plan ajeno → HTTP 403; plan ya cancelado → HTTP 409; plan `reestructuracion` sin `destino_saldo_pendiente` → HTTP 400
- [ ] **Prueba SPEI fuera de orden sobre charge cancelado por reestructuración:** dado un charge original en `estado='cancelado'` (cancelado al crear el plan), simular que llega un webhook SPEI con referencia que matchea ese charge; confirmar que el motor de conciliación (`POST /api/conciliacion/excepciones/resolver` o el proceso de auto-match) **no aplica** el pago al charge cancelado; confirmar que la `bank_transaction` queda en `estado_conciliacion='pendiente'` y aparece en el GET de excepciones para que el administrador decida manualmente
- [ ] Verificar que `shared/fiscal-engine.ts` distingue `'cuota_plan'` si emite CFDI

---

## Patrón de referencia

Este ADR sigue el principio documentado en ADR-001: **las escrituras financieras secundarias
no crean estructuras paralelas al ledger**. Un plan de pago es una intención de cobro; los
charges son la materialización de esa intención. Separar ambas capas sin enlace es equivalente
al bug del rollback silencioso: el sistema reporta éxito pero la escritura que importa
(la del ledger) nunca ocurrió.
