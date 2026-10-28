# Validación de entradas financieras

Base inspeccionada: `58b56c6`. Las líneas de este inventario corresponden a
esa base, antes de añadir validadores. Las verificaciones de pertenencia,
permisos y saldo no sustituyen a la validación sintáctica de las entradas.

## Inventario previo

| Archivo:línea | Método y ruta | Entradas / validación actual |
|---|---|---|
| server/routes/charges.ts:46 | POST /api/admin/concepts | Body copiado a storage; monto sin guarda financiera común antes de consultar campus. |
| server/routes/charges.ts:73 | POST /api/admin/charges/bulk | concept_id, fecha_emision y billing_period; comprueba campus, consulta alumnos y conceptos antes de resolver fecha. |
| server/routes/charges.ts:210 | POST /api/admin/cargos/generar-mensual | periodo; comprobaciones locales y generación desde conceptos almacenados. |
| server/routes/charges.ts:263 | POST /api/admin/cargos/extraordinario | student_id, concept_id, monto, vencimiento; presencia de monto, regex de fecha y motivo; convierte con parseFloat y redondeo. |
| server/routes/charges.ts:407 | POST /api/admin/cargos/desde-catalogo | producto_id, emisión y vencimiento; resolución institucional después de consultas. |
| server/routes/charges.ts:552 | POST /api/admin/charges/:chargeId/pagar-manual | chargeId convertido con parseInt; saldo calculado bajo bloqueo. |
| server/routes/payments.ts:86 | POST /api/payments/manual | Zod coerce para IDs e importe entero positivo; sin tope común. |
| server/routes/payments.ts:491 | POST /api/import/data/:category/:templateId | Archivo de adeudos/becas/familias; conversiones por fila, incluida parseFloat de porcentaje. |
| server/routes/guardian.ts:456 | POST /api/guardian/pagar | charge_ids; autenticación, pertenencia y saldo; importe derivado de cargos. |
| server/routes/guardian.ts:628 | POST /api/charges/generate | monto_manual en centavos, fechas, product_id/student_id; validaciones locales y calendario institucional. |
| server/routes/guardian.ts:1314 | POST /api/concepts | monto_centavos y datos del concepto; validación local. |
| server/routes/guardian.ts:1346 | PUT /api/concepts/:id | monto_centavos; validación local. |
| server/routes/guardian.ts:1481 | POST /api/payment-config/due-dates-complete | día/meses; validación del calendario institucional. |
| server/routes/guardian.ts:1529 | PUT /api/payment-config/due-dates-complete/:id | día/meses; validación del calendario institucional. |
| server/routes/guardian.ts:1650 | POST /api/payment-config/due-date-periods | inicio, fin y vencimiento; validación de períodos institucionales. |
| server/routes/guardian.ts:1710 | PUT /api/payment-config/due-date-periods/:id | inicio, fin y vencimiento; validación de períodos institucionales. |
| server/routes/guardian.ts:1833 | POST /api/payment-config/surcharge-rules-complete | porcentajes, importes y progresiones; validación propia del recargo. |
| server/routes/guardian.ts:1915 | PUT /api/payment-config/surcharge-rules-complete/:id | porcentajes, importes y progresiones; validación propia del recargo. |
| server/routes/guardian.ts:2060 | POST /api/payment-config/due-dates | ruta heredada bloqueada por legacyPaymentConfigWriteGone. |
| server/routes/guardian.ts:2094 | PUT /api/payment-config/due-dates/:id | ruta heredada bloqueada por legacyPaymentConfigWriteGone. |
| server/routes/guardian.ts:2186 | POST /api/payment-config/surcharge-rules | ruta heredada bloqueada; contiene validación local de porcentaje/monto. |
| server/routes/guardian.ts:2219 | PUT /api/payment-config/surcharge-rules/:id | ruta heredada bloqueada; contiene validación local de porcentaje/monto. |
| server/routes/admin.ts:1122 | POST /api/admin/family-credits/:creditId/aplicar | creditId/charge_id con parseInt e isNaN; consulta y bloquea el crédito. |
| server/routes/admin.ts:1363 | POST /api/admin/alertas/condonaciones/:planId/override-token | planId/alerta_id; verificaciones locales de autorización y objeto. |
| server/routes/admin.ts:1471 | POST /api/admin/students/:studentId/beca | porcentaje y vigencia; validación local de rango, sin contrato decimal común. |
| server/routes/admin.ts:1630 | PATCH /api/admin/scholarships/:id | porcentaje y vigencia; validación local. |
| server/routes/admin.ts:1749 | PATCH /api/admin/scholarships/:id/estado | id; controla estado y pertenencia. |
| server/routes/admin.ts:1903 | POST /api/admin/scholarship-types | porcentajes, descuento fijo y vigencia; validación local. |
| server/routes/admin.ts:1989 | PATCH /api/admin/scholarship-types/:id | porcentajes, descuento fijo y vigencia; validación local. |
| server/routes/conciliacion.ts:659 | POST /api/caja/pago-efectivo | monto en pesos, charge_id; conversión y saldo en handler. |
| server/routes/conciliacion.ts:848 | GET /api/caja/pagos-efectivo | fecha opcional de consulta. |
| server/routes/conciliacion.ts:901 | POST /api/caja/transferencia-manual | fecha/monto; validaciones locales. |
| server/routes/conciliacion.ts:1098 | GET /api/caja/cierre-dia | fecha opcional de consulta. |
| server/routes/conciliacion.ts:1128 | POST /api/caja/cerrar-dia | efectivo_capturado_centavos; Zod y snapshot del día. |
| server/routes/conciliacion.ts:1310 | POST /api/conciliacion/importar | transacciones con fecha y monto_centavos; validación y deduplicación por fila. |
| server/routes/conciliacion.ts:1453 | POST /api/conciliacion/importar-pdf | fecha/monto extraídos del archivo y confirmación de preview; no son campos JSON de monto. |
| server/routes/conciliacion.ts:1845 | POST /api/conciliacion/excepciones/:id/resolver | charge_id para aplicar; verificaciones locales de objeto y saldo. |
| server/routes/stripe-review.ts:8 | POST /api/conciliacion/excepciones/stripe/:id/resolver | id entero positivo limitado a integer de PostgreSQL, antes de conectar; importe procede del evento, no del cliente. |
| server/routes/misc.ts:156 | POST /api/planes-pago | número ≥1, frecuencia mensual/quincenal/semanal, inicial finito no negativo; sin límite 3–6; resto en última cuota. |
| server/routes/misc.ts:421 | POST /api/planes-pago/cuotas/:cuotaId/pagar | alias retirado; las cuotas se pagan por la ruta de cargos. |
| server/routes/misc.ts:428 | PATCH /api/planes-pago/:id/cancelar | id con parseInt; motivo/destino y saldo bajo bloqueo. |
| server/routes/misc.ts:1751 | POST /api/products | precios por nivel, montos almacenados en centavos; validaciones propias del catálogo. |
| server/routes/misc.ts:1786 | PUT /api/products/:id | precios por nivel; validaciones propias del catálogo. |
| server/routes/misc.ts:1846 | PATCH /api/products/:id | precios por nivel; validaciones propias del catálogo. |
| server/routes/notifications.ts:58 | POST /api/payment-config/late-fee-rules | porcentaje, monto_fijo/monto_maximo y progresiones; validación local. |
| server/routes/notifications.ts:113 | PUT /api/payment-config/late-fee-rules/:id | porcentaje, monto_fijo/monto_maximo y progresiones; validación local. |
| server/routes/notifications.ts:191 | POST /api/payment-config/test-late-fee | amount, rule y daysLate; presencia, sin contrato decimal común. |
| server/routes/receivables.ts:122 | GET /api/receivables/activities | charge_id; asPositiveId y alcance. |
| server/routes/receivables.ts:162 | POST /api/receivables/follow-ups | charge_id y fecha; validaciones locales antes de insertar actividad. |
| server/routes/receivables.ts:190 | POST /api/receivables/notes | charge_id; validaciones locales y alcance. |
| server/routes/receivables.ts:215 | POST /api/receivables/promises | charge_id, fecha y monto_centavos; validaciones locales. |
| server/routes/receivables.ts:241 | POST /api/receivables/reminders | charge_ids; validaciones locales y alcance. |
| server/routes/receivables.ts:276 | POST /api/receivables/escalations | charge_id; validaciones locales y alcance. |
| server/routes/receivables.ts:304 | POST /api/receivables/collections | charge_ids; validaciones locales y alcance. |
| server/routes/reportes-consejo.ts:328 | GET /api/reportes/consejo | fecha_desde/fecha_hasta; lectura de filtros del query. |
| server/routes/reportes-contable.ts:102 | GET /api/reportes/contable | periodo; filtro de período contable. |
| server/routes/fiscal.ts:68 | GET /api/fiscal/pendientes-cfdi/:campusId | mes de consulta. |
| server/routes/fiscal.ts:256 | GET /api/fiscal/pendientes-cfdi | mes de consulta, alias. |
| server/routes/fiscal.ts:635 | POST /api/fiscal/generar-reporte-contable | periodo; generación no disponible. |
| server/routes/fiscal.ts:645 | POST /api/fiscal/generar-reporte-sat | periodo; generación no disponible. |
| server/routes/fiscal.ts:693 | POST /api/becas-auto/reglas | descuento_porcentaje y vigencias; motor de reglas con validación propia. |

### Límites de esta clasificación

Los webhooks firmados no son formularios de entrada financiera del operador:
su firma, payload crudo y registro de recepción no se deben sustituir por un
validador de pesos de formularios. Los importes se reciben allí en centavos
del proveedor. Las rutas de credenciales, usuarios y calendario general no
son entradas financieras, aunque tengan fechas. Los identificadores externos
de Stripe no son IDs enteros de cargos/pagos de EduPay.

Un importe calculado desde cargos existentes no puede verificarse antes de
leerlos: la sintaxis de sus IDs se valida primero; el saldo y las reglas de
pertenencia siguen comprobándose en servidor, bajo los bloqueos existentes.
