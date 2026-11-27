# Resultados de la fase 2: matriz de roles contra pantallas

Fecha: 26-nov-2026. Commit `8400ba6`. Entorno: base desechable `edupay_ci` (PostgreSQL 18), servidor local con `APP_ENV=test`, navegador Chromium controlado con Playwright. Producción no se tocó. Las cuentas y el ajuste de `tenant_id` de los alumnos son los de `resultados-fase-1-2026-11-26.md`.

## Método

Para cada uno de los 7 roles se inició sesión por la API (con el 2FA real) y se inyectó la sesión en el navegador. Con esa sesión se abrieron las 35 pantallas enrutadas del personal (245 navegaciones). En cada una se registró: los enlaces del menú lateral, la ruta final, el título, las llamadas a la API con error y con éxito, los errores de consola y los mensajes de error visibles en pantalla.

Se hicieron dos corridas. La primera dio resultados contaminados por ruido que hubo que filtrar:
- Los 429 de mi propio volumen de navegación (el límite es de 300 peticiones por 5 minutos y por usuario).
- La llamada `onboarding-status`, que responde 403 por diseño a los roles sin `settings.configure` en cada pantalla.
- El contador `excepciones/count`, que consultan sin permiso AX y AD en cada pantalla.
- El aviso "No disponible por ahora", que es un estado deliberado y no un error.

La segunda corrida (12.7 min) añadió una pausa por pantalla, registró también las llamadas exitosas y excluyó ese ruido. **Las cifras de este informe son las de la segunda corrida.** Un error de consola de WebSocket hacia `localhost:5173` y `localhost:5000/?token=...` aparece en todas las pantallas; es el cliente de Vite del servidor de desarrollo y no se evaluó.

## Resumen

- 245 navegaciones sin fallos de navegación ni errores 5xx.
- 16 combinaciones de rol y pantalla tienen enlace visible en el menú y la pantalla falla (403 en sus propias llamadas o mensaje de error).
- 1 redirección, correcta: admisiones en `/admin` pasa a `/dashboard-admisiones`.
- Se confirmaron en pantalla varios hallazgos de permisos que antes solo estaban probados por API.
- Aparecieron 4 defectos nuevos (Q-15 a Q-18) y 2 observaciones de producto.

Menú por rol: SA 21 enlaces, AG 21, AC 19, CG 13, AX 11, AD 4, AS 7.

## Matriz rol por pantalla

Leyenda: `O` carga sin errores y tiene enlace; `o` carga sin errores y no tiene enlace (accesible por URL); `X` tiene enlace pero la pantalla falla por sus propias llamadas; `x` falla y no tiene enlace (el servidor la bloquea); `R` redirige.

| Ruta | SA | AG | AC | CG | AX | AD | AS |
|---|---|---|---|---|---|---|---|
| / | o | o | o | o | o | x | x |
| /admin | O | O | O | O | X | R | O |
| /dashboard-admisiones | o | x | x | x | x | x | x |
| /dashboard-caja | o | o | o | o | o | x | o |
| /estudiantes | O | O | O | O | O | O | O |
| /familias | O | O | O | O | O | X | O |
| /usuarios | O | O | O | x | x | x | x |
| /cargos | O | O | O | X | X | x | X |
| /pagos | O | O | O | O | X | X | X |
| /cuentas-por-cobrar | O | O | O | O | O | x | x |
| /catalogo-productos | O | O | O | x | x | x | x |
| /becas | O | X | O | X | x | x | x |
| /notificaciones | O | O | O | o | o | x | x |
| /reportes | O | O | O | X | X | x | X |
| /configuracion | O | O | O | o | o | o | o |
| /configuracion-inicial | o | o | o | o | o | o | o |
| /configuracion-pagos-completa | O | X | O | x | x | x | x |
| /emision-cargos | o | o | o | x | x | x | x |
| /asignacion-precios | O | O | O | x | x | x | x |
| /importacion-datos | O | O | o | o | o | o | o |
| /caja-conciliacion | O | O | O | O | X | x | x |
| /fiscal-contable | O | O | O | O | O | x | x |
| /reportes-financieros | O | O | O | O | O | o | O |
| /reportes-admisiones | o | x | o | x | x | O | o |
| /aprobaciones | O | O | o | o | o | o | o |
| /historial | O | O | O | O | x | x | x |
| /profile | o | o | o | o | o | o | o |
| /comandos-contador | o | o | o | x | x | x | x |
| /semaforo-riesgo | o | o | o | o | o | x | x |
| /planes-pago | o | o | o | o | o | x | x |
| /calendario-financiero | o | o | o | o | o | o | o |
| /reporte-consejo | o | o | o | o | x | x | x |
| /reporte-antiguedad-saldos | o | o | o | o | o | o | o |
| /reporte-riesgo | o | o | o | o | o | x | x |
| /excepciones-conciliacion | O | O | O | O | X | x | o |

