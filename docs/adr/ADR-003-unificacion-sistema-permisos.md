# ADR-003: Unificación del sistema de permisos y activación de custom_permissions

## Estado
Aceptado e implementado.

## Contexto

Durante la auditoría de la pantalla de gestión de usuarios (`usuarios-unificado.tsx`) se
encontró que el botón "Guardar permisos" del modal de permisos personalizados mostraba un
toast de éxito sin realizar ninguna llamada real al backend (Hallazgo 2, sesión de auditoría
de agosto 2026). Al corregir esa conexión, se descubrió un problema mucho más profundo:
`custom_permissions`, una vez persistido correctamente en la base de datos, no tenía ningún
efecto en ninguna decisión real de autorización del sistema.

La investigación reveló la causa raíz: existían **dos sistemas de permisos completamente
independientes y en su mayoría incompatibles**, construidos en paralelo sin que se hablaran
entre sí:

- **Sistema A** (`shared/user-roles.ts`): usado por el frontend para poblar el modal de
  permisos personalizados. Definía ~56 claves con nombres orientados a la interfaz (por
  ejemplo `reports.financial`, `settings.institution`, `admissions.create`).
- **Sistema B** (`shared/permissions.ts`): usado por el backend real. Las llamadas a
  `hasPermission(role, module, action)` en `server/routes/` (54 al momento del hallazgo,
  88 al cierre de esta auditoría) verificaban contra este sistema.

De las 56 claves del Sistema A: 9 coincidían exactamente con el Sistema B, 10 tenían un
equivalente real con nombre distinto, y **37 eran huérfanas** — no correspondían a ningún
`hasPermission()` real del backend. Si un administrador otorgaba `reports.financial` a un
asistente desde el modal, ese valor nunca haría match contra ningún guard real, porque el
backend busca `reports.read`, no `reports.financial`.

Adicionalmente, el JWT emitido al login no incluía `custom_permissions`, y `authenticateToken`
no lo leía de ninguna fuente — el campo llegaba a la base de datos y ahí se quedaba, sin
ningún punto de lectura en el flujo de autorización.

## Decisión

**Opción A: `shared/permissions.ts` (el sistema del backend) se establece como única fuente
de verdad.** Se descartaron dos alternativas:

- *Opción B (unificar en `shared/user-roles.ts`)*: habría requerido reconstruir seis módulos
  de autorización ya validados con decisiones de negocio explícitas y probados con cientos de
  tests, para hacerlos coincidir con un sistema de etiquetas de UI que nunca tuvo la intención
  de ser un motor de autorización real.
- *Opción C (tabla de traducción entre ambos sistemas)*: descartada por máxima deuda técnica
  sin beneficio real — mantiene dos fuentes de verdad divergiendo con el tiempo.

Implementación en cinco partes:

**1. Frescura del dato — base de datos, no JWT.** `authenticateToken` y `requireAuth`
(`server/routes/shared.ts`) hacen `SELECT custom_permissions FROM users WHERE id = $1` en
cada request y lo adjuntan a `req.user.custom_permissions`. La alternativa (viajar en el JWT)
habría significado que revocar un permiso sensible no tendría efecto hasta que el token
expirara (hasta 24h) — inaceptable para un sistema cuyo propósito es control fino y revocable.

**2. Evaluación perezosa.** `hasPermissionForUser(user, module, action, scope)` evalúa primero
`hasPermission(user.role, module, action, scope)` (el comportamiento preexistente, sin cambio).
Solo si eso devuelve `false` revisa `user.custom_permissions.includes('${module}.${action}')`.
Los usuarios sin permisos personalizados —la mayoría— no incurren ningún costo de lógica
adicional más allá del SELECT ya necesario en `authenticateToken`.

**3. Migración mecánica.** Las 88 llamadas reales a `hasPermission(...)` en 9 archivos de
rutas se migraron a `hasPermissionForUser(...)` siguiendo un patrón mecánico de
búsqueda-reemplazo (documentado por variante de llamada: `user.role`, `req.user?.role`,
`actor.role`, `role` suelto), no edición criterio a criterio.

**4. Reconciliación del modal.** `usuarios-unificado.tsx` se reescribió para ofrecer
exactamente las claves canónicas de `shared/permissions.ts`, no las 56 originales de
`user-roles.ts`. De las 37 claves huérfanas: 14 correspondían a rutas reales sin guard de
módulo (ver sección "Trabajo derivado" abajo) y se promovieron a permisos reales; el resto
se descartaron por ser redundantes, ficticias, o legítimamente controladas solo por jerarquía
de rol (ver Alternativas descartadas).

