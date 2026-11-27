# Resultados de la fase 5: portal de tutores y acceso por liga

Fecha: 27-nov-2026. Commit `8400ba6`. Entorno: base desechable `edupay_ci` (PostgreSQL 18) y servidor local con `APP_ENV=test`, con las cuentas de `resultados-fase-1-2026-11-26.md` y la base reconstruida descrita en `resultados-fase-4-2026-11-27.md`. Producción no se tocó. Los scripts viven fuera del repositorio.

## Alcance y método

Funciones D-01 a D-16 del inventario D (acceso del tutor, ligas mágicas, tablero, pagos del tutor, perfil, contraseña y el portal en el navegador). Se ejecutaron 23 pruebas: la mayoría por API con tokens reales, y dos en un navegador controlado con Playwright que inyecta la sesión del tutor. Los tutores de prueba que cambian de estado (archivar, contraseña, correo) se crean para cada prueba con su propia familia; los del seed (`lopez.carlos@demo.mx`, `hernandez.maria@demo.mx`) se usan solo para lectura.

Datos de contexto:
- Karla indicó que en producción todavía no hay datos de pagos. Eso reduce el impacto actual de Q-33 y Q-34 a defectos latentes. No lo verifiqué en producción y no ejecuté ninguna consulta allá.
- Los pagos con tarjeta y SPEI dependen de Stripe: aquí solo se probó lo que el servidor valida antes de llegar al tercero.

## Resumen

23 pruebas: 15 pasan y 8 fallan. Las 8 fallas son **7 defectos nuevos (Q-46 a Q-52)** y Q-13 (liga mágica sin `campus_id`), que se reprodujo otra vez. Además quedaron 2 observaciones.

## Defectos nuevos reproducidos

| ID | Defecto | Evidencia | Funciones |
|---|---|---|---|
| Q-46 | **El asistente y admisiones pueden emitir ligas de pago** (200). La lista fija de roles de la emisión los incluye aunque sus restricciones dicen que no procesan pagos. Es una decisión de producto, no un defecto comprobado | `POST /api/admin/magic-link`: 200 para AS y AD; 403 para contador y auxiliar | D-03 |
| Q-47 | **Abrir la liga con un GET gasta uno de sus 3 usos.** Los escáneres de enlaces de correo o WhatsApp suelen hacer ese GET: tras 3 aperturas automáticas, el primer uso real del tutor da 410 | Cuarto GET: 410 | D-02 |
| Q-48 | **`GET /api/admin/magic-link/history/abc` responde 500** con un identificador no numérico | HTTP 500 | D-04 |
| Q-49 | **El tablero del tutor envía columnas de credenciales del alumno.** Dentro de cada cargo, `student` incluye `username` y `password_hash`. Hoy valen `null`, pero viajan al navegador del tutor, y con Q-20 (el alta de alumno guarda `password_hash` del cuerpo) podrían traer un valor real | 48 apariciones en el tablero de un tutor | D-07 |
| Q-50 | **Editar el teléfono del perfil responde 200 pero no cambia nada visible:** `PUT /api/guardian/profile` actualiza el campo `telefono`, mientras el perfil muestra `celular` | `celular` antes y después: igual | D-12 |
| Q-51 | **El correo del perfil no se valida:** uno sin formato responde 500, y **uno vacío se acepta (200) y deja al tutor sin poder entrar** (el login con su correo original da 401). No hay recuperación por sí solo | 500, 200 y login 401 | D-12 |
| Q-52 | **La contraseña de 1 carácter se acepta en el cambio de contraseña del tutor** (la del personal exige 12) | HTTP 200 | D-13 |

Q-13 se reprodujo otra vez: el token de la liga mágica no lleva `campus_id`. El pago con ese token responde "tu escuela aún no lo tiene habilitado", pero en este entorno no hay Stripe conectado, así que ese mensaje no distingue la causa; la evidencia es la ausencia del dato en el token.

## Observaciones

- **Unidades mezcladas en el tablero:** `totalPendingBalance` está en pesos y neto de beca, mientras `saldo_a_favor_centavos` está en centavos. Con un cargo de 1000 y beca del 50%, el total pendiente subió 500. Es consistente con la beca, pero **contradice los canales de caja (Q-34)**: el tutor ve 500 pendientes y la caja le permite cobrar 1000. No es un defecto del portal, sino una prueba más de que los canales no coinciden.
- **SPEI revisa Stripe antes que la propiedad del cargo** (`pagar` lo hace al revés). Con un cargo ajeno responde 409 "plantel sin pagos por transferencia" y no 403. No hay fuga, pero la verificación de propiedad de SPEI no se puede comprobar sin Stripe.

