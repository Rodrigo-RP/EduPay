---
name: edupay-protocolo-desarrollo
description: Protocolo obligatorio para escribir, modificar, probar o reportar código en EduPay (repositorio Rodrigo-RP/EduPay, rama replit-en-vivo), la plataforma de cobranza escolar que maneja dinero real del Instituto JFR. Úsala SIEMPRE antes de crear o cambiar endpoints, pantallas, consultas SQL, migraciones Drizzle, scripts, pruebas Vitest o Playwright, integraciones externas (Stripe, Resend, Facturapi, STP, WhatsApp) o el reporte final de una tarea, aunque el cambio parezca pequeño o urgente. Cubre alcance, seguridad de la base de datos, reglas del ledger de pagos, prohibición de éxitos simulados, permisos y multitenencia, pruebas obligatorias y el formato exacto del reporte con hash verificado. No aplica a proyectos distintos de EduPay.
---

# Protocolo de desarrollo EduPay

EduPay cobra colegiaturas reales. Un error aquí no es un detalle visual: es un cobro doble, un pago que no se aplica o una familia que recibe un aviso falso. El dueño del proyecto, Rodrigo, no es programador, y cada entrega la revisa un auditor externo directamente contra GitHub. Por eso este protocolo tiene una sola idea de fondo: **la evidencia vale más que la afirmación**. Lo que no puedas demostrar con un comando, una consulta o una prueba, repórtalo como no verificado.

Este archivo complementa, no reemplaza, `docs/PROTOCOLO-AUDITORIA.md` y la memoria del proyecto en `.agents/memory/`. Si algo de esos archivos contradice este protocolo, sigue este protocolo y reporta la contradicción.

## 1. Antes de escribir código

1. Lee la tarea completa y enumera para ti mismo qué se pide y qué no. Si algo es ambiguo, si contradice este protocolo o si exige una acción irreversible, detente y pregunta (sección 9). No infieras lo que Rodrigo "seguramente quiso decir".
2. Lee `docs/PROTOCOLO-AUDITORIA.md` y el índice `.agents/memory/MEMORY.md`. Abre los archivos de memoria que toquen tu tarea. Los más consultados:
   - Pagos, cargos, condonaciones: `payment-atomicity.md`, `pago-manual-admin.md`, `spei-settlement.md`.
   - SQL crudo: `sql-column-rules.md`, `students-columns.md`, `charges-schema-columns.md`, `guardians-email-drift.md`.
   - Base de datos y pruebas: `database-environment-safety.md`, `audit-protocol.md`, `protocolo-auditoria-rules.md`.
3. Antes de escribir SQL, confirma las columnas reales con `information_schema.columns`. `shared/schema.ts` tiene diferencias conocidas con la base real.
4. No inventes funciones, librerías, endpoints ni opciones de configuración. Antes de importar algo, confirma que está en `package.json` o en la documentación oficial. Antes de llamar a una función interna, confirma con `grep` que existe y cómo se llama.
5. Para cualquier servicio externo (Stripe, Resend, Facturapi, STP, Meta, SAT), consulta su documentación oficial vigente antes de codificar. Escribe en el reporte qué página consultaste. Nunca codifiques una integración de memoria: las APIs cambian.
6. `replit.md` y algunos archivos de memoria contienen afirmaciones históricas como "sistema verificado", "datos reales" o "production-ready". No son evidencia. Verifica en el código y en la base antes de apoyarte en ellas.

## 2. Alcance

- Cambia solo lo que la tarea pide. El código nuevo va en archivos nuevos cuando sea razonable, y los archivos compartidos se tocan lo mínimo.
- No refactorices, renombres ni "mejores" módulos ajenos a la tarea. Si encuentras un error fuera de alcance, repórtalo en la sección de hallazgos y no lo corrijas: un arreglo no pedido es código que nadie revisó.
- No publiques, no hagas deploy y no reinicies nada de producción.
- Si la tarea dice "solo diagnóstico" o "sin cambios", no modifiques ningún archivo de código.
- Ejecuta las instrucciones de Rodrigo directamente en el hilo principal y en el orden indicado. Sus instrucciones ya son el plan, con pasos numerados y criterios de aceptación: no las conviertas en tareas en segundo plano, no generes un plan propio y no cambies el orden. Las tareas en segundo plano trabajan en copias aisladas y terminan con "Apply changes", cuyo hook ejecuta `db:migrate`; además, un plan propio puede reinterpretar requisitos ya acordados. Si ves una forma mejor de hacer algo, detente y pregúntalo (sección 9) o anótalo en el reporte. Usa tareas o Plan mode solo si Rodrigo lo pide expresamente.
- No crees, propongas como tarjeta ni arranques tareas de seguimiento por tu cuenta. Si detectas trabajo pendiente, inclúyelo en HALLAZGOS FUERA DE ALCANCE del reporte; Rodrigo decide qué sigue.
- Trabaja en una rama de revisión nueva, creada desde la base que indique la tarea (normalmente el hash actual de `replit-en-vivo`). Antes de hacer push, confirma con `git merge-base --is-ancestor <base> HEAD` que partes de esa base y con `git log <base>..HEAD` que solo están tus commits. Una vez se coló una tarea descartada por no revisar esto.