Una `x` significa que el servidor devolvió 403 a las llamadas de datos propias de esa pantalla: es el comportamiento correcto para un rol sin permiso. Un `o` en un rol restringido (CG, AX, AD, AS) significa que la pantalla se abrió y cargó datos sin recibir 403.

## Defectos nuevos reproducidos (continúan la numeración de la fase 1)

| ID | Defecto | Evidencia |
|---|---|---|
| Q-15 | **Enlaces del menú que abren pantallas rotas.** El menú ofrece 16 combinaciones cuya pantalla recibe 403 en sus propias llamadas. Detalle abajo | Tabla "Enlaces visibles que fallan" |
| Q-16 | **La pantalla de inicio de admisiones y asistente llama a un endpoint retirado.** `GET /api/admin/admissions-report` responde 404 a todos los roles que cargan esa pantalla. Admisiones además recibe 403 en `/api/payments` y en `/api/admin/dashboard/2` desde su inicio | 404 en `/`, `/admin` y `/dashboard-admisiones` |
| Q-17 | **Tratamiento inconsistente del asistente frente al auxiliar contable.** El asistente (AS, el rol más bajo salvo admisiones) lee `/api/conciliacion/excepciones` (excepciones bancarias), `/api/caja/pagos-efectivo`, `/api/caja/estadisticas-conciliacion` y `/api/admin/dashboard/1` con 200, mientras el auxiliar contable (AX), que sí tiene el enlace "Excepciones bancarias", recibe 403 en la lista y en el contador | AS: 200 en esas 4 llamadas; AX: 403 en excepciones |
| Q-18 | **El contador de excepciones bancarias se consulta sin permiso en cada pantalla.** AX y AD disparan `GET /api/conciliacion/excepciones/count` y reciben 403 en cada navegación (el menú lo usa como insignia), y `onboarding-status` da 403 a todo rol sin `settings.configure`. No rompe la pantalla, pero genera decenas de 403 por sesión | 403 repetidos en las 35 pantallas |

### Enlaces visibles que fallan (Q-15)

| Rol | Pantalla con enlace | Llamada que falla |
|---|---|---|
| AD | /familias (Familias) | `GET /api/families/2` 403; el mensaje en pantalla es "Error al cargar familias. Error 403: Sin permisos..." |
| AD | /pagos (Pagos de Inscripciones) | `GET /api/payments` 403 y `GET /api/payments/manual-options` 403 |
| AX, AS | /pagos | `GET /api/payments/manual-options` 403 |
| CG, AX, AS | /cargos | `GET /api/concepts` 403 |
| CG, AX, AS | /reportes | `GET /api/concepts` 403 |
| AG, CG | /becas | `GET /api/scholarships` 403; mensaje "No se pudieron cargar los datos" |
| AG | /configuracion-pagos-completa | `GET /api/payment-config/due-dates-complete`, `due-date-periods` y `surcharge-rules-complete`, las tres 403 |
| AX | /caja-conciliacion | `GET /api/payments/manual-options` 403 |
| AX | /excepciones-conciliacion | `GET /api/conciliacion/excepciones` 403 |
| AX | /admin | `GET /api/conciliacion/excepciones` 403 |

Esto confirma en pantalla los hallazgos H-B01, H-B02 y H-B03 y agrega los casos de `/api/concepts` (CG, AX y AS ven Cargos y Reportes pero no pueden leer los conceptos) y de `manual-options` (AX y AS ven Pagos).

## Datos que cargan los roles restringidos

Sin que se abra ningún 403, estos roles cargaron datos de pantallas sin enlace en su menú:

