# Plan de correcciones priorizado

Fecha: 27-nov-2026. Base: commit `8400ba6` y los resultados de las fases 0 a 6 de `plan-qa-2026-11.md` (62 defectos reproducidos, Q-01 a Q-62, y 1 falso positivo descartado).

Este documento ordena qué corregir primero. **No cambia código.** Cada corrección requiere tu visto bueno y, en varios casos, una decisión de producto que está marcada.

## Cómo leerlo

- **Riesgo:** Alto, si el defecto destruye o falsea datos de dinero, expone credenciales o permite actuar sin permiso. Medio, si produce errores visibles, cifras dudosas o abre una puerta que requiere una cuenta con ciertos permisos. Bajo, si es de forma, mantenimiento o apariencia.
- **Esfuerzo:** S es un cambio local con su prueba (del orden de medio día). M son varios archivos o una decisión de diseño (de 1 a 3 días). L es rehacer un cálculo o un flujo (más de 3 días). Son estimaciones mías, no medidas, para ordenar el trabajo y no para comprometer fechas.
- **Decisión previa:** lo que hay que resolver antes de tocar el código, porque cambia qué se considera correcto.
- **Cómo se verifica:** las pruebas de QA que fallan hoy ya existen y definen el criterio de cierre: un paquete está terminado cuando sus pruebas pasan. Están en la carpeta temporal de la sesión; ver "Siguiente paso" para conservarlas.

## Contexto que ordena las prioridades

- **Producción hoy:** una escuela con un campus, 669 alumnos reales, personal entrando por el Dashboard (SSO), `SSO_ONLY` apagado, Stripe con claves de prueba y, según tú, **sin datos de pagos todavía**.
- Por eso los defectos de dinero (paquetes P1 a P4) son **latentes**: no hay daño hoy, pero todos dejarían cobros mal calculados desde el primer día. Conviene corregirlos antes del primer cobro, no después.
- Los defectos de permisos que requieren **otro campus** u **otra escuela** (parte de P6) no son explotables hoy con un solo campus, pero sí los que requieren solo un rol bajo (asistente, admisiones) con una cuenta válida.
- **Impacto sobre `SSO_ONLY`:** Q-06 (superadmin sin escuela) y la app móvil de tutores bloquean encenderlo. Q-13 y Q-47 dejan de importar si las ligas mágicas se cierran con `SSO_ONLY`.

## Orden recomendado, en cuatro olas

| Ola | Qué | Por qué en este orden |
|---|---|---|
| 1. Rápidas y de alto valor | Las correcciones puntuales de P5, P6 y P7 que no piden decisión: guardas de permiso faltantes, lista blanca de columnas en el alta de alumno, no enviar credenciales al navegador, no borrar cargos con pagos, aprobar solo lo que está pendiente | Cierran huecos que existen hoy con una cuenta válida y cuestan poco |
| 2. Dinero antes del primer cobro | P1, P2, P3 y P4 | Sin ellas, los saldos, la emisión y el cierre de caja darían resultados incorrectos desde el primer pago |
| 3. Cifras y accesos | P8 y el resto de P6 y P7 | Las decisiones de cobranza se apoyarán en esos reportes; y cierran los permisos que dependen de decisiones de producto |
| 4. Calidad y deuda | P9, P10, P11 y P12 | Errores 500, importaciones, coherencia del menú y limpieza; no urgentes pero evitan soporte |

## Acciones inmediatas que no son código

| Acción | Quién | Por qué |
|---|---|---|
| Rotar las credenciales que aparecen en `switch-to-school.tsx`, `logout-and-login-school.tsx` y `super-admin-access.tsx`, **si existen o existieron** en algún entorno | Tú | El repositorio es público y esas contraseñas están en texto plano en el código |
| Quitar la variable `TOKEN_ROTADO` del servicio de Cloud Run si es el antiguo token de arranque | Tú, con el Propietario si hace falta | Está en texto plano en la configuración del servicio |
| Averiguar quién creó la revisión `edupay-00011-sv7` y si se puede borrar | Tú | Nunca recibió tráfico y su origen es desconocido |
| Aprobar el borrado de las páginas huérfanas listadas en `plan-qa-2026-11.md`, sección 8 | Tú | Reducen superficie y confusión; borrar archivos requiere tu confirmación |
| No encender `SSO_ONLY` hasta resolver Q-06 y definir cómo entra la app móvil de tutores | Tú | Hoy dejaría sin acceso de emergencia al superadmin y sin acceso a los tutores |

