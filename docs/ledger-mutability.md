# Protección de cargos y pagos cerrados

## Contrato

`assertMutable` rechaza con `ClosedLedgerRecordError` (HTTP 409,
`LEDGER_RECORD_CLOSED`) los estados `aplicado`/`completado` y sus equivalentes
persistidos `pagado`/`exitoso`. También protege los estados terminales
`cancelado`, `reversado` y `fallido`. Se comprueban tanto `estado` como `status`.

La guarda se ejecuta después del bloqueo de la fila y antes de escribir, dentro
de la misma transacción. No se agregaron triggers, migraciones ni endpoints.
La respuesta es: «Este registro está cerrado; usa una reversa para corregirlo».
El cliente muestra la indicación de usar una reversa, sin mostrar el JSON crudo.

## Inventario de escrituras de aplicación

| Archivo | Mutación | Protección |
| --- | --- | --- |
| `server/routes/notifications.ts`, `server/lib/approved-charge-mutation.ts` | Aprobaciones de monto, vencimiento y eliminación de cargo | Lock por id/tenant/campus + guarda. Una negativa no aprueba ni notifica éxito. |
| `server/storage.ts` | Cambios de estado de cargo o pago | Lock + guarda + máquina de estados; contexto de tenant/campus cuando se suministra. |
| `server/routes/payments.ts` | Pago manual y pago de tutor | Lock + guarda antes de aplicaciones y cierre del cargo. |
| `server/routes/charges.ts` | Pago manual administrativo | Lock del cargo por tenant/campus + guarda. |
| `server/routes/guardian.ts` | Pago por lote del tutor | Lock + guarda por cargo. |
| `server/routes/admin.ts` | Aplicación de crédito familiar | Lock + guarda antes de cambiar el estado del cargo. |
| `server/routes/conciliacion.ts` | Caja, conciliación automática, supervisada y excepciones | Lock + guarda en caja y en el helper compartido de cierre. |
| `server/routes/misc.ts` | Reestructuración y cancelación de planes | Locks + guarda; cancelar un plan sólo modifica cuotas pendientes y preserva las pagadas. |
| `server/lib/surcharge-accrual.ts` | Recargo acumulado | Sólo cargos pendientes elegibles, bloqueados, con guarda. |
| `server/lib/scholarship-engine.ts` | Beca automática en cargos existentes | Sólo cargos pendientes/vencidos sin aplicaciones; lock + guarda por fila. |
| `server/lib/stripe-spei-settlement.ts` | Confirmación de pago pendiente SPEI y cierre de cargo | Pagos pendientes bloqueados + guarda del pago y del cargo. |

Las importaciones crean cargos/pagos, no actualizan ni eliminan registros
existentes. No hay endpoint de edición de monto/fecha o eliminación de pagos;
su única modificación existente es el cambio de estado. Los SQL de fixtures,
seed y limpieza de pruebas quedan fuera del enforcement de rutas de aplicación.

## Reversas

Se conserva `refund_payment` → `storage.updatePaymentStatus(..., "reversado")`:
únicamente un pago `exitoso` (o `completado`) puede pasar explícitamente a
`reversado`, con auditoría y bajo lock. No permite reabrirlo, editarlo ni repetir
la reversa. No se añadieron reversas de cargos, cascadas, ni cambios a las
aplicaciones del ledger; la máquina existente de cargos no tiene una reversa.

## Verificación sin escrituras en bases configuradas

- `server/safety-tests/closed-ledger-http.test.ts`: solicitudes HTTP a la ruta real
  de decisión, con conexión sustituida. Monto/fecha/borrado cerrados, rollback,
  permisos, tenant/campus, cambios de cargos abiertos, error de cancelación y
  despacho de reversa.
- `server/safety-tests/closed-ledger-storage.test.ts`: almacenamiento y máquina
  de estados reales con transacción sustituida; bloqueo de cambios e identidad
  en registros cerrados y éxito de la reversa auditada.
- `server/safety-tests/closed-ledger-ui.test.ts`: mensaje de acción para el
  conflicto cerrado; otros conflictos conservan su mensaje.
- Las expectativas de las suites con base de `state-machines.test.ts` y
  `pagar-manual.test.ts` se alinearon al nuevo error. Esas suites no se
  ejecutaron: escriben fixtures y la tarea no autoriza escrituras en la base.

No se inició el servidor completo para esta verificación: su arranque llama a
`initAuditRetryQueue`, que puede crear tablas. Las pruebas aisladas no prueban
la concurrencia real de PostgreSQL ni sustituyen un E2E de sesión autenticada.
La pantalla pública de acceso se comprobó sirviendo temporalmente el build
estático, sin API ni base de datos; no se verificó visualmente la sesión
autenticada ni el toast interactivo. El mensaje del toast se prueba en forma
aislada por el mismo cliente HTTP que usa la pantalla.

### Resultados de la verificación

- Reproducción previa en la ruta HTTP real con DB sustituida: cambiar monto,
  vencimiento o borrar un cargo pagado devolvía **200**, no 409.
- `npm run test:safety`:
  ```
  Test Files  6 passed (6)
       Tests  73 passed (73)
    Start at  23:06:49
    Duration  2.42s
  ```
  Es la suite aislada completa, no la suite con fixtures en PostgreSQL.
- `npm run check:routes`: 44 rutas / 44 entradas, correcto.
- `npm run check:migration-policy`: correcto, sin migraciones nuevas.
- `npm run build`: correcto; aviso de tamaño del bundle.
- `git diff --check`: correcto.
- `npm run check`: exit 2, **24 diagnósticos** tanto antes de editar la
  aplicación como después. La comparación ignorando únicamente números de
  línea/columna no muestra diferencias. En los archivos modificados persisten
  los mismos diagnósticos de `conciliacion.ts`, `misc.ts` y `payments.ts`;
  no se corrigieron porque no son parte de esta protección.

## Única consulta de diagnóstico ejecutada

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('charges', 'payments', 'students')
ORDER BY table_name, ordinal_position
```
