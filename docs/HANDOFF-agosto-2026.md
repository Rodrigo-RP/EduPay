# Traspaso — Auditoría de seguridad y correctitud, agosto 2026

Este documento resume el estado del código tras una auditoría exhaustiva de varios días
sobre la totalidad del sistema (237 funciones inventariadas originalmente). Está pensado
para que cualquier programador que continúe el trabajo en Claude Code tenga el contexto
completo sin tener que reconstruirlo desde el historial de commits.

## Estado de la suite de tests

1135 tests, 0 fallos, en el commit `4c51340` (rama `replit-en-vivo`). Cada hallazgo de esta
auditoría tiene su propio archivo o bloque de test con nomenclatura consistente (prefijo de
2-4 letras + número, ej. `PPG-01`, `CHG-23b`, `FSC-14`).

## Entregables verificados — segunda ronda (agosto 2026)

Las siguientes piezas quedaron construidas, testeadas y en suite verde en esta misma rama
(`replit-en-vivo`), al final de la sesión:

**Catálogo de 8 reportes (RPT-01 a RPT-08):**
Financiero · Estudiantes · Cobranza · Admisiones · Consejo Directivo · Contable ·
Antigüedad de Saldos · Riesgo de Cartera.
Cada uno tiene: GET con guards correctos (REPORTS.READ / ADMISSIONS.READ / FINANCIAL.READ /
FISCAL.READ según el caso), POST /exportar con REPORTS.EXPORT, Excel y PDF reales, filtros
por ciclo/nivel/grado/grupo/fecha/concepto/estado/semáforo. Guards y exportadores cubiertos
en `export-role-guard.test.ts`, `rpt01`–`rpt08` test files, `consejo-role-guard.test.ts`.

**Navegador universal — 5 niveles completos:**
N1 intención+navegación · N2 resultado directo en respuesta · N3 exportar Excel/PDF desde
asistente · N4 sugerir acciones (Forma A) · N5 ejecutar con confirmación.
Cubierto en `assistant-knowledge.test.ts` (47), `assistant-export.test.ts` (23),
`assistant-suggest.test.ts` (11), `assistant-catalogo-productos-fix.test.ts` (8).

**Motor de acciones — primer caso: conciliación:**
`server/routes/acciones.ts` + migración `017_acciones_seguimiento.sql`. Bandeja de
excepciones, asignación de responsable, resolución con maker-checker.
Cubierto en `acciones-seguimiento.test.ts` (11), `excepciones-conciliacion.test.ts` (16).

**Panel narrativo de insights (NI-01 a NI-05):**
`server/lib/narrative-insights.ts` + integración en `reportes-consejo.ts`. Reglas de umbral
con plantillas de texto fijas (Forma A — nunca LLM). Severidades: info / warning / critical.
Cubierto en `nit-narrative-insights.test.ts` (8).

**Check constraints IEDU en schema Drizzle:**
`invoices_curp_alumno_check`, `invoices_nivel_educativo_check`, `invoices_forma_pago_check`
declarados en `shared/schema.ts` con la sintaxis exacta de la DB. Verificado: `drizzle-kit
generate` no produce ningún DROP CONSTRAINT.

**Barrido de contrato frontend-backend (hallazgos corregidos):**
- `reglas-pago.tsx`: `campus_id: 24` hardcodeado → `user?.campus_id` + header Authorization
  faltante en `createRuleMutation` y `testRuleMutation` — ambos corregidos.
- `estudiantes.tsx`: `invalidateQueries('/api/admin/students/1')` → `/api/admin/students`
  (en mutaciones de crear e importar).
- Regresión documentada con evidencia E2E en `fix-hardcoded-campus-and-invalidation.test.ts`.

## Documentos de referencia obligatoria antes de tocar autorización o permisos

- `docs/adr/ADR-001-efectos-secundarios-fuera-de-transaccion.md` — por qué `audit_log` se
  escribe fuera de la transacción principal, con cola de reintentos.
- `docs/adr/ADR-002-planes-de-pago-integrados-al-ledger.md` — por qué los planes de pago son
  `Charges` reales, no una tabla paralela.
- `docs/adr/ADR-003-unificacion-sistema-permisos.md` — **el más importante para cualquier
  cambio de permisos.** Explica por qué existía (y ya no existe) un segundo sistema de
  permisos incompatible, y por qué `shared/permissions.ts` es la única fuente de verdad.
  Cualquier trabajo futuro sobre roles o permisos debe partir de este documento.