## Paquetes de trabajo

### P1. Un solo cálculo de saldo en todos los canales de cobro

**Estado: implementado el 27-nov-2026, pendiente de tu commit.** Decisión 1 confirmada por Karla: la beca aplica en todos los canales de cobro. Seis archivos (`payments.ts`, `conciliacion.ts`, `charges.ts`, `guardian.ts`, `misc.ts` y `lib/stripe-spei-settlement.ts`) y una prueba nueva, `server/tests/charge-balance-channels.test.ts` (7 pruebas).

Ahora usan el mismo saldo que la tarjeta (`chargeBalance`: monto menos beca, más recargo, menos lo aplicado):
- **Pago manual:** el listado de opciones y el registro (Q-34). Pagar el neto de un cargo con beca lo liquida; un segundo pago o un monto mayor al saldo se rechaza.
- **Cobro en efectivo:** el saldo ahora incluye beca y recargo (Q-34 y Q-35).
- **`pagar-manual`:** registra el neto y no el bruto.
- **SPEI:** el monto de la intención de pago y la validación al liquidarla (sin Stripe no se pudo ejercer; ver pendientes).
- **Convenios:** la lista de cargos reestructurables y la creación del convenio parten del saldo neto. Las cuotas que genera un convenio nacen sin beca (ya son montos netos), por lo que la cancelación del plan no necesitó cambio.

Verificación:
- Las 7 pruebas nuevas **fallan con el código anterior** (por ejemplo, saldo 110000 en lugar de 60000, o un 201 donde debía haber 409) y pasan con el nuevo.
- `server/tests` completo: 163 archivos y 1511 pruebas pasan (1 omitida, como antes). Suite de seguridad: 52 archivos y 1349 pruebas. `tsc` sin errores.
- En `qa/fase4-dinero` las fallas bajaron de 16 a 11: los 4 casos de beca y recargo (C-10) pasan; las 11 restantes son de P2, P3, P4 y P6.

Pendiente o no verificado de P1:
- **SPEI (intención y liquidación)** se cambió y se leyó, pero no se ejerció en ejecución porque depende de Stripe; solo la compilación y las pruebas existentes lo cubren.
- **Transferencias SPEI ya creadas con monto bruto** antes de este cambio no coincidirían con el saldo neto al liquidarse y fallarían con un error claro. Según Karla no hay pagos en producción, así que no debería haber ninguna.
- **El recargo se sigue calculando sobre el monto base** (`surcharge-accrual.ts`), no sobre el neto de beca. No lo cambié porque no es un canal de cobro y es otra decisión: ¿el recargo debe calcularse sobre el monto con beca o sin ella?
- **Los reportes** (P8) aún dan cifras distintas entre sí; P1 es la base para unificarlas, pero no las corrige.
- **Interfaz:** no revisé las pantallas de pago manual ni de caja con montos netos.

Detalle original del paquete:

| | |
|---|---|
| Defectos | Q-34 (beca ignorada en pago manual y efectivo), Q-35 (el efectivo ignora el recargo) |
| Riesgo | **Alto**: un alumno con beca del 50% no puede liquidar su cargo pagando el neto, y el sistema permite cobrarle el monto completo |
| Esfuerzo | M |
| Qué hacer | Que el pago manual, el efectivo, `pagar-manual`, los convenios, SPEI y los recargos usen la misma función `chargeBalance` que ya usa la liquidación con tarjeta |
| Decisión previa | Confirmar que **la beca aplica en todos los canales** (sospecho que sí; hoy la tarjeta y el tablero del tutor la aplican y la caja no) |
| Se verifica con | `fase4-dinero`: pago manual y efectivo con beca, y efectivo con recargo |
| Dependencias | Ninguna. Es la base de P8: sin un saldo único, las cifras de los reportes no pueden coincidir |

### P2. Idempotencia y cierre de caja

