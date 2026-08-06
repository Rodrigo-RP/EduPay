# Matriz de Pruebas — EduPay
## Inventario construido desde el código real

> **Método:** Este archivo se generó recorriendo todos los archivos de `server/routes/*.ts` (grep de `app.get/post/put/delete/patch`) y todos los componentes en `client/src/pages/*.tsx` (grep de `onClick`, `onSubmit`, `apiRequest`, `useQuery`, `useMutation`, `/api/`).
>
> **No se usó memoria ni documentación previa.** Cada fila tiene el archivo fuente exacto.
>
> **Última actualización:** 2026-08-06
> **Suite disponible:** `npm run audit:report` (Vitest + Playwright + probes + check:routes)

---

## Leyenda

| Símbolo | Significado |
|---------|-------------|
| ✅ Vitest | Test unitario en `server/tests/` |
| ✅ E2E | Test Playwright en `e2e/` |
| ✅ Probe | SQL probe en `npm run validate:assistant` |
| ✅ Routes | Verificado por `npm run check:routes` |
| ❌ Sin prueba | Ningún test automatizado la cubre |
| ⚠️ Parcial | El endpoint existe pero la prueba solo verifica status, no lógica |

---

## 1. Autenticación y Sesión

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| A-01 | Login administrador | `server/routes/auth.ts:25` | `POST /api/auth/login` | ✅ E2E `01-login`, ✅ E2E `07-endpoints` |
| A-02 | Login con credenciales incorrectas → 401 | `server/routes/auth.ts:25` | `POST /api/auth/login` (creds malas) | ✅ E2E `01-login` |
| A-03 | Logout limpia sesión | `client/src/hooks/use-auth.tsx` | localStorage.removeItem | ✅ E2E `01-login` |
| A-04 | Login tutor/guardian | `server/routes/auth.ts:232` | `POST /api/auth/guardian-login` | ✅ E2E `05-portal`, ✅ E2E `07-endpoints` |
| A-05 | Token inválido → 401 | `server/routes/auth.ts` middleware | Todas las rutas protegidas | ⚠️ E2E `07-endpoints` (smoke, sin token) |
| A-06 | Obtener usuario autenticado | `server/routes/auth.ts:159` | `GET /api/auth/user` | ❌ Sin prueba |
| A-07 | Renovar token | `server/routes/auth.ts:169` | `POST /api/auth/refresh` | ❌ Sin prueba |
| A-08 | Configurar 2FA (setup) | `server/routes/auth.ts:72` | `POST /api/auth/2fa/setup` | ❌ Sin prueba |
| A-09 | Confirmar código 2FA | `server/routes/auth.ts:103` | `POST /api/auth/2fa/confirm` | ❌ Sin prueba |
| A-10 | Desactivar 2FA | `server/routes/auth.ts:136` | `DELETE /api/auth/2fa` | ❌ Sin prueba |
| A-11 | Login platform (multi-tenant) | `server/routes/users.ts:371` | `POST /api/auth/platform-login` | ❌ Sin prueba |
| A-12 | Crear liga mágica para tutor | `server/routes/auth.ts:260` | `POST /api/admin/magic-link` | ❌ Sin prueba |
| A-13 | Validar liga mágica (token) | `server/routes/auth.ts:334` | `GET /api/auth/magic/:token` | ❌ Sin prueba |
| A-14 | Historial de ligas de un tutor | `server/routes/auth.ts:425` | `GET /api/admin/magic-link/history/:guardianId` | ❌ Sin prueba |
| A-15 | Enviar liga mágica desde UI | `client/src/pages/estudiantes.tsx` | botón "Enviar liga" → `POST /api/admin/magic-link` | ❌ Sin prueba |

---

## 2. Alumnos y Tutores

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| E-01 | Listar alumnos (admin general) | `server/routes/admin.ts:238` | `GET /api/admin/students` | ⚠️ E2E `07-endpoints` (solo status) |
| E-02 | Listar alumnos por campus | `server/routes/admin.ts:252` | `GET /api/admin/students/:campusId` | ❌ Sin prueba |
| E-03 | Listar alumnos (ruta corta) | `server/routes/admin.ts:276` | `GET /api/students` | ⚠️ E2E `07-endpoints` |
| E-04 | Página de alumnos carga sin error | `client/src/pages/estudiantes.tsx` | Render inicial | ✅ E2E `03-estudiantes` |
| E-05 | Buscador filtra alumnos | `client/src/pages/estudiantes.tsx` | Filtro local / API | ✅ E2E `03-estudiantes` |
| E-06 | Crear alumno nuevo | `server/routes/admin.ts:516` | `POST /api/admin/students` | ❌ Sin prueba |
| E-07 | Editar datos de alumno | `server/routes/admin.ts:544` | `PATCH /api/admin/students/:studentId` | ❌ Sin prueba |
| E-08 | Obtener tutores de un alumno | `server/routes/admin.ts:605` | `GET /api/admin/students/:studentId/guardians` | ❌ Sin prueba |
| E-09 | Actualizar tutor de alumno | `server/routes/admin.ts:653` | `PATCH /api/admin/students/:studentId/guardians/:guardianId` | ❌ Sin prueba |
| E-10 | Exportar alumnos a Excel/CSV | `server/routes/admin.ts:723` | `GET /api/admin/students/:campusId/export` | ❌ Sin prueba |
| E-11 | Importar alumnos desde archivo | `server/routes/admin.ts:778` | `POST /api/admin/students/import` | ❌ Sin prueba |
| E-12 | Listar tutores de un campus | `server/routes/admin.ts:264` | `GET /api/admin/guardians/:campusId` | ❌ Sin prueba |
| E-13 | Estado de cuenta de un alumno | `server/routes/admin.ts:370` | `GET /api/students/:studentId/estado-cuenta` | ❌ Sin prueba |
| E-14 | Familia divorciada — tutor correcto en estado de cuenta | `server/routes/admin.ts:370` + `server/storage.ts` | lógica de selección de tutor | ✅ Vitest `family-ledger.test.ts` |
| E-15 | Descargar plantilla de importación | `client/src/pages/estudiantes.tsx` | botón descargar | ❌ Sin prueba |