## 3. Base de datos

La base de desarrollo (`DATABASE_URL`) es `heliumdb`, marcada `edupay:test`: solo contiene datos de prueba. Todavía no existe base de producción. Trata cualquier base sin el marcador `edupay:test` como si contuviera datos reales de familias, y comprueba el marcador antes de cualquier escritura.

**Prohibido sin autorización explícita escrita en la tarea:**
- Ejecutar `db:push` (está bloqueado a propósito), seeds, `TRUNCATE`, `DELETE` masivos o backfills.
- Aplicar migraciones con `npm run db:migrate`.
- Crear índices, constraints o los marcadores `edupay:test` / `edupay:demo`.
- Escribir datos de prueba en cualquier base.

**Cómo se hacen los cambios de esquema:**
- Genera la migración con `npm run db:generate`. Debe ser aditiva: tablas nuevas, columnas que aceptan nulos, índices. Corre `npm run check:migration-policy`.
- Entrégala **sin aplicar**. Avisa en el reporte que el hook post-merge de `.replit` ejecuta `npm run db:migrate`, de modo que "Apply changes" la aplicaría sobre la base configurada.
- Si un cambio no puede ser aditivo, detente y explica por qué antes de escribirlo.

**Diagnósticos:** solo `SELECT`. Copia en el reporte el texto completo de cada consulta ejecutada.

**Scripts que escriben o borran:** deben llamar a las guardas de `server/lib/database-safety.ts` (`assertNonProductionEnvironment`, `assertDatabaseMarker`, `assertTestDatabase`) antes de cualquier SQL.

**Multitenencia:** todo `INSERT` fija `tenant_id` y, donde aplique, el campus, tomados del contexto autenticado. Nunca dejes `tenant_id` en nulo y nunca lo tomes del cuerpo de la petición.

**Refereence:** PostgreSQL es la única fuente de verdad del dinero. No muevas datos financieros a Firestore ni a otra base. Una integración con otros módulos de Refereence solo lee copias.

## 4. Dinero y ledger

- Montos en centavos enteros. Nunca flotantes.
- Todo endpoint que pague, condone, cancele o reestructure sigue el patrón de `payment-atomicity.md`: `BEGIN`, `SELECT ... FOR UPDATE` sobre los cargos, saldo recalculado desde `payment_applications`, `INSERT` del pago y de su aplicación, actualización del cargo y `COMMIT`. La auditoría va fuera de la transacción.
- Los registros financieros confirmados no se editan ni se borran. Las correcciones se hacen con movimientos de reversa.
- La idempotencia usa una clave generada en el servidor y una restricción única en la base. Una validación solo en código no basta, porque dos peticiones simultáneas la pasan las dos.
- Webhooks, en este orden: guardar el evento crudo, validar la firma, descartar duplicados por id de evento con restricción única, responder 200 y procesar. Un evento tardío nunca regresa un estado avanzado a uno anterior.
- Un pago asíncrono como SPEI no acredita cargos hasta el webhook confirmado y firmado.

## 5. Nada simulado se presenta como real

Este es el error que más se ha encontrado en EduPay: pantallas que mostraban "guardado" o "enviado" sin que nada llegara a la base ni al proveedor.

- Un mensaje de éxito solo aparece después de que el backend persistió el cambio y lo confirmó en la respuesta.
- Prohibido inventar UUIDs (`DEMO-...`), correos (`sin-email@...`), estados ("enviado", "conectado", "timbrado") o cifras que no salgan de la base o del proveedor.
- Si falta configurar un proveedor, el endpoint responde 503 con un código claro y la pantalla lo dice. Nunca muestra éxito.
- Interruptores, campos y botones de configuración se conectan a persistencia real o se retiran. Un control que no guarda nada engaña al administrador.
- Las estadísticas cuentan solo lo que tiene evidencia. Sin eventos del proveedor no se calcula una "tasa de entrega".

## 6. Seguridad

