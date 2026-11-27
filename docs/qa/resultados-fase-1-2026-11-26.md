# Resultados de la fase 1: acceso y seguridad

Fecha: 26-nov-2026. Commit `8400ba6`. Entorno: base desechable `edupay_ci` en PostgreSQL 18 (marcada `edupay:test`), servidor local con `APP_ENV=test`, SSO de prueba activo y `SSO_ONLY` apagado, 2FA real (cada cuenta se enroló por el flujo normal de la aplicación). Producción no se tocó. Los scripts de prueba viven fuera del repositorio (carpeta temporal de la sesión).

## Cuentas de prueba usadas (todas ficticias, contraseña de la base desechable)

| Rol | Cuenta | Escuela y campus |
|---|---|---|
| super_admin del seed | superadmin@edupay.mx | escuela 1, campus 1 |
| super_admin sin escuela (como un superadmin puro) | qa.sa@qa.test | sin escuela ni campus |
| administrador_general | directora@jfr.edu.mx | escuela 1, Norte |
| administrador_campus | admin.campus@jfr.edu.mx | escuela 1, Norte |
| contador_general | contador@jfr.edu.mx | escuela 1, Norte |
| auxiliar_contable | caja@jfr.edu.mx | escuela 1, Norte |
| admisiones | admisiones@jfr.edu.mx | escuela 1, Sur |
| asistente | qa.asistente@qa.test | escuela 1, Norte |
| administrador_campus de otro campus | qa.ac2@qa.test | escuela 1, Sur |
| administrador_campus y general de otra escuela | qa.acb@qa.test, qa.ag.b@qa.test | escuela 51, campus 51 |
| tutor | lopez.carlos@demo.mx | escuela 1 |

Ajuste de datos de prueba: el seed deja `tenant_id` nulo en los 15 alumnos; se completó en la base desechable para parecerse a producción (el puente sí lo llena). Sin ese ajuste `GET /api/admin/students` devuelve una lista vacía.

## Resumen

Se ejecutaron 83 pruebas dinámicas contra el servidor real: 47 pasan y 36 fallan. Cada fallo afirma el comportamiento diseñado, así que un fallo es un defecto reproducido (o una decisión de producto pendiente), no una prueba rota. Las 36 fallas son 14 defectos distintos.

## Defectos reproducidos