---

## 3. Familias

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| F-01 | Listar familias de un campus | `server/routes/misc.ts:438` | `GET /api/families/:campusId` | ❌ Sin prueba |
| F-02 | Balance consolidado de una familia | `server/routes/misc.ts:493` | `GET /api/family/:id/balance` | ✅ Vitest `family-ledger.test.ts` (lógica) |
| F-03 | Balance con dos hermanos | lógica en `server/storage.ts` | — | ✅ Vitest `family-ledger.test.ts` |
| F-04 | Balance con pago excedido (negativo) | lógica en `server/storage.ts` | — | ✅ Vitest `family-ledger.test.ts` |
| F-05 | Aislamiento de balance por tenant | lógica en `server/storage.ts` | — | ✅ Vitest `family-ledger.test.ts` |
| F-06 | Página de familias carga | `client/src/pages/familias.tsx` | render, `GET /api/families/:campusId` | ⚠️ E2E `07-endpoints` (smoke) |
| F-07 | Editar datos de familia | `client/src/pages/familias.tsx` | formulario, sin endpoint identificado | ❌ Sin prueba |
| F-08 | Registrar pago desde familia | `client/src/pages/familias.tsx` | botón pagar | ❌ Sin prueba |
| F-09 | Descargar / compartir recibo | `client/src/pages/familias.tsx` | acción local/PDF | ❌ Sin prueba |

---

## 4. Cargos

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| CA-01 | Listar cargos del campus | `server/routes/admin.ts:308` | `GET /api/charges` | ⚠️ E2E `07-endpoints` |
| CA-02 | Listar cargos (admin) | `server/routes/misc.ts:414` | `GET /api/admin/charges` | ❌ Sin prueba |
| CA-03 | Estadísticas de cargos | `server/routes/charges.ts:123` | `GET /api/admin/cargos/estadisticas` | ❌ Sin prueba |
| CA-04 | Generar cargos mensuales (colegiaturas) | `server/routes/charges.ts:144` | `POST /api/admin/cargos/generar-mensual` | ❌ Sin prueba |
| CA-05 | Crear cargo extraordinario | `server/routes/charges.ts:180` | `POST /api/admin/cargos/extraordinario` | ❌ Sin prueba |
| CA-06 | Crear cargos masivos | `server/routes/charges.ts:49` | `POST /api/admin/charges/bulk` | ❌ Sin prueba |
| CA-07 | Aplicar recargos a morosos | `server/routes/charges.ts:263` | `POST /api/admin/cargos/aplicar-recargos` | ❌ Sin prueba |
| CA-08 | Generar cargos desde catálogo | `server/routes/charges.ts:299` | `POST /api/admin/cargos/desde-catalogo` | ❌ Sin prueba |
| CA-09 | Exportar cargos | `server/routes/guardian.ts:435` | `GET /api/charges/export` | ❌ Sin prueba |
| CA-10 | Generar cargos (ruta alternativa) | `server/routes/guardian.ts:537` | `POST /api/charges/generate` | ❌ Sin prueba |
| CA-11 | Ver alumnos morosos | `server/routes/charges.ts:238` | `GET /api/admin/cargos/morosos` | ❌ Sin prueba |
| CA-12 | Transición de estado de cargo (pendiente→pagado) | `server/state-machine.ts` | lógica interna | ✅ Vitest `state-machines.test.ts` |
| CA-13 | Transición de estado de cargo (inválidas lanzan error) | `server/state-machine.ts` | lógica interna | ✅ Vitest `state-machines.test.ts` |
| CA-14 | Campo `monto_base_centavos` existe en DB | `server/assistant-validation.ts` | SQL probe | ✅ Probe `validate:assistant` |
| CA-15 | Página emisión de cargos — preview y generar | `client/src/pages/emision-cargos.tsx` | `POST /api/admin/cargos/generar-mensual` | ❌ Sin prueba |
| CA-16 | Página cargos — crear extraordinario desde UI | `client/src/pages/cargos.tsx` | `POST /api/charges/generate` | ❌ Sin prueba |

---

## 5. Pagos

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| P-01 | Listar pagos del campus | `server/routes/admin.ts:292` | `GET /api/payments` | ⚠️ E2E `07-endpoints` |
| P-02 | Crear intent de pago (guardian) | `server/routes/payments.ts:14` | `POST /api/payments/create-intent` | ❌ Sin prueba |
| P-03 | Procesar pago (guardian) | `server/routes/payments.ts:36` | `POST /api/payments/process` | ❌ Sin prueba |
| P-04 | Pago en efectivo desde caja | `server/routes/conciliacion.ts:111` | `POST /api/caja/pago-efectivo` | ❌ Sin prueba |
| P-05 | Registrar evento de pago (webhook) | `server/routes/misc.ts:549` | `POST /api/payment-events` | ✅ Vitest `family-ledger.test.ts` (idempotencia) |
| P-06 | Idempotencia de evento duplicado | `server/storage.ts` | lógica interna | ✅ Vitest `family-ledger.test.ts` |
| P-07 | Transición de estado de pago | `server/state-machine.ts` | lógica interna | ✅ Vitest `state-machines.test.ts` |
| P-08 | Campo `monto_centavos` existe en DB | `server/assistant-validation.ts` | SQL probe | ✅ Probe `validate:assistant` |
| P-09 | Página de pagos carga | `client/src/pages/pagos.tsx` | `GET /api/payments` | ❌ Sin prueba |
| P-10 | Registrar pago desde UI (formulario) | `client/src/pages/pagos.tsx` | mutación no identificada en grep | ❌ Sin prueba |
| P-11 | Compartir recibo por email / WhatsApp | `client/src/pages/pagos.tsx` | acción local / tercero | ❌ Sin prueba |