**Estado: implementado el 27-nov-2026, pendiente de tu commit.** Decisión 2 confirmada por Karla: se bloquean los cobros posteriores al corte (sin reapertura). Archivos: `server/lib/cash-closure.ts` (nuevo), `routes/payments.ts`, `routes/charges.ts`, `routes/conciliacion.ts`, `client/src/pages/caja-conciliacion.tsx`, prueba `server/tests/cash-close-integrity.test.ts` (6 pruebas) y `qa/fase4-dinero.spec.ts` (doble envío ahora con llave).

- **Q-36:** `pago-efectivo` acepta `idempotency_key` (100 caracteres como máximo, mal formada responde 400). Misma llave y mismos datos repite la respuesta (`idempotent: true`); misma llave con otro monto responde 409. La pantalla de caja envía una llave por cobro. **La llave es opcional** por compatibilidad: sin ella cada petición sigue siendo un cobro nuevo.
- **Q-43:** `cerrar-dia` rechaza fechas futuras (400).
- **Q-44:** efectivo, pago manual y `pagar-manual` responden 409 `CAJA_CERRADA` si el campus ya cerró el día escolar. Comparten el candado `pg_advisory_xact_lock` con `cerrar-dia`, así que un cobro y el corte no se cruzan. Repetir un cobro ya registrado (misma llave) sigue respondiendo 200. El corte de un campus no bloquea a otro.

Verificación: 6 pruebas nuevas pasan contra el servidor actualizado (antes, con el servidor viejo, fallaron 5 de 6). `server/tests`: 1513 pasan; 2 archivos (`report-exporter-database-date`, `reportes-financiero-fecha-pago`) no cargan porque en mi shell faltaba `DATABASE_URL` (entorno, no código; no los reejecuté con la variable). Seguridad: 52 archivos y 1349 pruebas. `tsc` sin errores. e2e de caja, planes de pago y pago manual (09, 10, 23, 24, 27): 16 de 16. `qa/fase4-dinero`: 26 pasan y 8 fallan, todas de otros paquetes (P3 emisión, P4 recargos y convenios, C-H10 y Q-15); los casos C-45 y de doble envío pasan.

Pendiente o no verificado de P2:
- **Conciliación bancaria y Stripe (tarjeta y SPEI) pueden crear pagos tras el corte**: no los bloqueé (el dinero ya entró). Si el corte debe incluirlos, es decisión aparte.
- **Sin llave no hay protección** contra doble envío; clientes que no sean la pantalla de caja (app móvil, scripts) deberían enviarla.
- No probé la pantalla de caja a mano en navegador; solo los e2e 24 y 10.

Detalle original del paquete:

| | |
|---|---|
| Defectos | Q-36 (el efectivo no es idempotente), Q-43 (cierre con fecha futura), Q-44 (cobros posteriores al cierre) |
| Riesgo | **Alto** para Q-36 y Q-44 (cobros duplicados y corte que deja de cuadrar); Medio para Q-43 |
| Esfuerzo | M |
| Qué hacer | Llave de idempotencia en el cobro en efectivo (como la del pago manual); rechazar fechas de cierre futuras; rechazar cobros en efectivo y pagos manuales de un día ya cerrado |
| Decisión previa | **Qué pasa si hay que cobrar después del corte:** bloquear y exigir reabrir el día, o registrarlo en el día siguiente. Hoy las devoluciones sí respetan el corte |
| Se verifica con | `fase4-dinero`: doble envío, cierre con fecha futura y cobros tras el cierre |

### P3. Emisión de cargos

| | |
|---|---|
| Defectos | Q-37 (`generar-mensual` duplica al repetir el periodo), Q-38 (cobra el concepto de Primaria a todos los niveles), Q-33 (asignación de precios: nivel por texto de `grado` y duplicación), Q-39 y Q-09 (`charges/generate` sin permiso de módulo: el asistente crea cargos) |
| Riesgo | **Alto**: duplicar la mensualidad de 48 alumnos y cobrar el precio equivocado por nivel afecta a todas las familias |
| Esfuerzo | L (la unicidad y el nivel tocan varios flujos), con una parte S: la guarda de permiso de `charges/generate` |
| Qué hacer | Unicidad por (alumno, concepto, periodo) con índice en la base y respuesta clara al repetir; deducir el nivel desde `nivel_escolar` y no del texto del grado; elegir el concepto de colegiatura por nivel; exigir `charges.create` en `charges/generate` |
| Decisión previa | La **clave de unicidad** de un cargo (¿puede haber dos cargos del mismo concepto y periodo si son distintos por diseño?) y la fuente del nivel cuando `nivel_escolar` viene vacío |
| Se verifica con | `fase3-datos` (asignación de precios) y `fase4-dinero` (mensual, `charges/generate` como asistente) |
| Nota | Para Q-33 puedes medir el efecto en producción con una consulta de solo lectura sobre `grado` y `nivel_escolar`; no la he corrido |

