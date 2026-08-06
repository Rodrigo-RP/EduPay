# Matriz de Pruebas — EduPay

> **Protocolo §3**: Este archivo es el inventario vivo de toda funcionalidad de la plataforma.  
> Cada vez que se agrega una función nueva, se agrega **una fila nueva aquí en el mismo commit**.  
> Una fila sin fecha en "Última prueba" = funcionalidad que nunca se ha vuelto a verificar desde que se escribió.

**Fecha de última actualización:** 2026-08-05  
**Suite Vitest:** `npm test` (5 archivos, `server/tests/`)  
**Suite E2E:** `npm run test:e2e` (7 archivos, `e2e/`)  
**Reporte completo:** `npm run audit:report`

---

## Leyenda

| Símbolo | Significado |
|---------|-------------|
| ✅ | Última ejecución pasó |
| ❌ | Última ejecución falló |
| ⚠️ | Prueba existe pero no se ha ejecutado recientemente |
| — | Sin prueba automatizada (requiere test manual o escribir uno) |

---

## 1. Autenticación y Sesión

| ID | Pantalla / Endpoint | Acción crítica | Cómo se prueba | Última prueba | Resultado |
|----|---------------------|----------------|----------------|---------------|-----------|
| A-01 | `POST /api/auth/login` | Login admin exitoso | `e2e/01-login.spec.ts` · `e2e/07-endpoints-criticos.spec.ts` | — | ⚠️ |
| A-02 | `POST /api/auth/login` | Credenciales incorrectas → 401, no 500 | `e2e/01-login.spec.ts` · `e2e/07-endpoints-criticos.spec.ts` | — | ⚠️ |
| A-03 | `/login` (UI) | Logout limpia sesión y redirige | `e2e/01-login.spec.ts` | — | ⚠️ |
| A-04 | `POST /api/auth/guardian-login` | Login tutor exitoso | `e2e/07-endpoints-criticos.spec.ts` | — | ⚠️ |
| A-05 | `POST /api/auth/guardian-login` | Email no registrado → 401/404, no 500 | `e2e/07-endpoints-criticos.spec.ts` | — | ⚠️ |
| A-06 | Rutas protegidas | Sin token → 401 en todas las rutas de API | `e2e/07-endpoints-criticos.spec.ts` | — | ⚠️ |
| A-07 | Aislamiento de tenant | Campus A no ve datos de Campus B | `server/tests/tenant-isolation.test.ts` · `server/tests/tenant-http.test.ts` | — | ⚠️ |

---

## 2. Dashboard Administrativo

| ID | Pantalla / Endpoint | Acción crítica | Cómo se prueba | Última prueba | Resultado |
|----|---------------------|----------------|----------------|---------------|-----------|
| D-01 | `/admin` | Métricas renderizan (no quedan en spinner) | `e2e/02-dashboard.spec.ts` | — | ⚠️ |
| D-02 | `/admin` | Menú lateral con módulos principales | `e2e/02-dashboard.spec.ts` | — | ⚠️ |
| D-03 | `/admin` | Sin errores críticos de JS en consola | `e2e/02-dashboard.spec.ts` | — | ⚠️ |
| D-04 | `GET /api/dashboard/metrics` | Responde < 500 | `e2e/07-endpoints-criticos.spec.ts` | — | — |
| D-05 | `/semaforo-riesgo` | Semáforo de riesgo carga indicadores | — | — | — |
| D-06 | `/dashboard-caja` | Dashboard de caja muestra corte del día | — | — | — |
| D-07 | `/dashboard-admisiones` | Dashboard admisiones carga prospectos | — | — | — |

---

## 3. Estudiantes y Familias

| ID | Pantalla / Endpoint | Acción crítica | Cómo se prueba | Última prueba | Resultado |
|----|---------------------|----------------|----------------|---------------|-----------|
| E-01 | `/estudiantes` | Lista de alumnos carga al menos un registro | `e2e/03-estudiantes.spec.ts` | — | ⚠️ |
| E-02 | `/estudiantes` | Búsqueda filtra resultados | `e2e/03-estudiantes.spec.ts` | — | ⚠️ |
| E-03 | `/estudiantes/:id` | Expediente del alumno abre sin error 500 | `e2e/03-estudiantes.spec.ts` | — | ⚠️ |
| E-04 | `/estudiantes` | Agregar alumno guarda en DB y aparece en lista | — | — | — |
| E-05 | `/familias` | Lista de familias carga | `e2e/07-endpoints-criticos.spec.ts` | — | ⚠️ |
| E-06 | `/familias/:id` | Editar datos de familia y guardar | — | — | — |
| E-07 | `/familias` | Familia divorciada muestra tutor correcto en estado de cuenta | Vitest `family-ledger.test.ts` | — | ⚠️ |

---

## 4. Cargos y Pagos