---

## 6. Cuentas por Cobrar

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| CX-01 | Lista de adeudos | `server/routes/admin.ts:324` | `GET /api/accounts-receivable` | ❌ Sin prueba (endpoint) |
| CX-02 | Lista (ruta alternativa) | `server/routes/misc.ts:345` | `GET /api/receivables` | ❌ Sin prueba |
| CX-03 | Página carga sin error 500 | `client/src/pages/cuentas-por-cobrar.tsx` | render | ✅ E2E `04-cuentas-por-cobrar` |
| CX-04 | Montos formateados como moneda | `client/src/pages/cuentas-por-cobrar.tsx` | render | ✅ E2E `04-cuentas-por-cobrar` |
| CX-05 | Filtro/búsqueda existe y responde | `client/src/pages/cuentas-por-cobrar.tsx` | UI | ✅ E2E `04-cuentas-por-cobrar` |
| CX-06 | Iniciar cobranza / promesa de pago | `client/src/pages/cuentas-por-cobrar.tsx` | acción (endpoint no identificado) | ❌ Sin prueba |
| CX-07 | Enviar recordatorio al tutor | `client/src/pages/cuentas-por-cobrar.tsx` | acción | ❌ Sin prueba |
| CX-08 | Registrar pago desde CxC | `client/src/pages/cuentas-por-cobrar.tsx` | acción | ❌ Sin prueba |
| CX-09 | Exportar reporte TXT/CSV/PDF | `client/src/pages/cuentas-por-cobrar.tsx` | acción | ❌ Sin prueba |

---

## 7. Becas y Descuentos

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| B-01 | Listar becas del campus | `server/routes/admin.ts:340` | `GET /api/scholarships` | ⚠️ E2E `07-endpoints` |
| B-02 | Columnas reales de becas en DB | `server/assistant-validation.ts` | SQL probe (`scholarships.porcentaje`, `.motivo`) | ✅ Probe `validate:assistant` |
| B-03 | Listar reglas de becas automáticas | `server/routes/fiscal.ts:228` / `misc.ts:332` | `GET /api/becas-auto/reglas[/:campusId]` | ❌ Sin prueba |
| B-04 | Crear regla de beca automática | `server/routes/fiscal.ts:239` | `POST /api/becas-auto/reglas` | ❌ Sin prueba |
| B-05 | Eliminar regla de beca | `server/routes/fiscal.ts:254` | `DELETE /api/becas-auto/reglas/:id` | ❌ Sin prueba |
| B-06 | Ejecutar becas automáticas | `server/routes/fiscal.ts:264` | `POST /api/becas-auto/ejecutar/:campusId` | ❌ Sin prueba |
| B-07 | Importar asignaciones de becas | `server/routes/payments.ts:266` | `POST /api/import/data/becas/asignaciones` | ❌ Sin prueba |
| B-08 | Página becas — crear regla desde UI | `client/src/pages/becas.tsx` | formulario | ❌ Sin prueba |
| B-09 | Página becas — ejecutar y ver alumnos | `client/src/pages/becas.tsx` | `POST /api/becas-auto/ejecutar/:campusId` | ❌ Sin prueba |
| B-10 | Beca de alumno específico (asistente) | `server/assistant-actions.ts` | `queryBecasAlumno` | ✅ Vitest `assistant-knowledge.test.ts` (intent) |
| B-11 | Becas por nivel escolar (asistente) | `server/assistant-actions.ts` | `queryBecasNivel` | ✅ Vitest `assistant-knowledge.test.ts` (intent) |

---

## 8. Aprobaciones

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| AP-01 | Ver aprobaciones pendientes | `server/routes/notifications.ts:543` | `GET /api/approvals/pending` | ❌ Sin prueba |
| AP-02 | Ver mis solicitudes | `server/routes/notifications.ts:554` | `GET /api/approvals/my-requests` | ❌ Sin prueba |
| AP-03 | Historial de aprobaciones | `server/routes/notifications.ts:565` | `GET /api/approvals/history` | ❌ Sin prueba |
| AP-04 | Crear solicitud de aprobación | `server/routes/notifications.ts:575` | `POST /api/approvals/request` | ❌ Sin prueba |
| AP-05 | Aprobar / rechazar solicitud | `server/routes/notifications.ts:633` | `POST /api/approvals/decision` | ❌ Sin prueba |
| AP-06 | Ver log de una aprobación | `server/routes/notifications.ts:709` | `GET /api/approvals/logs/:approvalId` | ❌ Sin prueba |
| AP-07 | Notificaciones de aprobación | `server/routes/notifications.ts:720` | `GET /api/approvals/notifications` | ❌ Sin prueba |
| AP-08 | Marcar notificación leída | `server/routes/notifications.ts:734` | `POST /api/approvals/notifications/:id/read` | ❌ Sin prueba |
| AP-09 | Verificar si acción requiere aprobación | `server/routes/notifications.ts:745` | `POST /api/approvals/check-required` | ❌ Sin prueba |
| AP-10 | Página aprobaciones — aprobar/rechazar desde UI | `client/src/pages/aprobaciones.tsx` | `POST /api/approvals/decision` | ❌ Sin prueba |

---