### P4. Recargos y convenios

| | |
|---|---|
| Defectos | Q-40 (un cargo vencido con pago parcial no recibe recargo), Q-41 (los cargos de un convenio quedan `cancelado` y las cuotas sin ciclo escolar) |
| Riesgo | Medio (cobro de menos y datos que se confunden con cancelaciones reales) |
| Esfuerzo | M |
| Qué hacer | Incluir cargos parciales en el cálculo de recargos; marcar los cargos originales como `reestructurado`; heredar el ciclo escolar en las cuotas |
| Decisión previa | Q-41: confirmar el estado deseado de los cargos originales y su efecto en reportes y cuentas por cobrar |
| Se verifica con | `fase4-dinero`: recargo con pago parcial y convenio |

### P5. Aprobaciones

**Estado: implementado el 27-nov-2026, pendiente de tu commit.** Cambios en `server/routes/notifications.ts` y `server/storage.ts`, y una prueba nueva, `server/tests/approval-integrity.test.ts` (5 pruebas).

- **Decidir una sola vez (Q-14):** la actualización de estado es condicional (`status = 'pending'`); una solicitud ya decidida responde 409 `APPROVAL_ALREADY_DECIDED`, también ante dos decisiones simultáneas.
- **Borrar cargos con pagos (Q-42):** aprobar `delete_charge` sobre un cargo con pagos o aplicaciones ya no lo borra: responde 409 `APPROVAL_EXECUTION_FAILED`, deja la solicitud en `pending` y registra `execution_failed` en la bitácora. En general, si la ejecución de un cambio aprobado falla, la solicitud se reabre y no se responde éxito.
- **Bitácora (Q-59):** `GET /api/approvals/logs/:id` valida el identificador (400), la existencia (404) y la regla del historial: superadmin ve todo, administración general ve su escuela y cualquier otro rol solo lo que él pidió (403 en los demás casos).
- **Notificaciones (Q-60):** solo el destinatario puede marcarlas como leídas (404 si no son suyas, 400 si el id no es numérico).

Verificación: las 6 pruebas de `qa/` que antes fallaban por estos defectos ahora pasan; `server/tests` completo pasa (162 archivos y 1504 pruebas; 1 omitida, como antes); la suite de seguridad pasa (52 archivos y 1349 pruebas); `tsc` sin errores.

Pendiente o no verificado de P5:
- La interfaz de aprobaciones no se revisó con las respuestas 409 nuevas; el cliente las recibirá como errores de red y no sé cómo las muestra.
- Los cambios que ejecuta una aprobación (`modify_charge_amount`, `delete_concept`, etc.) siguen identificando la entidad solo por su id: la escuela se validó al crear la solicitud, no al ejecutarla. Es una defensa adicional que dejé fuera para mantener el cambio mínimo.
- La reapertura de una solicitud tras un fallo no es transaccional con la ejecución; es correcta hoy porque cada ejecución es una sola sentencia.
- No corrí los e2e de Playwright (ninguno toca aprobaciones); los correrá el CI.

Detalle original del paquete:

| | |
|---|---|
| Defectos | Q-14 (una solicitud rechazada se puede aprobar después), Q-42 (aprobar `delete_charge` borra el cargo con sus pagos y responde éxito), Q-59 (la bitácora se lee desde otra escuela), Q-60 (cualquiera marca como leída la notificación de otro) |
| Riesgo | **Alto** para Q-42 y Q-14 (se pierde historial de cobro); Medio para Q-59 y Q-60 |
| Esfuerzo | M |
| Qué hacer | Hacer condicional la decisión (`UPDATE ... WHERE status = 'pending'`); no ejecutar el borrado si el cargo tiene pagos o aplicaciones, y devolver error si la ejecución falla; validar escuela y dueño en la bitácora y en las notificaciones |
| Decisión previa | Ninguna. Es la corrección más clara y barata del grupo |
| Se verifica con | `fase1` (aprobar tras rechazar), `fase4` (borrar un cargo con pagos), `fase6` (bitácora y notificación ajenas) |

### P6. Autorización por módulo y por alcance

| | |
|---|---|
| Defectos | Q-07 (seis lecturas sin guarda), Q-08 y Q-45 (cruce de campus), Q-10 (asistente ejecuta diagnóstico con reparación automática), Q-29 (el asistente crea reglas de pago), Q-58 (admisiones exporta reportes que no puede consultar), Q-17 (el asistente lee excepciones bancarias), Q-04 (un administrador de campus otorga permisos de sistema) |
| Riesgo | **Alto** para Q-10, Q-29 y Q-04 (escritura sin permiso o escalada); Medio para el resto (lectura de datos financieros por roles sin permiso) |
| Esfuerzo | L, partible en dos: una parte S/M con las guardas que no piden decisión (Q-07, Q-10, Q-29, Q-17) y otra con las que sí (Q-08, Q-45, Q-58, Q-04) |
| Qué hacer | Agregar `hasPermissionForUser` en las rutas sin guarda; comparar el campus de la URL con el de la sesión; alinear el permiso de exportación con el de consulta; poner un techo a `custom_permissions` |
| Decisión previa | (1) ¿Un administrador de campus puede operar otro campus de su escuela? (2) ¿Asistente y admisiones deben leer reportes financieros? (3) ¿Se alinea exportar con consultar? Recomiendo que sí, porque hoy exportar abre datos que consultar niega |
| Se verifica con | `fase1` y `fase2` (matriz de roles), `fase6` (exportaciones) |
| Nota | El ruido de 403 de la fase 2 (`onboarding-status` y `excepciones/count` para roles sin permiso) se resuelve aquí también |

### P7. Credenciales, sesión y cuentas

| | |
|---|---|
| Defectos | Q-20 (el alta de alumno guarda `id`, `password_hash` y `username` del cuerpo), Q-49 (el tablero del tutor envía `username` y `password_hash` de cada alumno), Q-01 (no existe cierre de sesión en el servidor), Q-02 y Q-03 y Q-52 (contraseñas de 1 carácter y correos sin validar), Q-51 (un correo vacío deja al tutor sin poder entrar), Q-06 (superadmin sin escuela) |
| Riesgo | **Alto** para Q-20 y Q-49 (podrían combinarse y entregar un hash al navegador); Alto para Q-51 (bloqueo de cuenta) y Q-06 (bloquea el acceso de emergencia de `SSO_ONLY`); Medio para el resto |
| Esfuerzo | M a L |
| Qué hacer | Lista blanca de columnas en el alta de alumno; un serializador que nunca incluya columnas de credenciales en respuestas al cliente; endpoint de cierre de sesión que invalide el token; una política de contraseña única (hoy el personal exige 12 y el resto 0); validar el correo del perfil; permitir 2FA y perfil a un superadmin sin escuela |
| Decisión previa | Política de contraseña para tutores (¿12 caracteres o la actual con SSO?); cómo se usa el superadmin sin escuela en producción |
| Se verifica con | `fase1` (usuarios, 2FA, logout, superadmin sin escuela), `fase3` (alta masiva), `fase5` (tablero, perfil y contraseña) |

### P8. Cifras confiables en dashboards y reportes