| ID | Pantalla / Endpoint | Acción crítica | Cómo se prueba | Última prueba | Resultado |
|----|---------------------|----------------|----------------|---------------|-----------|
| P-01 | `/cargos` | Lista de cargos carga | `e2e/07-endpoints-criticos.spec.ts` | — | ⚠️ |
| P-02 | `/cargos` | Crear cargo nuevo → guarda en DB | — | — | — |
| P-03 | `POST /api/charges` | Monto en centavos, campo `monto_base_centavos` correcto | Vitest `state-machines.test.ts` | — | ⚠️ |
| P-04 | `/pagos` | Lista de pagos carga | `e2e/07-endpoints-criticos.spec.ts` | — | ⚠️ |
| P-05 | `POST /api/payments` | Registrar pago → crea registro en payments + CFDI simulado | — | — | — |
| P-06 | `/aprobaciones` | Aprobaciones pendientes listan correctamente | — | — | — |
| P-07 | `/planes-pago` | Plan de pago divide cargo en parcialidades | — | — | — |
| P-08 | Maquina de estados | Transiciones válidas de estado (cargo → pago → cerrado) | Vitest `state-machines.test.ts` | — | ⚠️ |

---

## 5. Cuentas por Cobrar y Cobranza

| ID | Pantalla / Endpoint | Acción crítica | Cómo se prueba | Última prueba | Resultado |
|----|---------------------|----------------|----------------|---------------|-----------|
| C-01 | `/cuentas-por-cobrar` | Lista de adeudos carga sin error 500 | `e2e/04-cuentas-por-cobrar.spec.ts` | — | ⚠️ |
| C-02 | `/cuentas-por-cobrar` | Montos formateados como moneda | `e2e/04-cuentas-por-cobrar.spec.ts` | — | ⚠️ |
| C-03 | `/cuentas-por-cobrar` | Filtro/búsqueda responde | `e2e/04-cuentas-por-cobrar.spec.ts` | — | ⚠️ |
| C-04 | "Enviar liga" | Botón envía liga de pago al tutor | — | — | — |
| C-05 | `GET /api/cuentas-cobrar` | API devuelve adeudos del campus autenticado | `e2e/07-endpoints-criticos.spec.ts` | — | ⚠️ |

---

## 6. Becas y Descuentos

| ID | Pantalla / Endpoint | Acción crítica | Cómo se prueba | Última prueba | Resultado |
|----|---------------------|----------------|----------------|---------------|-----------|
| B-01 | `/becas` | Lista de becas carga | `e2e/07-endpoints-criticos.spec.ts` | — | ⚠️ |
| B-02 | `GET /api/becas` | Columnas reales: `porcentaje`, `motivo`, `vigencia_inicio/fin` | `npm run validate:assistant` (probe `q_becas_alumno`) | — | ⚠️ |
| B-03 | `/becas` | Asignar beca a alumno y verificar en estado de cuenta | — | — | — |
| B-04 | `/becas` | Beca reduce monto en cuentas por cobrar | — | — | — |

---

## 7. Caja y Conciliación

| ID | Pantalla / Endpoint | Acción crítica | Cómo se prueba | Última prueba | Resultado |
|----|---------------------|----------------|----------------|---------------|-----------|
| X-01 | `/caja-conciliacion` | Movimientos bancarios cargan | `e2e/07-endpoints-criticos.spec.ts` | — | ⚠️ |
| X-02 | `GET /api/caja/movimientos-banco` | API devuelve JSON válido | `e2e/07-endpoints-criticos.spec.ts` | — | ⚠️ |
| X-03 | `/excepciones-conciliacion` | Bandeja de excepciones carga | — | — | — |
| X-04 | Conciliación | Movimiento sin identificar puede marcarse como excepción | — | — | — |

---

## 8. Fiscal y CFDI

| ID | Pantalla / Endpoint | Acción crítica | Cómo se prueba | Última prueba | Resultado |
|----|---------------------|----------------|----------------|---------------|-----------|
| F-01 | `/fiscal-contable` | Pantalla carga sin error | — | — | — |
| F-02 | `GET /api/fiscal/cfdi` | Lista de CFDIs responde < 500 | — | — | — |
| F-03 | CFDI sin timbrar | Se registra como excepción automática | — | — | — |

---

## 9. Reportes

| ID | Pantalla / Endpoint | Acción crítica | Cómo se prueba | Última prueba | Resultado |
|----|---------------------|----------------|----------------|---------------|-----------|
| R-01 | `/reportes` | Página carga | — | — | — |
| R-02 | `/reportes-financieros` | Reporte financiero genera datos del campus | — | — | — |
| R-03 | `/reporte-consejo` | Reporte directivo se exporta sin error | — | — | — |
| R-04 | `/reportes-admisiones` | Reporte de admisiones carga prospectos | — | — | — |

---

## 10. Portal de Padres

