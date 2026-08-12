# Traspaso — Auditoría de seguridad y correctitud, agosto 2026

Este documento resume el estado del código tras una auditoría exhaustiva de varios días
sobre la totalidad del sistema (237 funciones inventariadas originalmente). Está pensado
para que cualquier programador que continúe el trabajo en Claude Code tenga el contexto
completo sin tener que reconstruirlo desde el historial de commits.

## Estado de la suite de tests

660+ tests, 0 fallos, en el commit `ac0a33c` (rama `replit-en-vivo`). Cada hallazgo de esta
auditoría tiene su propio archivo o bloque de test con nomenclatura consistente (prefijo de
2-4 letras + número, ej. `PPG-01`, `CHG-23b`, `FSC-14`).

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

## Integraciones externas — explícitamente fuera de alcance de esta sesión

Conekta/procesador de pagos real, PAC de facturación CFDI, y WhatsApp Business API siguen
simulados. El motor que los va a consumir (conciliación de tres bandejas, idempotencia de
webhooks, ledger inmutable) ya está construido y probado — conectar un proveedor real es
trabajo de integración, no de arquitectura desde cero.