**5. Verificación de no regresión.** Para cada usuario sin `custom_permissions`, el segundo
término de `hasPermissionForUser` (`.includes(...)` sobre un array vacío) siempre es `false`,
así que el resultado es matemáticamente idéntico al de `hasPermission()` sin el wrapper.
Verificado empíricamente comparando resultados de test por nombre (no solo el total) antes y
después de la migración: 0 regresiones.

## Alternativas descartadas (claves huérfanas del Sistema A)

De las 37 claves sin equivalente real, se descartaron sin promover a permiso real:
`users.manage_permissions` (ya cubierto por `users.update` + jerarquía de rol),
`charges.bulk_create` (mismo guard que `charges.create`), `payments.create` (los endpoints de
creación de pago pasan por `payments.process`), `payments.delete` (los pagos son append-only
por requisito de auditoría), `reports.academic`/`reports.administrative` (el backend no
distingue tipo de reporte), `scholarships.update`/`scholarships.delete` (el ciclo de vida de
una beca pasa íntegro por `scholarships.assign`), `concepts.read`/`concepts.delete` (sin
función real distinta de `concepts.configure`), `dashboard.advanced` (sin implementación),
`migration.access`/`migration.execute` (operación de superadmin — delegarlo vía
`custom_permissions` sería peligrosamente amplio), `credentials.read`/`credentials.manage`
(sin endpoint real), `notifications.read` (leer notificaciones propias es libre para todo
usuario autenticado).

## Trabajo derivado — el "ADD GUARD"

Al verificar cuáles de las 37 claves huérfanas correspondían a rutas reales, se descubrió que
**`students`, `families`, lectura de `payments`, `receivables`, y `fiscal` no tenían ningún
guard de rol** más allá de `authenticateToken` — cualquier usuario autenticado podía leer y
escribir el registro completo de alumnos y familias, leer cuentas por cobrar, y operar rutas
de CFDI. Se aplicó guard real a los 8 módulos afectados (incluida la creación de
`MODULES.ADMISSIONS`, inexistente hasta entonces), cada uno con reproducción empírica del
hueco antes del fix y prueba de bloqueo + control positivo después.

Una investigación posterior y más amplia del sidebar completo (26 pantallas del panel
administrativo) encontró el mismo patrón repetido de forma sistemática: rutas *alias* sin
parámetro de campus quedaban sin guard mientras su versión canónica sí lo tenía, en
`planes-pago`, `calendario`, `reporte-consejo`, `semáforo-riesgo`, `becas`, `conciliación`,
`fiscal`, `notificaciones` y `dashboard/comandos`. Se corrigieron todos los casos de severidad
Alta y Media identificados en esa auditoría.

## Consecuencias

- `custom_permissions` ahora tiene efecto real y verificado en una decisión de autorización
  (probado de extremo a extremo: otorgar `charges.create` a un `asistente` vía
  `custom_permissions` cambia el resultado de una petición real, y revocarlo con el mismo
  token, sin re-login, revierte el efecto de inmediato).
- El sistema de permisos del frontend (`shared/user-roles.ts`) queda obsoleto como fuente de
  autorización. Sigue existiendo para la tab de "permisos por defecto del rol" del modal
  (solo lectura, no escribe nada) — cualquier trabajo futuro que lo extienda debe usar
  `shared/permissions.ts` como única fuente de verdad, no reintroducir el sistema paralelo.
- Costo de rendimiento: un `SELECT` adicional por request autenticado (en `authenticateToken`).
  Aceptado como razonable dado que la tabla `users` tiene índice por `id` (PK).
- Deuda pendiente: la matriz de permisos financieros (`PAYMENTS.READ`, `DASHBOARD.READ`,
  `FAMILIES.READ`, `RECEIVABLES.READ`) tenía asignaciones heredadas sin revisión deliberada
  para el rol `admisiones` en varios módulos — se corrigieron caso por caso con decisión
  explícita del propietario del producto durante esta misma auditoría, pero cualquier módulo
  nuevo que se agregue debe decidir explícitamente el alcance de cada rol, no heredar por
  default de módulos similares.