| ID | Pantalla / Endpoint | Acción crítica | Cómo se prueba | Última prueba | Resultado |
|----|---------------------|----------------|----------------|---------------|-----------|
| PP-01 | `POST /api/auth/guardian-login` | Login tutor devuelve 200 o 401, nunca 500 | `e2e/05-portal-padres.spec.ts` · `e2e/07-endpoints-criticos.spec.ts` | — | ⚠️ |
| PP-02 | `/portal-3clics` | Ruta carga sin error 500 | `e2e/05-portal-padres.spec.ts` | — | ⚠️ |
| PP-03 | `POST /api/guardian/pagar` | Pago procesa array de charge_ids, devuelve 200 | — | — | — |
| PP-04 | `/pagar/:token` | Liga de pago con token válido muestra cargos | — | — | — |

---

## 11. Asistente Virtual

| ID | Pantalla / Endpoint | Acción crítica | Cómo se prueba | Última prueba | Resultado |
|----|---------------------|----------------|----------------|---------------|-----------|
| AS-01 | `POST /api/assistant/query` | Intent "alumnos" responde sin 500 | `e2e/06-asistente.spec.ts` | — | ⚠️ |
| AS-02 | `POST /api/assistant/query` | Intent "resumen financiero" responde | `e2e/06-asistente.spec.ts` | — | ⚠️ |
| AS-03 | `POST /api/assistant/query` | Intent "becas" responde sin 500 | `e2e/06-asistente.spec.ts` | — | ⚠️ |
| AS-04 | `POST /api/assistant/query` | Intent "verifica todo" ejecuta 12 probes | `e2e/06-asistente.spec.ts` | — | ⚠️ |
| AS-05 | SQL probes (12) | Todas las queries usan columnas que existen en la DB | `npm run validate:assistant` | — | ⚠️ |
| AS-06 | Intents – knowledge tests | 30 tests de detección de intención | Vitest `assistant-knowledge.test.ts` | — | ⚠️ |
| AS-07 | Aislamiento campus | Asistente no mezcla datos entre campus distintos | — | — | — |

---

## 12. Configuración y Usuarios

| ID | Pantalla / Endpoint | Acción crítica | Cómo se prueba | Última prueba | Resultado |
|----|---------------------|----------------|----------------|---------------|-----------|
| U-01 | `/usuarios` | Lista de usuarios carga | — | — | — |
| U-02 | `/configuracion` | Cambio de ciclo escolar activo se guarda | — | — | — |
| U-03 | `/historial` | Audit log muestra movimientos del campus | — | — | — |
| U-04 | Audit log | Registro es inmune a borrado desde la app | — | — | — |

---

## 13. Seguridad y Tenant

| ID | Pantalla / Endpoint | Acción crítica | Cómo se prueba | Última prueba | Resultado |
|----|---------------------|----------------|----------------|---------------|-----------|
| S-01 | Tenant isolation | Campus A no puede leer datos de Campus B | `server/tests/tenant-isolation.test.ts` | — | ⚠️ |
| S-02 | Tenant isolation | Header X-Tenant-ID incorrecto → rechazado | `server/tests/tenant-http.test.ts` | — | ⚠️ |
| S-03 | Rutas protegidas | Sin JWT → 401 en todos los endpoints privados | `e2e/07-endpoints-criticos.spec.ts` | — | ⚠️ |
| S-04 | Cargos/pagos cerrados | No pueden editarse directamente | — | — | — |
| S-05 | Montos | No se pueden crear cargos sin validar monto | — | — | — |

---

## 14. Infraestructura / CI

| ID | Herramienta | Qué verifica | Comando | Última ejecución | Resultado |
|----|-------------|--------------|---------|-----------------|-----------|
| CI-01 | `npm run check:routes` | Todas las rutas de App.tsx están en el registry §9 | `npm run check:routes` | — | ⚠️ |
| CI-02 | `npm run validate:assistant` | 12 SQL probes pasan contra la DB real | `npm run validate:assistant` | — | ⚠️ |
| CI-03 | `npm test` | 5 suites Vitest pasan | `npm test` | — | ⚠️ |
| CI-04 | `npm run test:e2e` | 7 suites Playwright pasan | `npm run test:e2e` | — | ⚠️ |
| CI-05 | `npm run audit:report` | Reporte §5 completo (las 4 herramientas) | `npm run audit:report` | — | ⚠️ |

---

## Cómo actualizar este archivo

Después de cada ejecución real, edita la fila correspondiente:

```
| CI-03 | `npm test` | 5 suites Vitest pasan | `npm test` | 2026-08-05 | ✅ |
```

Si una prueba falla, anota el ID del error o el nombre del test que falló en la columna Resultado:

```
| CI-03 | `npm test` | 5 suites Vitest pasan | `npm test` | 2026-08-05 | ❌ `family-ledger.test.ts:87` |
```

**Regla §3:** Cada fila nueva se agrega en el mismo commit que la función que describe. Sin fila → la función no existe como entidad auditable.