| ID | Defecto | Evidencia | Funciones |
|---|---|---|---|
| Q-01 | No existe `POST /api/auth/logout`: cerrar sesión no revoca el token | HTTP 404 | A-08 |
| Q-02 | `POST /api/users`: correo duplicado responde 500; contraseña de 1 carácter y correo sin formato se aceptan | 500 y dos respuestas 2xx | A-30 |
| Q-03 | `PUT /api/profile/password` acepta una contraseña nueva de 1 carácter | HTTP 200 | A-38 |
| Q-04 | Un administrador de campus puede otorgar `system.configure` y `security.configure` a un subordinado, y esa persona pasa la guarda de permiso del mantenimiento global (queda en 500 por Q-05, no en 403) | PUT 200; el endpoint ya no responde 403 | A-32 |
| Q-05 | Los endpoints de mantenimiento de BD están rotos: `optimize-database` falla por una columna `tablename` inexistente; `cleanup-database` por la tabla `sessions`, que ya no existe en el esquema; `database-maintenance` por ambos. Siempre responden 500, incluso a quien tiene permiso. `database-performance` sí funciona | 3 de 4 con HTTP 500 y causas en el log del servidor | A-50 |
| Q-06 | Un superadmin sin escuela recibe 404 al configurar el 2FA y 403 al crear usuarios por la ruta de superadmin. Afecta el acceso de emergencia de `SSO_ONLY` si se usa una cuenta así | 404 y 403 | A-37, A-52 |
| Q-07 | Seis lecturas sin guarda de permiso por módulo: `/api/dashboard/contador`, `/api/receivables`, `/api/caja`, `/api/admin/charges`, `/api/crm/prospects`, `/api/admin/dashboard` responden 200 a asistente y admisiones | 12 de 12 combinaciones con 200 | D-21, D-23, D-63 |
| Q-08 | Cruce de campus dentro de la misma escuela: un administrador del campus 1 recibe 200 en `/api/admin/dashboard/2`, `/api/admin/students/2`, `/api/admin/guardians/2`, `/api/admin/concepts/2`, `/api/planes-pago/2` y `/api/calendario/eventos/2`. `/api/families/2` sí responde 404, y desde otra escuela todas se rechazan | 6 de 7 con 200 | B-02, B-09, B-26, D-18 |
| Q-09 | `POST /api/charges/generate` no valida permiso de módulo: un asistente y un auxiliar contable llegan a la validación de negocio (422) en lugar de un 403. No se completó una emisión de prueba | 422 y 404 de negocio, ningún 403 | C-02, D-16 |
| Q-10 | Un asistente consulta `/api/assistant/modules` y ejecuta `/api/assistant/diagnose` con `autoFixConfirmed:true`, ambos con 200 | HTTP 200 | D-59 |
| Q-11 | El administrador general recibe 403 en las tres lecturas de Configuración de Pagos y, junto con el contador general, en `/api/scholarships` | 5 de 5 con 403 | B-31, B-47, B-48, B-50 |
| Q-12 | Editar el apellido de un alumno no actualiza `nombre_completo` | La columna conserva el valor anterior | B-04 |
| Q-13 | El token que entrega la liga mágica no lleva `campus_id` (sí lo llevan los de login y de SSO), por lo que el pago por esa vía no puede localizar la cuenta de Stripe del campus | Claims: id, email, tenant_id, type, password_version, session_started_at, iat, exp | D-02, D-08 |
| Q-14 | Una aprobación rechazada puede aprobarse después | Rechazar 200, luego aprobar 200 | C-37 a C-40, D-50 |

## Hallazgos de los agentes que NO se reprodujeron

| Hallazgo | Resultado | Explicación |
|---|---|---|
| H-A01: el historial de auditoría no valida permiso | **Falso positivo** | `GET /api/audit-log` está registrado dos veces. La versión de `misc.ts` se registra primero, exige `security.read` y es la que responde: asistente, admisiones y auxiliar contable reciben 403. El manejador de `audit-log.ts` nunca se alcanza. Yo había dado este hallazgo por "verificado" leyendo solo `audit-log.ts`; la prueba dinámica lo desmintió |
| H-A03: un administrador general borra eventos de seguridad de todas las escuelas con la limpieza global | **No se materializa** | La limpieza falla antes de borrar nada (Q-05). Además su política solo elimina eventos con más de 365 días |

## Pruebas que pasan (comportamiento correcto confirmado)