## 9. Planes de Pago

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| PL-01 | Listar planes de pago | `server/routes/misc.ts:258` / `:10` | `GET /api/planes-pago[/:campusId]` | ❌ Sin prueba |
| PL-02 | Crear plan de pago | `server/routes/misc.ts:32` | `POST /api/planes-pago` | ❌ Sin prueba |
| PL-03 | Marcar cuota de plan como pagada | `server/routes/misc.ts:68` | `POST /api/planes-pago/cuotas/:cuotaId/pagar` | ❌ Sin prueba |
| PL-04 | Página planes de pago — crear plan | `client/src/pages/planes-pago.tsx` | formulario | ❌ Sin prueba |
| PL-05 | Página planes de pago — expandir y marcar cuota | `client/src/pages/planes-pago.tsx` | `POST /api/planes-pago/cuotas/{id}/pagar` | ❌ Sin prueba |

---

## 10. Caja y Conciliación

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| CJ-01 | Movimientos bancarios | `server/routes/conciliacion.ts:156` | `GET /api/caja/movimientos-banco` | ⚠️ E2E `07-endpoints` |
| CJ-02 | Estadísticas de conciliación | `server/routes/conciliacion.ts:183` | `GET /api/caja/estadisticas-conciliacion` | ❌ Sin prueba |
| CJ-03 | Ejecutar conciliación automática | `server/routes/conciliacion.ts:205` | `POST /api/caja/ejecutar-conciliacion` | ❌ Sin prueba |
| CJ-04 | Transferencia manual | `server/routes/conciliacion.ts:167` | `POST /api/caja/transferencia-manual` | ❌ Sin prueba |
| CJ-05 | Cerrar día de caja | `server/routes/conciliacion.ts:312` | `POST /api/caja/cerrar-dia` | ❌ Sin prueba |
| CJ-06 | Importar transacciones bancarias | `server/routes/conciliacion.ts:358` | `POST /api/conciliacion/importar` | ❌ Sin prueba |
| CJ-07 | Auto-conciliar por campus | `server/routes/conciliacion.ts:380` | `POST /api/conciliacion/auto-match/:campusId` | ❌ Sin prueba |
| CJ-08 | Ver resumen de caja (`/api/caja`) | `server/routes/misc.ts:402` | `GET /api/caja` | ❌ Sin prueba |
| CJ-09 | Dashboard de caja — carga | `client/src/pages/dashboard-caja.tsx` | `GET /api/payments`, `/api/receivables`, `/api/students` | ❌ Sin prueba |
| CJ-10 | Dashboard comandos financieros | `server/routes/conciliacion.ts:10` / `misc.ts:313` | `GET /api/dashboard/comandos[/:campusId]` | ❌ Sin prueba |

---

## 11. Excepciones de Conciliación

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| EX-01 | Listar excepciones | `server/routes/conciliacion.ts:494` | `GET /api/conciliacion/excepciones` | ❌ Sin prueba (endpoint) |
| EX-02 | Resolver una excepción | `server/routes/conciliacion.ts:542` | `POST /api/conciliacion/excepciones/:id/resolver` | ❌ Sin prueba |
| EX-03 | Página excepciones carga | `client/src/pages/excepciones-conciliacion.tsx` | render | ❌ Sin prueba |
| EX-04 | Resolver excepción desde dashboard | `client/src/pages/admin-dashboard.tsx` | `POST /api/conciliacion/excepciones/{id}/resolver` | ❌ Sin prueba |

---

## 12. Fiscal y CFDI

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| FI-01 | CFDIs pendientes de timbrar | `server/routes/fiscal.ts:10` / `:81` | `GET /api/fiscal/pendientes-cfdi[/:campusId]` | ❌ Sin prueba |
| FI-02 | Timbrar lote de CFDIs | `server/routes/fiscal.ts:40` | `POST /api/fiscal/timbrar-lote` | ❌ Sin prueba |
| FI-03 | Regenerar CFDI | `server/routes/fiscal.ts:122` | `POST /api/fiscal/regenerar-cfdi/:id` | ❌ Sin prueba |
| FI-04 | Cancelar CFDI | `server/routes/fiscal.ts:142` | `POST /api/fiscal/cancelar-cfdi` | ❌ Sin prueba |
| FI-05 | Estadísticas de CFDIs | `server/routes/fiscal.ts:105` | `GET /api/fiscal/estadisticas-cfdi` | ❌ Sin prueba |
| FI-06 | Configuración automática fiscal | `server/routes/fiscal.ts:156` | `GET /api/fiscal/config-automatica` | ❌ Sin prueba |
| FI-07 | Actualizar configuración fiscal | `server/routes/fiscal.ts:165` | `PUT /api/fiscal/config-automatica` | ❌ Sin prueba |
| FI-08 | Estado del PAC | `server/routes/fiscal.ts:178` | `GET /api/fiscal/estado-pac` | ❌ Sin prueba |
| FI-09 | Configurar PAC | `server/routes/fiscal.ts:182` | `POST /api/fiscal/configurar-pac` | ❌ Sin prueba |
| FI-10 | Reportes contables | `server/routes/fiscal.ts:190` | `GET /api/fiscal/reportes-contables` | ❌ Sin prueba |
| FI-11 | Generar reporte contable | `server/routes/fiscal.ts:211` | `POST /api/fiscal/generar-reporte-contable` | ❌ Sin prueba |
| FI-12 | Generar reporte SAT | `server/routes/fiscal.ts:219` | `POST /api/fiscal/generar-reporte-sat` | ❌ Sin prueba |
| FI-13 | Estadísticas SAT | `server/routes/misc.ts:423` | `GET /api/fiscal/estadisticas-sat` | ❌ Sin prueba |
| FI-14 | Transición de estado de CFDI (invoice) | `server/state-machine.ts` | lógica interna | ✅ Vitest `state-machines.test.ts` |
| FI-15 | Página fiscal — timbrar lote desde UI | `client/src/pages/fiscal-contable.tsx` | `POST /api/fiscal/timbrar-lote` | ❌ Sin prueba |
| FI-16 | Página fiscal — cancelar CFDI desde UI | `client/src/pages/fiscal-contable.tsx` | `POST /api/fiscal/cancelar-cfdi` | ❌ Sin prueba |