## Reglas no negociables descubiertas y corregidas en esta auditoría

1. **Nunca registrar una ruta condicionada por `NODE_ENV`** (`if (process.env.NODE_ENV !==
   "production") { app.post(...) }`). Este patrón apareció tres veces en la sesión como
   bypass de rate limiting, siempre con el mismo resultado: alcanzable sin restricción en el
   modo `development` real de cualquier entorno de trabajo. La solución correcta siempre fue
   eliminar la ruta, nunca reforzar el guard.
2. **Todo endpoint que lea o escriba datos de más de un usuario necesita `hasPermissionForUser`
   (no solo `authenticateToken`).** Se encontraron y corrigieron guards faltantes en decenas
   de endpoints a lo largo de la sesión — el patrón más común era una ruta *alias* sin
   parámetro de campus que quedaba huérfana mientras su versión canónica sí tenía guard.
3. **Nunca confiar en el schema de Drizzle (`shared/schema.ts`) como fuente de verdad de la
   estructura real de la base de datos.** Se encontraron múltiples discrepancias (columnas
   declaradas que no existen, columnas reales no declaradas) que causaban fallos silenciosos
   — la tabla `scholarships` fue el caso más grave. Verificar contra `information_schema`
   directamente ante cualquier duda.
4. **Todo pago, condonación o cambio financiero sensible debe ser atómico** (`SELECT ... FOR
   UPDATE` o el patrón `UPDATE ... WHERE estado = 'activo' RETURNING id`) para prevenir doble
   ejecución bajo concurrencia. Ver `payment-concurrency.test.ts` para el catálogo completo de
   casos ya cubiertos.

## Pendiente conocido (sin urgencia crítica, documentado para continuidad)

- Tarea #109/#117 (histórico): ya resuelto — verificar en el ADR-003 si aplica a trabajo futuro.
- JWT no se invalida tras reset de contraseña (sesión activa sobrevive hasta su expiración
  natural, hasta 24h). Solución estándar propuesta y no implementada: columna
  `password_changed_at` + comparación contra `iat` del JWT en `authenticateToken`.
- Bug de calidad de dato: `GET /api/charges` devuelve `concepto: null` (falta `JOIN` con
  `concepts` en `storage.getChargesByCampus`).
- Cola de hallazgos de baja severidad sin cerrar: ver el archivo de seguimiento completo de
  la sesión (`pendientes-edupay.md`, fuera de este repositorio) para el detalle exhaustivo.

## Integraciones externas — pendientes de decisión/acción de Rodrigo

**Stripe (pasarela de pagos):** proveedor seleccionado. Pendiente que Rodrigo complete el
proceso de alta comercial y proporcione las credenciales de API para construir el adaptador.
El motor de conciliación, ledger e idempotencia de webhooks ya está construido — conectar
Stripe es trabajo de integración de una semana, no de arquitectura desde cero.

**PAC de facturación CFDI** (Facturama, FiscalCloud, o SW Sapien): pendiente que Rodrigo
decida el proveedor y gestione el contrato. La lógica CFDI 4.0 con complemento IEDU, los
validators de CURP/RVOE/nivel educativo/forma de pago, y los check constraints de la DB ya
están implementados — el PAC es solo la conexión final de timbrado.

**WhatsApp Business API:** sigue simulado. Sin decisión comercial activa aún.

## Pendiente técnico conocido (sin urgencia crítica, documentado para continuidad)

- **4 tablas declaradas en Drizzle sin existir en DB real:** `platform_profiles`,
  `platform_subscriptions`, `scholarship_benefits`, `scholarship_criteria`. Si se ejecuta
  `drizzle-kit push`, intentará crearlas. Pendiente: eliminarlas del schema o migrarlas.
  (Ver tarea #193 en el backlog.)
- JWT no se invalida tras reset de contraseña — sesión activa sobrevive hasta su expiración
  natural (hasta 24h). Solución estándar: columna `password_changed_at` + comparación contra
  `iat` del JWT en `authenticateToken`.
- `GET /api/charges` devuelve `concepto: null` — falta JOIN con `concepts` en
  `storage.getChargesByCampus`.
- Drift `timestamp` vs `timestamptz` en `campus_payment_config` y `family_payment_sources` —
  Drizzle y DB real difieren en tipo de columna, sin impacto funcional actual.