- Cada endpoint exige autenticación y un permiso específico del catálogo existente mediante `hasPermissionForUser`. Además verifica que el objeto pedido pertenezca al tenant y al campus del usuario, sin importar el id que llegue. Revisa también las rutas alias: es el hueco que más se repite.
- Nunca registres rutas HTTP condicionadas por `NODE_ENV`. Las utilidades de prueba son funciones exportadas, no rutas.
- Los secretos viven solo en Replit Secrets y se validan con Zod al arrancar. Nunca van en código, logs, frontend, `replit.md`, `.agents/memory/` ni documentación. **El repositorio puede ser público:** no escribas contraseñas, tokens ni claves en ningún archivo, tampoco de cuentas demo.
- Los logs no incluyen CURP completa, RFC, tokens, datos de tarjeta ni cuerpos de correo.
- Escapa el HTML de todo dato variable que vaya a una plantilla.
- Los endpoints públicos llevan rate limiting.
- No crees roles nuevos ni amplíes permisos por tu cuenta. Si un alcance no está decidido, pregúntalo.

## 7. Pruebas

- Cada cambio llega con pruebas de lo que pide la tarea, más estos casos cuando apliquen: datos vacíos o nulos, doble clic o peticiones simultáneas, reintento, otro tenant u otro campus, usuario sin permiso, y proveedor caído o con timeout.
- Las pruebas no escriben en bases no autorizadas. Los servicios externos se prueban con un proveedor simulado y sin red.
- Antes de suites que dependan del servidor HTTP, reinicia el servidor y registra la hora, como pide `docs/PROTOCOLO-AUDITORIA.md`.
- Corre lo que aplique y reporta el comando exacto: `npm run test:safety`, las pruebas Vitest relevantes, `npm run check:routes`, `npm run check:migration-policy` y `npm run build`.
- `npm run check` (TypeScript global) hoy falla. Reporta los diagnósticos de los archivos que modificaste y compáralos contra el commit base.
- Nunca etiquetes un fallo como "preexistente" sin correr el mismo comando en el commit base. Reporta ambos resultados.

## 8. Reporte de entrega

Haz push al remoto `github`, a la rama de revisión que indique la tarea. Nunca hagas push a `origin` ni directamente a `replit-en-vivo`: integrar a `replit-en-vivo` requiere autorización explícita después de la auditoría, y nunca mediante "Apply changes", porque su hook ejecuta `db:migrate`. Luego responde con esta estructura exacta:

```
RESUMEN
Dos o tres líneas en lenguaje sencillo: qué cambió y para qué sirve.

ARCHIVOS MODIFICADOS
- ruta/del/archivo: qué cambió.

MIGRACIONES
Ninguna. O: archivo, qué hace, y "generada, no aplicada".

PRUEBAS
- Comando exacto: resultado (X de Y aprobadas).
- Fallos: cuáles, y su resultado en el commit base.

CONSULTAS A LA BASE
Texto completo de cada consulta (solo SELECT), o "ninguna".

DOCUMENTACIÓN EXTERNA CONSULTADA
Página y fecha, o "no aplica".

LO QUE NO PUDE VERIFICAR
Lista honesta. Si todo se verificó, dilo.

HALLAZGOS FUERA DE ALCANCE (NO CORREGIDOS)
Qué encontraste, en qué archivo, y por qué importa.

RAMA
Nombre de la rama de revisión, hash de su base y lista de commits sobre esa base.

COMMIT
Hash completo y salida de `git ls-remote github <rama de revisión>`, que debe coincidir.
```

Si el hash local y el remoto no coinciden, no reportes la tarea como terminada.

## 9. Cuándo detenerte y preguntar

Detente antes de actuar cuando:
- La tarea es ambigua o contradice este protocolo, la memoria del proyecto o una instrucción anterior.
- El siguiente paso escribe en la base, aplica una migración, publica o borra algo.
- Necesitas una credencial nueva, cambiar de proveedor o crear un permiso.
- La documentación oficial de un servicio no coincide con lo que pide la tarea.

Al detenerte, explica qué encontraste, qué opciones hay y cuál recomiendas. Después espera la respuesta: Rodrigo toma las decisiones de producto y de arquitectura.

## 10. Lenguaje

- Toda la interfaz va en español claro y cálido. En el portal de padres usa "pendiente", "pagado" y "estamos confirmando tu transferencia". Evita "saldo insoluto", "movimiento no aplicado" o "conciliación".
- Los errores que ve el usuario explican qué pasó y qué hacer, sin códigos ni términos técnicos.
- Los reportes a Rodrigo usan lenguaje sencillo: explica el porqué de cada decisión técnica en una frase.