---

## 13. Reportes

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| R-01 | Reporte para el consejo | `server/routes/misc.ts:137` / `:206` | `GET /api/reportes/consejo[/:campusId]` | ❌ Sin prueba |
| R-02 | Reporte financiero por periodo | `server/routes/guardian.ts:21` | `GET /api/reports/financial` | ❌ Sin prueba |
| R-03 | Exportar reporte financiero | `server/routes/guardian.ts:121` | `POST /api/reports/financial/export` | ❌ Sin prueba |
| R-04 | Reporte de admisiones | `server/routes/admin.ts:442` | `GET /api/admin/admissions-report` | ❌ Sin prueba |
| R-05 | Análisis financiero por periodo | `server/routes/system.ts:886` | `GET /api/financial/analysis/:period` | ❌ Sin prueba |
| R-06 | Página reporte consejo — imprimir | `client/src/pages/reporte-consejo.tsx` | `GET /api/reportes/consejo` | ❌ Sin prueba |
| R-07 | Página reportes financieros — exportar Excel/PDF | `client/src/pages/reportes-financieros.tsx` | `POST /api/reports/financial/export` | ❌ Sin prueba |
| R-08 | Página reportes admisiones — exportar | `client/src/pages/reportes-admisiones.tsx` | `GET /api/admin/students` | ❌ Sin prueba |
| R-09 | Página semáforo de riesgo — filtrar y exportar CSV | `client/src/pages/semaforo-riesgo.tsx` | `GET /api/riesgo/semaforo` | ❌ Sin prueba |
| R-10 | Semáforo de riesgo (API) | `server/routes/conciliacion.ts:51` / `misc.ts:279` | `GET /api/riesgo/semaforo[/:campusId]` | ⚠️ E2E `07-endpoints` |

---

## 14. Notificaciones y Comunicados

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| N-01 | Listar notificaciones | `server/routes/notifications.ts:12` | `GET /api/notifications` | ⚠️ E2E `07-endpoints` |
| N-02 | Estadísticas de notificaciones | `server/routes/notifications.ts:56` | `GET /api/notifications/stats` | ❌ Sin prueba |
| N-03 | Alumnos pendientes de notificar | `server/routes/notifications.ts:92` | `GET /api/notifications/pending-students` | ❌ Sin prueba |
| N-04 | Enviar notificación | `server/routes/notifications.ts:149` | `POST /api/notifications/send` | ❌ Sin prueba |
| N-05 | Página notificaciones — enviar desde UI | `client/src/pages/notificaciones.tsx` | `POST /api/notifications/send` | ❌ Sin prueba |

---

## 15. Configuración de Pagos y Catálogos

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| CF-01 | Listar conceptos de cobro | `server/routes/guardian.ts:1078` | `GET /api/concepts` | ❌ Sin prueba |
| CF-02 | Crear concepto de cobro | `server/routes/guardian.ts:1094` | `POST /api/concepts` | ❌ Sin prueba |
| CF-03 | Actualizar concepto | `server/routes/guardian.ts:1122` | `PUT /api/concepts/:id` | ❌ Sin prueba |
| CF-04 | Eliminar concepto | `server/routes/guardian.ts:1140` | `DELETE /api/concepts/:id` | ❌ Sin prueba |
| CF-05 | Listar reglas de recargo (late-fee) | `server/routes/notifications.ts:286` | `GET /api/payment-config/late-fee-rules` | ❌ Sin prueba |
| CF-06 | Crear regla de recargo | `server/routes/notifications.ts:309` | `POST /api/payment-config/late-fee-rules` | ❌ Sin prueba |
| CF-07 | Actualizar regla de recargo | `server/routes/notifications.ts:359` | `PUT /api/payment-config/late-fee-rules/:id` | ❌ Sin prueba |
| CF-08 | Eliminar regla de recargo | `server/routes/notifications.ts:407` | `DELETE /api/payment-config/late-fee-rules/:id` | ❌ Sin prueba |
| CF-09 | Probar regla de recargo | `server/routes/notifications.ts:427` | `POST /api/payment-config/test-late-fee` | ❌ Sin prueba |
| CF-10 | Presets de configuración | `server/routes/notifications.ts:492` | `GET /api/payment-config/presets` | ❌ Sin prueba |
| CF-11 | Fechas límite de pago (CRUD completo) | `server/routes/guardian.ts:1154–1270` | `GET/POST/PUT/DELETE /api/payment-config/due-dates-complete` | ❌ Sin prueba |
| CF-12 | Reglas de recargo completo (CRUD) | `server/routes/guardian.ts:1291–1465` | `GET/POST/PUT/DELETE /api/payment-config/surcharge-rules-complete` | ❌ Sin prueba |
| CF-13 | Reglas de pago (payment-rules) | `server/routes/system.ts:17` | `GET /api/payment-rules` | ❌ Sin prueba |
| CF-14 | Crear regla de pago | `server/routes/system.ts:29` | `POST /api/payment-rules` | ❌ Sin prueba |
| CF-15 | Probar regla de pago | `server/routes/system.ts:45` | `POST /api/payment-rules/test` | ❌ Sin prueba |
| CF-16 | Conceptos por campus | `server/routes/charges.ts:13` | `GET /api/admin/concepts/:campusId` | ❌ Sin prueba |
| CF-17 | Crear concepto (admin) | `server/routes/charges.ts:26` | `POST /api/admin/concepts` | ❌ Sin prueba |
| CF-18 | Información institucional | `server/routes/users.ts:466` | `GET /api/institutional-info` | ❌ Sin prueba |
| CF-19 | Guardar información institucional | `server/routes/users.ts:479` | `POST /api/institutional-info` | ❌ Sin prueba |
| CF-20 | Configuración escuela (onboarding) | `server/routes/misc.ts:382` | `POST /api/admin/configuracion/escuela` | ❌ Sin prueba |
| CF-21 | Completar onboarding | `server/routes/misc.ts:394` | `POST /api/admin/configuracion/completar-onboarding` | ❌ Sin prueba |
| CF-22 | Catálogo de productos — editar/eliminar desde UI | `client/src/pages/catalogo-productos.tsx` | endpoints comentados (sin activar) | ❌ Sin prueba |
| CF-23 | Reglas de pago — crear y probar desde UI | `client/src/pages/reglas-pago.tsx` | `POST /api/payment-rules`, `/test` | ❌ Sin prueba |