| | |
|---|---|
| Defectos | Q-54 (riesgo y semáforo inflan el adeudo), Q-55 (omiten cargos vencidos con pago parcial), Q-53 (la cartera pendiente cambia entre cuatro pantallas), Q-56 (el vencido cambia entre tres), Q-57 (conteos del dashboard) |
| Riesgo | **Alto** una vez haya cargos: el semáforo y el reporte de riesgo son los que usaría cobranza, y hoy multiplican el adeudo (13.8 veces) y pintan en verde a un deudor |
| Esfuerzo | L |
| Qué hacer | Una sola función de cartera (basada en el saldo único de P1) que usen dashboard, consejo, contador, antigüedad y riesgo; reescribir el cálculo de riesgo con subconsultas agregadas por cargo, sin unir pagos y tutores en una sola consulta; incluir cargos parciales |
| Decisión previa | **Definiciones:** qué es "pendiente" y "vencido" (fecha de corte, ciclo, neto o bruto de beca) y qué significa "alumno con adeudo" |
| Se verifica con | `fase6`: coincidencia entre reportes y contra la base, y el caso controlado de 2 tutores |
| Dependencias | Después de P1 |

### P9. Validaciones y errores 500

| | |
|---|---|
| Defectos | Q-19, Q-23, Q-24, Q-25, Q-26, Q-27, Q-28, Q-30, Q-48, Q-50, Q-61 |
| Riesgo | Medio y Bajo: el servidor responde 500 o acepta datos inválidos (CURP, RFC, correo, fechas, meses, título de evento, `activo`, byte nulo) y una regla duplicada que fallará después al emitir cargos |
| Esfuerzo | M en conjunto, S por cada ruta |
| Qué hacer | Esquemas de validación (zod) en cada ruta y que respondan 400; índice único para evitar dos reglas de vencimiento activas por concepto y mes; escapar comodines en la búsqueda; que el PUT del perfil actualice el campo que el perfil muestra |
| Decisión previa | Ninguna |
| Se verifica con | `fase3` y `fase5` y `fase6` (casos de validación) |

### P10. Importaciones y datos de alumnos

| | |
|---|---|
| Defectos | Q-21 (importación legada: comas entre comillas, nombre sin separar y duplicados), Q-22 (CSV con BOM falla completo), Q-12 (`nombre_completo` desactualizado al editar) |
| Riesgo | Medio: afecta la carga masiva de datos y la consistencia del nombre entre pantallas |
| Esfuerzo | M |
| Qué hacer | Quitar el BOM antes de leer el archivo; usar un parser de CSV real; separar apellidos o retirar la importación legada y dejar solo la incremental; recomponer `nombre_completo` en cada edición |
| Decisión previa | ¿Se retira la importación legada del botón de Estudiantes en favor de la incremental? |
| Se verifica con | `fase3` (importaciones y edición de alumno) |

### P11. Menú, permisos de pantalla y ligas mágicas

| | |
|---|---|
| Defectos | Q-11 (administración general y contador sin lectura de Becas y Configuración de Pagos), Q-15 (16 enlaces que abren pantallas con 403), Q-16 (la pantalla de inicio llama a un endpoint retirado), Q-18 (403 repetidos por el contador de excepciones), Q-31 (validación de integridad cuenta becas de otro campus), Q-13 (la liga mágica no lleva `campus_id`), Q-46 (asistente y admisiones emiten ligas de pago), Q-47 (un GET gasta un uso de la liga) |
| Riesgo | Medio: pantallas rotas para roles concretos y un acceso por liga que no sirve para pagar |
| Esfuerzo | M |
| Qué hacer | Alinear los permisos con lo que el menú ofrece (dar `settings.read` y `scholarships.read` o quitar el enlace); que el menú use los mismos permisos que el servidor; retirar la llamada a `admissions-report`; agregar `campus_id` al token de la liga y no consumir un uso en un GET |
| Decisión previa | ¿Administración general debe leer Becas y Configuración de Pagos? ¿Existirán ligas mágicas después de `SSO_ONLY`? Si no, Q-13, Q-46 y Q-47 se resuelven cerrándolas |
| Se verifica con | `fase2` (matriz de roles), `fase5` (ligas) |

### P12. Limpieza y deuda técnica