| Rol | Pantallas sin enlace que cargan datos |
|---|---|
| CG | `/dashboard-caja` (receivables, payments, students), `/notificaciones` (historial y estadísticas de correo), `/semaforo-riesgo`, `/planes-pago`, `/calendario-financiero`, `/reporte-consejo`, `/reporte-antiguedad-saldos`, `/reporte-riesgo`, `/aprobaciones` |
| AX | `/dashboard-caja`, `/notificaciones`, `/semaforo-riesgo`, `/planes-pago`, `/calendario-financiero`, `/reporte-antiguedad-saldos`, `/reporte-riesgo`, `/aprobaciones` |
| AD | `/reportes-financieros` (datos del reporte financiero), `/reporte-antiguedad-saldos`, `/calendario-financiero`, `/aprobaciones` |
| AS | `/dashboard-caja` (receivables, payments, students), `/excepciones-conciliacion`, `/reportes-admisiones`, `/reporte-antiguedad-saldos`, `/calendario-financiero`, `/aprobaciones` |

La mayoría de estas lecturas son coherentes con los permisos del rol (por ejemplo, CG tiene `receivables.read` y `financial.read`). Las que no encajan con el diseño están en la sección siguiente.

## Observaciones de producto (requieren decisión, no son defectos comprobados)

Corresponden a las decisiones 1 y 2 de la sección 7 del plan.

1. **Reportes financieros para asistente y admisiones.** El asistente tiene el enlace "Reportes Financieros" en su menú y admisiones abre `/reportes-financieros` por URL; ambos cargan `GET /api/reportes/financiero` con 200 y `/reporte-antiguedad-saldos` también para AD, AS y AX. Es el comportamiento que las pruebas existentes documentan como diseño (`REPORTS.read` universal), pero choca con la restricción escrita en `permissions.ts` ("no puede ver análisis financiero").
2. **La pantalla de Aprobaciones abre con datos para cualquier rol.** CG, AX, AD y AS cargan sin 403 las cuatro llamadas de `/aprobaciones` (pendientes, mis solicitudes, historial, notificaciones). No se verificó qué filas devuelven a cada rol; relacionado con H-D06.

## Hallazgos de agentes confirmados o actualizados por esta fase

| Hallazgo | Estado tras la fase 2 |
|---|---|
| H-B01 (AG sin `settings.read`) | Confirmado en pantalla: `/configuracion-pagos-completa` falla con 3 llamadas 403 |
| H-B02 (AG y CG sin `scholarships.read`) | Confirmado en pantalla: mensaje "No se pudieron cargar los datos" |
| H-B03 (AD ve Familias sin permiso) | Confirmado en pantalla: "Error al cargar familias" |
| H-D04 (admisiones consulta un endpoint retirado) | Confirmado: 404 en la pantalla de inicio (Q-16) |
| H-D17 / H-D19 (dashboard por rol, errores de admisiones) | Confirmado: el inicio de AD y AS llama a un endpoint retirado y AD recibe 403 en `/api/payments` |
| H-D13 (roles `caja` y `contador` en `RoleBasedDashboard`) | No se pudo probar: no existe un usuario con esos roles |
| Redirección de admisiones | Correcta: `/admin` pasa a `/dashboard-admisiones` |

## Qué no cubre esta fase

- **Solo se probó la carga de cada pantalla.** No se pulsaron botones, ni se llenaron formularios, ni se abrieron diálogos: eso es la fase 3 a la 6, por módulo.
- **No se inspeccionó qué filas devuelve cada llamada exitosa**, solo que respondió 2xx. Que un rol cargue `/api/approvals/pending` con 200 no dice si ve solicitudes de otras personas.
- **El rol super_admin sin escuela** (`qa.sa@qa.test`) no se incluyó: no puede enrolar el 2FA (Q-06). Se usó el superadmin del seed, que sí tiene escuela.
- **Roles no existentes en datos:** `caja`, `auxiliar_caja`, `admin`, `contador` no pudieron probarse.
- **Tutor:** no hay pantallas de personal para este rol; su portal se prueba en la fase 5.
- **Pantallas no recorridas:** `/demo-setup`, `/demo-aprobaciones`, `/migration-refeerence`, `/cuentas-standalone`, `/portal-3clics` y rutas públicas de acceso.
- **Capturas de pantalla:** no se guardaron; los mensajes visibles se tomaron del texto de la página.
- **Modo del servidor:** el servidor de pruebas corre en modo desarrollo (Vite). El comportamiento de la compilación de producción no se probó.

## Relación con el plan

El plan se actualizó con estos defectos. De cara a la fase 3, la base desechable sigue con los mismos datos; el servidor de pruebas y el puente siguen corriendo.