---

## 16. Calendario Financiero

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| CAL-01 | Listar eventos del calendario | `server/routes/misc.ts:89` / `:101` | `GET /api/calendario/eventos[/:campusId]` | ❌ Sin prueba |
| CAL-02 | Crear evento de calendario | `server/routes/misc.ts:111` | `POST /api/calendario/eventos` | ❌ Sin prueba |
| CAL-03 | Marcar evento como completado | `server/routes/misc.ts:126` | `POST /api/calendario/eventos/:id/completar` | ❌ Sin prueba |
| CAL-04 | Página calendario — crear evento desde UI | `client/src/pages/calendario-financiero.tsx` | `POST /api/calendario/eventos` | ❌ Sin prueba |

---

## 17. Portal de Padres

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| PP-01 | Dashboard del tutor (cargos pendientes) | `server/routes/admin.ts:18` | `GET /api/guardian/dashboard` | ❌ Sin prueba (endpoint) |
| PP-02 | Procesar pago de tutor | `server/routes/guardian.ts:339` | `POST /api/guardian/pagar` | ❌ Sin prueba |
| PP-03 | Ruta portal-3clics carga sin 500 | `client/src/pages/portal-padres-3clics.tsx` | render | ✅ E2E `05-portal` |
| PP-04 | Login tutor → 200 o 401, nunca 500 | `server/routes/auth.ts:232` | `POST /api/auth/guardian-login` | ✅ E2E `05-portal`, ✅ E2E `07-endpoints` |
| PP-05 | Seleccionar cargos y confirmar pago | `client/src/pages/portal-padres-3clics.tsx` | `POST /api/guardian/pagar` | ❌ Sin prueba |
| PP-06 | Perfil del tutor | `server/routes/users.ts:104` | `GET /api/guardian/profile` | ❌ Sin prueba |
| PP-07 | Actualizar perfil del tutor | `server/routes/users.ts:122` | `PUT /api/guardian/profile` | ❌ Sin prueba |
| PP-08 | Cambiar contraseña del tutor | `server/routes/users.ts:155` | `PUT /api/guardian/profile/password` | ❌ Sin prueba |

---

## 18. Usuarios y Permisos

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| U-01 | Listar usuarios | `server/routes/users.ts:185` | `GET /api/users` | ❌ Sin prueba |
| U-02 | Crear usuario | `server/routes/users.ts:202` | `POST /api/users` | ❌ Sin prueba |
| U-03 | Actualizar usuario | `server/routes/users.ts:261` | `PUT /api/users/:id` | ❌ Sin prueba |
| U-04 | Eliminar usuario | `server/routes/users.ts:308` / `:356` | `DELETE /api/users/:id` | ❌ Sin prueba |
| U-05 | Ver perfil propio | `server/routes/users.ts:15` | `GET /api/profile` | ❌ Sin prueba |
| U-06 | Actualizar perfil propio | `server/routes/users.ts:33` | `PUT /api/profile` | ❌ Sin prueba |
| U-07 | Cambiar contraseña propia | `server/routes/users.ts:78` | `PUT /api/profile/password` | ❌ Sin prueba |
| U-08 | Foto de perfil | `server/routes/system.ts:108` | `PUT /api/profile/photo` | ❌ Sin prueba |
| U-09 | Página usuarios — crear/editar/eliminar desde UI | `client/src/pages/usuarios.tsx` | `POST/PUT/DELETE /api/users` | ❌ Sin prueba |

---