## Funciones que pasan (comportamiento correcto confirmado)

- **Acceso (D-01):** las credenciales válidas entran y la respuesta no trae hash; contraseña errónea y correo inexistente dan el mismo 401; entradas vacías, con SQL o con tipos raros dan 4xx y no 500; las credenciales del personal no sirven en el acceso de tutores; **una familia archivada pierde el acceso (403 `GUARDIAN_FAMILY_ARCHIVED`) y su sesión abierta cae (401)**, y reactivarla lo devuelve; un tutor sin familia activa recibe un 403 con un mensaje claro.
- **Ligas (D-02, D-03, D-04):** el administrador de campus y el general emiten; contador y auxiliar reciben 403; la otra escuela no ve al tutor (404); una liga entra al portal, lleva 3 usos y el cuarto da 410; una liga vencida o revocada da 410; tokens inventados, cortos, con comillas o de 5000 caracteres dan 4xx sin error de servidor; el historial lo ve el administrador de campus, el contador recibe 403 y otra escuela no ve ligas.
- **Tipo de token (D-06, D-10):** las 7 rutas del portal rechazan la petición sin sesión y con token de personal (administrador de campus, general y asistente); la información de la escuela es la del tutor aunque se pidan otros `tenant_id` y `campus_id`.
- **Tablero (D-07):** cada tutor ve solo los alumnos que su registro de familia le asigna y ningún cargo de alumnos ajenos; la beca del 50% se aplica en el total pendiente; el portal en el navegador muestra el nombre del alumno y no muestra errores 401, 403 ni "no se pudieron cargar los datos".
- **Pagos (D-09):** SPEI rechaza ids `[0,-1]` y vacío (400) y sin Stripe conectado responde 409 sin crear pagos.
- **Contraseña (D-13):** la actual incorrecta da 401, la falta de la nueva da 400, y tras un cambio válido la sesión anterior se invalida (401), la contraseña nueva entra y la vieja deja de entrar.
- **Perfil (D-12):** el perfil no expone hash y el `tenant_id` enviado en el cuerpo se ignora.
- **Navegador (D-11, D-14):** el portal del tutor solo llama a `/api/guardian/institutional-info` y `/api/guardian/dashboard`; en `/`, `/estudiantes`, `/admin`, `/usuarios` y `/parent-portal` no aparece el menú de personal.

## Cobertura de la fase

| Función | Estado |
|---|---|
| D-01, D-02, D-03, D-04, D-06, D-10, D-12, D-13 | Probadas |
| D-07 tablero | Probada por API y en el navegador |
| D-08 pago con tarjeta | **Solo validaciones** (fase 4) |
| D-09 SPEI | **Solo validaciones** |
| D-11 el portal solo llama a rutas de tutor | Probada en el navegador |
| D-14 pantalla `parent-portal.tsx` | Probada la ruta `/parent-portal`: no abre una pantalla de personal |
| D-05 SSO_ONLY | Probada en una sesión anterior, no en esta |
| D-15, D-16 (configuración alojada en `guardian.ts`) | Ya cubiertas en la fase 3 |

## Qué no cubre esta fase

- **Pago exitoso de punta a punta:** tarjeta, SPEI, 3D Secure, confirmaciones asíncronas y el pago de varios cargos (donde un fallo a la mitad dejaría cobros ya hechos) dependen de Stripe.
- **Interfaz del portal:** no se probó el flujo de pago ni el modal, el diseño en celular, la accesibilidad ni los textos de error. Solo se comprobó que el portal carga datos y no llama a rutas de personal.
- **Tiempos:** el tope de sesión de 7 días, el vencimiento de 72 horas de la liga (solo se simuló moviendo la fecha) y el límite de intentos del login no se probaron por tiempo real.
- **Varios hijos y varias familias:** el tutor con alumnos de más de una familia no se ejercitó.
- **Perfil en pantalla:** según el código, la pantalla de perfil del tutor parece inalcanzable desde el portal; los defectos Q-50 a Q-52 son de API y su efecto visible no se evaluó.

## Relación con el plan

El plan se actualizó con Q-46 a Q-52, y la memoria con el estado de las fases 0 a 5.