- **Login (A-01, A-02):** credenciales incorrectas y usuario inexistente dan la misma respuesta 401; faltan datos: 400; usuario desactivado: 401; código de respaldo de 2FA entra una vez y la segunda falla; códigos mal formados y con SQL: 401.
- **Sesión (A-05, A-06, A-11):** la respuesta de usuario no expone hash ni secreto; el refresh rechaza un token manipulado; un usuario sin 2FA recibe 403 `TWOFA_SETUP_REQUIRED` en la API de negocio; el token de tutor no sirve en rutas de personal y viceversa.
- **Invalidación de sesiones (A-10):** cambiar el rol, desactivar al usuario y restablecer su contraseña invalidan su sesión; la clave temporal tiene 12 o más caracteres y no aparece en `audit_log`.
- **2FA (A-26, A-27, A-28):** segundo `setup` con 2FA activo: 409; código de confirmación malo: rechazado; desactivar el 2FA propio: 403; el restablecimiento por un administrador general exige motivo, doble confirmación y es de un solo uso (409 al repetir); un administrador de campus, uno mismo y otra escuela reciben 403 o 404; tras el restablecimiento la sesión anterior cae y la cuenta debe registrar el 2FA de nuevo.
- **Usuarios y jerarquía (A-29 a A-34, A-40):** listado con hash y secretos ausentes, asistente 403, administrador de otra escuela sin ver usuarios ajenos; administrador de campus no crea un administrador general; `is_super_admin` y rol `super_admin` por el cuerpo se rechazan; un asistente no edita a un administrador general; nadie se cambia su propio rol, ni se borra, ni se restablece la contraseña a sí mismo; otro campus y otra escuela no pueden editar, borrar ni restablecer a un usuario ajeno; la contraseña actual incorrecta se rechaza; un asistente no escribe la información institucional.
- **Auditoría (A-47):** el administrador general la lee y el límite se acota a 100; la búsqueda con comilla no produce 500; no muestra movimientos de otra escuela.
- **Plataforma (A-41, A-42, A-49, A-51, A-52):** los candidatos del Dashboard exigen superadmin y `tenant_id` inválido es 400; asignar rol `super_admin` o un candidato inexistente se rechaza; las rutas de seguridad no disponibles dan 501, 403 o 401 según el caso; el panel de plataforma es solo para superadmin; `/api/super-admin/create` sigue denegada.
- **Cambios en vivo (A-53):** token basura, token de tutor (cierra con 4001) y conexión sin autenticar no reciben datos; el token de personal con 2FA verificado obtiene `auth_success`.
- **Páginas huérfanas (A-56):** `/switch-to-school`, `/logout-and-login-school`, `/super-admin-login` y `/super-admin-access` no ejecutan ningún login automático ni dejan token.
- **Bootstrap y SSO público (A-13, A-14):** fuera de producción el bootstrap no se ofrece; la configuración pública de SSO solo expone `enabled`, `sso_only`, `emergency_login` y `dashboard_url`.

## Cobertura de la fase 1 sobre las 56 funciones del área A

| Estado | Funciones |
|---|---|
| Ejecutadas en esta fase contra el servidor real | A-01, A-02, A-05, A-06, A-08, A-10, A-11, A-13, A-14, A-26 a A-34, A-37 (parcial), A-38, A-40 a A-42, A-47, A-49 a A-53, A-56 |
| Cubiertas por la línea base automatizada de la fase 0 (pasó), sin repetirse a mano | A-04, A-07, A-09, A-12, A-15 a A-20, A-35, A-36, A-43 a A-46, A-48, A-54, A-55 |
| Probadas en una sesión anterior con `SSO_ONLY=true`, no en esta corrida | A-22, A-23, A-24 |
| **No ejecutadas** | A-03 (el servidor de pruebas corre con límite de intentos de 10000 por entorno; hace falta otro servidor con los valores reales), A-21, A-25, A-39 |

De las 13 funciones Críticas del área A: ejecutadas aquí A-01, A-02, A-10, A-11, A-13, A-26, A-30, A-31 y A-47; cubiertas por la fase 0 A-12 y A-15; probadas antes A-22 y A-24.

## Límites de esta fase

- **Pruebas por API:** no se ejercitó la interfaz con un navegador salvo las páginas huérfanas. Los textos de error, redirecciones y botones por rol se prueban en la fase 2.
- **Sesiones largas y tiempos:** el tope de 8 horas, la inactividad y el vencimiento de 10 minutos del 2FA no se probaron por tiempo; dependen de las pruebas unitarias.
- **Q-09:** no se completó una emisión de cargos; la ausencia de guarda se infiere de que la petición llega a la validación de negocio sin pasar por un 403.
- **Multi-instancia:** con una sola instancia de pruebas no se puede reproducir el riesgo de 2FA en memoria con `maxScale=2`.
- **Servidor activo:** el servidor de pruebas (puerto 5000) y el puente a la base desechable (54330) siguen corriendo para las fases siguientes.

## Relación con el plan

El plan (`plan-qa-2026-11.md`) se actualizó con estos resultados: el falso positivo H-A01 sale de la lista de hallazgos verificados y 14 defectos pasan a "reproducidos".