## 19. Asistente Virtual

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| AS-01 | Chat del asistente (intent dispatch) | `server/routes/assistant.ts:19` | `POST /api/assistant/chat` | ✅ E2E `06-asistente` (4 intents, smoke) |
| AS-02 | Intent: contar alumnos | `server/assistant-knowledge.ts` | matchIntent | ✅ Vitest `assistant-knowledge.test.ts` |
| AS-03 | Intent: resumen financiero | `server/assistant-knowledge.ts` | matchIntent | ✅ Vitest `assistant-knowledge.test.ts` |
| AS-04 | Intent: becas de alumno específico | `server/assistant-knowledge.ts` | matchIntent | ✅ Vitest `assistant-knowledge.test.ts` |
| AS-05 | Intent: becas por nivel | `server/assistant-knowledge.ts` | matchIntent | ✅ Vitest `assistant-knowledge.test.ts` |
| AS-06 | Intent: cargos de alumno | `server/assistant-knowledge.ts` | matchIntent | ✅ Vitest `assistant-knowledge.test.ts` |
| AS-07 | Intent: saldo de alumno | `server/assistant-knowledge.ts` | matchIntent | ✅ Vitest `assistant-knowledge.test.ts` |
| AS-08 | Intent: diagnóstico de fallas | `server/assistant-knowledge.ts` | matchIntent | ✅ Vitest `assistant-knowledge.test.ts` |
| AS-09 | Intent: verificar sistema (health) | `server/assistant-knowledge.ts` | matchIntent | ✅ Vitest `assistant-knowledge.test.ts` |
| AS-10 | 30 patrones de intent en total | `server/assistant-knowledge.ts` | matchIntent | ✅ Vitest `assistant-knowledge.test.ts` (30 tests) |
| AS-11 | SQL: students.contar | `server/assistant-actions.ts` | queryContar | ✅ Probe `validate:assistant` |
| AS-12 | SQL: charges.monto_base_centavos | `server/assistant-actions.ts` | queryCargosAlumno | ✅ Probe `validate:assistant` |
| AS-13 | SQL: charges.concepto (JOIN concepts) | `server/assistant-actions.ts` | queryCargosAlumno | ✅ Probe `validate:assistant` |
| AS-14 | SQL: payments.monto_centavos | `server/assistant-actions.ts` | queryResumenFinanciero | ✅ Probe `validate:assistant` |
| AS-15 | SQL: scholarships.porcentaje/motivo | `server/assistant-actions.ts` | queryBecasAlumno | ✅ Probe `validate:assistant` |
| AS-16 | SQL: families.hijos | `server/assistant-actions.ts` | queryFamiliasHijos | ✅ Probe `validate:assistant` |
| AS-17 | SQL: audit_log.schema | `server/assistant-actions.ts` | auditLog | ✅ Probe `validate:assistant` |
| AS-18 | Diagnosticar problema específico | `server/routes/assistant.ts:98` | `POST /api/assistant/diagnose` | ❌ Sin prueba |
| AS-19 | Health-check completo del sistema | `server/routes/assistant.ts:178` | `POST /api/assistant/health-check` | ❌ Sin prueba (endpoint) |
| AS-20 | Aislamiento de campus en queries | `server/assistant-actions.ts` | filtro por campusId/tenantId | ❌ Sin prueba |

---

## 20. Dashboards

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| DA-01 | Dashboard admin — carga y métricas | `server/routes/admin.ts:64` | `GET /api/admin/dashboard/:campusId` | ✅ E2E `02-dashboard` |
| DA-02 | Dashboard admin — sidebar visible | `client/src/App.tsx` | render condicional | ✅ E2E `02-dashboard` |
| DA-03 | Dashboard admin — sin errores JS | `client/src/pages/admin-dashboard.tsx` | consola del browser | ✅ E2E `02-dashboard` |
| DA-04 | Dashboard admisiones — carga | `client/src/pages/dashboard-admisiones.tsx` | múltiples GETs | ❌ Sin prueba |
| DA-05 | Dashboard caja — carga | `client/src/pages/dashboard-caja.tsx` | `GET /api/payments`, `/receivables`, `/students` | ❌ Sin prueba |
| DA-06 | Dashboard contador | `server/routes/system.ts:392` | `GET /api/dashboard/contador` | ❌ Sin prueba |
| DA-07 | CRM / prospectos | `server/routes/misc.ts:361` | `GET /api/crm/prospects` | ❌ Sin prueba |
| DA-08 | Crear prospecto (CRM) | `server/routes/misc.ts:369` | `POST /api/crm/prospects` | ❌ Sin prueba |

---

## 21. Historial y Auditoría

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| HI-01 | Listar entradas de audit log | `server/routes/misc.ts:599` | `GET /api/audit-log` | ❌ Sin prueba (endpoint) |
| HI-02 | Página historial — cargar con filtros | `client/src/pages/historial.tsx` | `GET /api/audit-log?params` | ❌ Sin prueba |
| HI-03 | Página historial — reintentar en error | `client/src/pages/historial.tsx` | botón reintentar | ❌ Sin prueba |
| HI-04 | Tabla audit_log existe en DB | `server/assistant-validation.ts` | SQL probe | ✅ Probe `validate:assistant` |

---

## 22. Importación y Exportación de Datos

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| IM-01 | Descargar plantilla de importación | `server/routes/payments.ts:96` | `GET /api/import/template/:category/:templateId` | ❌ Sin prueba |
| IM-02 | Subir y procesar archivo de importación | `server/routes/payments.ts:266` | `POST /api/import/data/:category/:templateId` | ❌ Sin prueba |
| IM-03 | Exportar datos | `server/routes/payments.ts:459` | `GET /api/export/:type` | ❌ Sin prueba |
| IM-04 | Exportar (legacy) | `server/routes/payments.ts:504` | `GET /api/export-legacy/:type` | ❌ Sin prueba |
| IM-05 | Página importación — descargar plantilla | `client/src/pages/importacion-datos.tsx` | `GET /api/import/template/...` | ❌ Sin prueba |
| IM-06 | Página importación — subir archivo | `client/src/pages/importacion-datos.tsx` | `POST /api/import/data/...` | ❌ Sin prueba |
| IM-07 | Exportar alumnos desde página de alumnos | `server/routes/admin.ts:723` | `GET /api/admin/students/:campusId/export` | ❌ Sin prueba |

---

## 23. Búsqueda Global

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| BU-01 | Búsqueda global (alumnos, familias…) | `server/routes/misc.ts:629` | `GET /api/search` | ❌ Sin prueba |

---

## 24. Seguridad y Super-Admin

