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
| `POST /api/planes-pago` | Reemplazar INSERT en `payment_plan_installments` por INSERT en `charges` |
| `GET /api/planes-pago/:campusId` | Leer cuotas desde `charges WHERE plan_id = pp.id` en lugar de `payment_plan_installments` |
| `POST /api/planes-pago/cuotas/:cuotaId/pagar` | Deprecar; el pago ocurre por el flujo normal de `charges` |
| `payment_plan_installments` | Mantener tabla; no escribir nuevos registros en ella |
| Datos de prueba existentes | Migrar o truncar (ver Consecuencias) |

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

- [ ] Migración SQL: `ALTER TABLE charges ADD COLUMN plan_id INTEGER REFERENCES payment_plans(id)`
- [ ] Concepto sentinel por campus: INSERT de un concepto `tipo='cuota_plan'` si no existe
- [ ] `POST /api/planes-pago`: reemplazar loop de INSERT en `payment_plan_installments`
      por loop de INSERT en `charges` con `plan_id` y `concept_id` del concepto sentinel
- [ ] `GET /api/planes-pago/:campusId`: leer cuotas desde `charges WHERE plan_id = pp.id`
- [ ] `POST /api/planes-pago/cuotas/:cuotaId/pagar`: deprecar con HTTP 410 + mensaje
      `"Use POST /api/guardian/pagar con el charge_id de la cuota"`
- [ ] Frontend `planes-pago.tsx`: cambiar llamada de pago al endpoint estándar
- [ ] Script de migración de datos de demo (o truncar y re-seedear)
- [ ] Actualizar la matriz de pruebas `docs/qa/matriz-de-pruebas.md`
- [ ] Pruebas unitarias e integración para los escenarios: crear plan → charges generados,
      pagar cuota → charge estado='pagado', cancelar plan → charges pendientes cancelados
- [ ] Verificar que `shared/fiscal-engine.ts` distingue `'cuota_plan'` si emite CFDI

---

## Patrón de referencia

Este ADR sigue el principio documentado en ADR-001: **las escrituras financieras secundarias
no crean estructuras paralelas al ledger**. Un plan de pago es una intención de cobro; los
charges son la materialización de esa intención. Separar ambas capas sin enlace es equivalente
al bug del rollback silencioso: el sistema reporta éxito pero la escritura que importa
(la del ledger) nunca ocurrió.