| | |
|---|---|
| Defectos | Q-05 (los endpoints de mantenimiento de BD responden siempre 500), Q-32 (`update-school-status` responde éxito sin cambiar nada), Q-62 (`/cuentas` pública con cifras inventadas) |
| Riesgo | Bajo a Medio |
| Esfuerzo | S a M |
| Qué hacer | Reparar o retirar los endpoints de mantenimiento (columna `tablename` y tabla `sessions`); hacer que `update-school-status` actualice de verdad o devuelva 501; retirar `/cuentas` y `/cuentas-standalone`; borrar las páginas huérfanas y el router heredado de Replit; corregir la ruta duplicada de `audit-log` |
| Decisión previa | Q-05: reparar o retirar el mantenimiento manual |
| También conviene | Agregar las pruebas de correo (`vitest.email.config.ts`, 172 pruebas) al CI, que hoy no las corre, y que la suite de seguridad defina por sí sola las variables falsas que necesita |

## Decisiones de producto pendientes, consolidadas

| # | Decisión | Paquetes |
|---|---|---|
| 1 | Confirmar que la beca aplica en todos los canales de cobro | P1 |
| 2 | Cobros después del cierre de caja: bloquear o permitir con reapertura | P2 |
| 3 | Clave de unicidad de un cargo y fuente del nivel académico | P3 |
| 4 | Estado de los cargos originales de un convenio | P4 |
| 5 | Si un administrador de campus puede operar otro campus de su escuela | P6 |
| 6 | Si asistente y admisiones leen reportes financieros, y alinear exportar con consultar | P6 |
| 7 | Política de contraseña de tutores y uso del superadmin sin escuela | P7 |
| 8 | Definiciones de cartera pendiente, vencido y "alumno con adeudo" | P8 |
| 9 | Retirar o conservar la importación legada de alumnos | P10 |
| 10 | Permisos de Becas y Configuración de Pagos para administración general y contador | P11 |
| 11 | Ligas mágicas después de `SSO_ONLY` (cómo entra la app móvil de tutores) | P7, P11 |
| 12 | Reparar o retirar el mantenimiento manual de base de datos | P12 |

## Índice: cada defecto en su paquete

| Paquete | Defectos |
|---|---|
| P1 | Q-34, Q-35 |
| P2 | Q-36, Q-43, Q-44 |
| P3 | Q-09, Q-33, Q-37, Q-38, Q-39 |
| P4 | Q-40, Q-41 |
| P5 | Q-14, Q-42, Q-59, Q-60 |
| P6 | Q-04, Q-07, Q-08, Q-10, Q-17, Q-29, Q-45, Q-58 |
| P7 | Q-01, Q-02, Q-03, Q-06, Q-20, Q-49, Q-51, Q-52 |
| P8 | Q-53, Q-54, Q-55, Q-56, Q-57 |
| P9 | Q-19, Q-23, Q-24, Q-25, Q-26, Q-27, Q-28, Q-30, Q-48, Q-50, Q-61 |
| P10 | Q-12, Q-21, Q-22 |
| P11 | Q-11, Q-13, Q-15, Q-16, Q-18, Q-31, Q-46, Q-47 |
| P12 | Q-05, Q-32, Q-62 |

Total: 62 defectos, 12 paquetes (2 + 3 + 5 + 2 + 4 + 8 + 8 + 5 + 11 + 3 + 8 + 3 = 62).

## Lo que este plan no resuelve

- **Los hallazgos de agentes no reproducidos** (por ejemplo, el re-timbrado de CFDI, el pago de varios cargos con fallo a la mitad, o la visibilidad de las pruebas de correo) dependen de Stripe, Facturapi o un proveedor de correo y siguen pendientes de probarse.
- **Interfaz:** casi todo se probó por API; los textos de error, el diseño y los flujos de varios pasos no se evaluaron.
- **Estimaciones de esfuerzo:** son orientativas. Los paquetes P3, P6 y P8 podrían crecer al abrir el código.

## Siguiente paso

1. **Conservar las pruebas de QA.** Los scripts viven en la carpeta temporal de la sesión y se perderían. Puedo copiarlos al repositorio como pruebas de regresión (sin dependencias nuevas), de modo que cada paquete cierre cuando sus pruebas pasen. Esto agrega archivos al repositorio, así que necesito tu aprobación.
2. **Responder las decisiones** de la tabla anterior, empezando por las de la ola 1 y 2: la 1, la 2, la 3 y la 5.
3. **Elegir el primer paquete.** Recomiendo empezar por P5 (aprobaciones): es la corrección más clara, barata y sin decisiones previas, y evita la pérdida de historial de cobro.