| ID | Función | Archivo fuente | Endpoint / Acción | Prueba existente |
|----|---------|---------------|-------------------|-----------------|
| SA-01 | Métricas de seguridad | `server/routes/system.ts:147` | `GET /api/security/metrics` | ❌ Sin prueba |
| SA-02 | Eventos de seguridad | `server/routes/system.ts:163` | `GET /api/security/events` | ❌ Sin prueba |
| SA-03 | Bloquear IP | `server/routes/system.ts:210` | `POST /api/security/block-ip` | ❌ Sin prueba |
| SA-04 | Tenants del super-admin | `server/routes/system.ts:329` | `GET /api/super-admin/tenants` | ❌ Sin prueba |
| SA-05 | Salud del sistema | `server/routes/system.ts:378` | `GET /api/super-admin/system/health` | ❌ Sin prueba |
| SA-06 | Crear usuario (super-admin) | `server/routes/system.ts:536` | `POST /api/super-admin/create-user` | ❌ Sin prueba |
| SA-07 | Aislamiento de tenant (HTTP layer) | `server/tests/tenant-http.test.ts` | middleware | ✅ Vitest `tenant-http.test.ts` |
| SA-08 | Aislamiento de tenant (storage layer) | `server/tests/tenant-isolation.test.ts` | storage functions | ✅ Vitest `tenant-isolation.test.ts` |

---

## 25. Infraestructura / CI

| ID | Herramienta | Archivo | Qué verifica | Comando | Estado |
|----|------------|---------|-------------|---------|--------|
| CI-01 | Vitest — family ledger | `server/tests/family-ledger.test.ts` | Balances, idempotencia, aislamiento | `npm test` | ✅ 66/66 pasan |
| CI-02 | Vitest — state machines | `server/tests/state-machines.test.ts` | Transiciones cargo/pago/invoice | `npm test` | ✅ 66/66 pasan |
| CI-03 | Vitest — assistant knowledge | `server/tests/assistant-knowledge.test.ts` | 30 patrones de intent | `npm test` | ✅ 66/66 pasan |
| CI-04 | Vitest — tenant isolation | `server/tests/tenant-isolation.test.ts` | Aislamiento por tenant (storage) | `npm test` | ✅ 66/66 pasan |
| CI-05 | Vitest — tenant http | `server/tests/tenant-http.test.ts` | Aislamiento por tenant (HTTP) | `npm test` | ✅ 66/66 pasan |
| CI-06 | E2E — login/logout | `e2e/01-login.spec.ts` | Auth UI flow | `npm run test:e2e` | ✅ 29/29 pasan |
| CI-07 | E2E — dashboard | `e2e/02-dashboard.spec.ts` | Métricas, sidebar, sin errores JS | `npm run test:e2e` | ✅ 29/29 pasan |
| CI-08 | E2E — estudiantes | `e2e/03-estudiantes.spec.ts` | Lista y buscador | `npm run test:e2e` | ✅ 29/29 pasan |
| CI-09 | E2E — cuentas por cobrar | `e2e/04-cuentas-por-cobrar.spec.ts` | Lista, montos, filtro | `npm run test:e2e` | ✅ 29/29 pasan |
| CI-10 | E2E — portal padres | `e2e/05-portal-padres.spec.ts` | Auth API, ruta sin 500 | `npm run test:e2e` | ✅ 29/29 pasan |
| CI-11 | E2E — asistente (API) | `e2e/06-asistente.spec.ts` | 4 intents sin 500 | `npm run test:e2e` | ✅ 29/29 pasan |
| CI-12 | E2E — endpoints críticos | `e2e/07-endpoints-criticos.spec.ts` | 11 endpoints smoke | `npm run test:e2e` | ✅ 29/29 pasan |
| CI-13 | SQL probes | `scripts/validate-assistant-queries.ts` | 12 columnas reales en DB | `npm run validate:assistant` | ✅ 12/12 pasan |
| CI-14 | Route registry | `scripts/check-route-registry.ts` | 42 rutas registradas vs App.tsx | `npm run check:routes` | ✅ 42/42 pasan |

---

## Resumen de cobertura real

| Módulo | Total funciones | Con prueba | Sin prueba | % cubierto |
|--------|----------------|-----------|-----------|-----------|
| Autenticación | 15 | 5 | 10 | 33% |
| Alumnos y tutores | 15 | 4 | 11 | 27% |
| Familias | 9 | 4 | 5 | 44% |
| Cargos | 16 | 4 | 12 | 25% |
| Pagos | 11 | 4 | 7 | 36% |
| Cuentas por Cobrar | 9 | 3 | 6 | 33% |
| Becas | 11 | 5 | 6 | 45% |
| Aprobaciones | 10 | 0 | 10 | 0% |
| Planes de pago | 5 | 0 | 5 | 0% |
| Caja y Conciliación | 10 | 1 | 9 | 10% |
| Excepciones | 4 | 0 | 4 | 0% |
| Fiscal y CFDI | 16 | 1 | 15 | 6% |
| Reportes | 10 | 1 | 9 | 10% |
| Notificaciones | 5 | 1 | 4 | 20% |
| Configuración y catálogos | 23 | 0 | 23 | 0% |
| Calendario | 4 | 0 | 4 | 0% |
| Portal de padres | 8 | 3 | 5 | 38% |
| Usuarios y permisos | 9 | 0 | 9 | 0% |
| Asistente virtual | 20 | 17 | 3 | 85% |
| Dashboards | 8 | 3 | 5 | 38% |
| Historial y auditoría | 4 | 2 | 2 | 50% |
| Importación y exportación | 7 | 0 | 7 | 0% |
| Búsqueda global | 1 | 0 | 1 | 0% |
| Seguridad y Super-admin | 8 | 2 | 6 | 25% |
| **TOTAL** | **237** | **60** | **177** | **25%** |

---

## Cómo usar este archivo

**Agregar una función nueva:** añadir una fila en el mismo commit que el código, con `❌ Sin prueba` si aún no tiene test.

**Marcar prueba completada:** cambiar `❌ Sin prueba` por `✅ E2E`, `✅ Vitest`, o `✅ Probe`, y anotar el archivo de test.

**Consultar cobertura real:** el número honesto es el 25% — tres cuartas partes del backend no tienen ningún test automatizado.
