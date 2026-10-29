# Ajuste de contacto de familias

## Migración autorizada

Se generó mediante `npm run db:generate`:
`drizzle/migrations/0005_white_hellcat.sql`. Su contenido completo es:

```sql
ALTER TABLE "guardians" ALTER COLUMN "email" DROP NOT NULL;
```

Se verificó que fuera la única migración pendiente y se aplicó exclusivamente
con `npm run db:migrate`, sobre `heliumdb` con marcador `edupay:test`.
La aplicación permaneció detenida durante este paso.

| Verificación | Antes | Después |
|---|---:|---:|
| Filas del ledger | 5 | 6 |
| Tutores | 28 | 28 |
| Tutores con `email` no nulo | 28 | 28 |
| `guardians.email.is_nullable` | NO | YES |

Consultas completas de lectura:

```sql
SELECT current_database() AS database_name;
SELECT shobj_description(oid, 'pg_database') AS environment_marker
FROM pg_database WHERE datname = current_database();
SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY id;
SELECT COUNT(*)::int AS tutors, COUNT(email)::int AS emails FROM guardians;
SELECT column_name,is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='guardians' AND column_name='email';
SELECT COUNT(*)::int AS ledger_count FROM drizzle.__drizzle_migrations;
```

Los resultados de identidad fueron `heliumdb` y `edupay:test` antes de aplicar.
No se editaron ni rellenaron correos existentes.

### Reversión propuesta, no ejecutada

Volver a `NOT NULL` sólo es posible si no queda ningún tutor sin correo.
Primero debe comprobarse:

```sql
SELECT COUNT(*) AS tutores_sin_correo FROM guardians WHERE email IS NULL;
```

Sólo si devuelve cero y existe una autorización posterior, una migración de
reversión podría ejecutar:

```sql
ALTER TABLE "guardians" ALTER COLUMN "email" SET NOT NULL;
```

No sustituir nulos por cadenas vacías ni correos inventados para forzar esa
reversión. Si hay tutores sin correo, debe mantenerse nullable hasta resolver
su contacto legítimamente o cambiar expresamente la decisión de producto.

## Revisión de usos de correo

Se revisaron las referencias a `correo_institucional_familiar`, `guardian.email`,
`g.email`, `guardianEmail` y los usos relacionados en servidor y cliente.
Las referencias agrupadas corresponden a cada operación, no a servicios nuevos.
La tabla siguiente agrupa inicializaciones repetidas y especifica las líneas
de cada operación en el código entregado. “Vacío” en un campo de formulario
o exportación es presentación; la persistencia del contacto ausente es NULL.

- Ligas: generan acceso por ID, devuelven celular y mensaje claro para compartir
  cuando no hay correo; el canje conserva correo nulo en respuesta y JWT.
  Se eliminó el identificador de correo inventado del canje.
- Notificaciones: el repositorio convierte ausencia/vacío en nulo y
  `prepareRecipients` conserva estado `omitido`, motivo `sin correo`; nunca
  se incluye ese destinatario en un intento de envío.
- Stripe: la creación existente usa `email: guardian.email || undefined`;
  el cliente simulado recibió `undefined` y el cargo siguió su flujo normal.
  No se realizó un envío real al proveedor.
- Inicio por contraseña: sigue requiriendo una dirección para ese método
  específico y devuelve 400 si falta; un tutor sin correo accede mediante liga.
- Búsqueda/listados/reportes: los `ILIKE` con nulos no coinciden por correo,
  pero las búsquedas por nombre/otros campos siguen funcionando; JSON conserva
  nulos y los componentes muestran teléfono, “Sin correo” o un campo vacío.
- Importación activa de tutores: correo opcional, validado y normalizado
  cuando existe; ausente se escribe nulo en ambas columnas. El importador de
  familias también utiliza este contrato mediante su servicio central.
- `storage.createGuardian` admite correo nulo sin sustituirlo por un inventado.
- Herramientas heredadas `import-real-data.ts` e `import-students-jfr.ts`:
  omiten la búsqueda por email cuando falta, validan/normalizan el capturado
  y escriben nulo. No se ejecutaron estos scripts ni sus cargas.

| Archivo:línea | Uso | Comportamiento sin correo |
|---|---|---|
| `server/lib/guardian-contact.ts:4-14` | Validación y normalización común | Ausente, nulo o espacios → NULL; capturado inválido → 400. |
| `server/lib/family-service.ts:111-113,428-430` | DTO manual y alta interna | Campo canónico explícito prevalece sobre alias; correo opcional normalizado. |
| `server/lib/family-service.ts:167-182,243` | Bloqueos y duplicados | No crea clave de email ni consulta su igualdad sin correo; CURP no cambia. |
| `server/lib/family-service.ts:329-330` | Edición | Escribe el mismo nulo en email y correo institucional. |
| `server/lib/family-service.ts:578-594,613-643` | Resolución e INSERT de importación | Sólo busca correo si existe; compara normalizado; INSERT acepta NULL sin sustitución. |
| `server/storage.ts:330-333` | Login por email | Consulta correo solicitado; un NULL no coincide ni provoca excepción. El método exige dirección, no el expediente. |
| `server/storage.ts:342-349` | Listado por campus | Devuelve campos nulos sin convertirlos en direcciones. |
| `server/storage.ts:360-379` | Alta de tutor | Normaliza el campo canónico capturado; escribe NULL en ambas columnas si falta, ignorando alias ajenos al DTO. |
| `server/storage.ts:525,578` | Expediente y cobranza | Proyecta contacto nulo, sin llamar métodos de string sobre él. |
| `server/storage.ts:1020-1029` | Actualización de perfil | Si se captura/vacía email, valida y sincroniza las dos columnas; si se omite no las cambia. |
| `server/routes/auth.ts:283-292` | Inicio por contraseña | Correo ausente → 400 claro para este método; no se exige para crear un tutor. |
| `server/routes/auth.ts:319,368-377` | Emisión de liga | Genera por ID; incluye celular y mensaje de cómo compartir sin correo. No envía automáticamente. |
| `server/routes/auth.ts:447,463-474` | Canje y JWT del tutor | Conserva email NULL, sin el identificador de correo ficticio anterior. |
| `server/lib/email/pg-repository.ts:10` | Destinatarios de correo | NULLIF/BTRIM convierte ausencia o vacío en NULL. |
| `server/lib/email/recipients.ts:10-20` | Preparación | Estado omitido y motivo “sin correo”; no inventa destinatario. |
| `server/lib/email/service.ts:61`; `server/lib/email/pg-worker.ts:12` | Conteo y envío | Cuenta omitidos y sólo toma pendientes; el omitido no se despacha. |
| `server/routes/guardian.ts:287,307-313` | Customer Stripe | Email ausente se pasa como undefined al SDK; probado con cliente simulado. |
| `server/routes/admin.ts:602,824-825` | Tutores vinculados y edición | Devuelve el contacto nulo; el editor lo presenta vacío y permite guardarlo como NULL. |
| `server/routes/misc.ts:1183,1196-1197` | Diagnóstico de preparación | La falta de contacto se informa como observación, no se fabrica correo. |
| `server/routes/misc.ts:1392-1393` | Familias | JSON conserva los correos nulos. |
| `server/routes/misc.ts:1637-1653` | Buscador | OR por nombre conserva resultados aunque ILIKE(email) sea NULL; probado por HTTP. |
| `server/routes/fiscal.ts:86,271` | Información fiscal | Proyecta correo opcional; no timbra ni inventa email por estar ausente. |
| `server/routes/reportes-admisiones.ts:130,158,190,384,408` | Reporte y exportación | Mantiene NULL en JSON y celda vacía en exportación, sin persistir una cadena vacía. |
| `server/routes/payments.ts:293-296,413-438` | Plantillas CSV | Email es una columna de ejemplo, no requisito de contacto real; no es dirección de sustitución. |
| `server/routes/payments.ts:820-843` | Importación de tutores | Sólo nombre obligatorio en este importador heredado; correo opcional validado, normalizado o NULL. |
| `server/routes/payments.ts:1035,1124-1136` | Importación de familias | Campo vacío/ausente pasa al servicio central opcional; celular del principal se exige allí. Probado sin columna email. |
| `server/import-real-data.ts:16,209,218,243-246` | Herramienta Excel heredada | Email opcional; no busca por email si falta ni genera uno. Guarda previa en 42/104/267. No ejecutada. |
| `server/import-students-jfr.ts:15,44,55-58` | Herramienta CSV heredada | No omite al tutor por falta de correo; búsqueda condicional e INSERT nulo. Guarda previa en 21. No ejecutada. |
| `client/src/hooks/use-auth.tsx:14-19,105-119` | Modelo y acceso de portal | Guardian.email es string o NULL; login por contraseña mantiene su requisito de dirección. |
| `client/src/components/layout/header.tsx:133` | Encabezado/portal | Muestra “Sin correo” si falta, sin alterar persistencia o sesión. |
| `client/src/components/family-editor.tsx:13,44,93-95` | Formulario familiar | Correo opcional; blanco al editar equivale a NULL al guardar. Sólo celular principal requerido. |
| `client/src/pages/familias.tsx:131,134,904,2556` | Adaptación de listados y editor | Tolera NULL, presenta campo vacío o contacto disponible; no obliga correo. |
| `client/src/pages/estudiantes.tsx:33,170` | Tipo y contacto de tutor | Correo nullable; fallback a celular/teléfono o “Sin contacto”. |
| `client/src/pages/estudiantes.tsx:496,508,657,669,717,729` | Inicializar/restaurar formularios | Cadena vacía sólo en estado de inputs, no dirección inventada ni persistida por esta pantalla. |
| `client/src/pages/estudiantes.tsx:2071-2076,2185-2190` | Captura de contactos | Etiqueta de correo opcional; no tiene required. |
| `client/src/pages/configuracion-inicial.tsx:344` | Ayuda CSV activa | Explica correo opcional y celular obligatorio del principal. |
| `client/src/pages/importacion-datos.tsx:129-146` | Ejemplos del catálogo heredado | Describe columnas/muestras, sin validación de correo obligatorio ni inserción desde ellas. No es un envío. |
| `client/src/pages/reportes-admisiones.tsx:27,474` | Reporte visible | Tipo nullable y guion si falta. |
| `client/src/pages/fiscal-contable.tsx:533` | Contacto fiscal visible | React admite NULL y deja la línea de correo sin texto. |
| `client/src/pages/cuentas-por-cobrar.tsx:29` | DTO de contacto | Email opcional y nullable, sin desreferenciarlo como string obligatorio. |

Las declaraciones y ejemplos del seed son datos demo explícitos, no fallbacks
para contactos reales: se dejaron intactos, igual que E2E-17. Las herramientas
heredadas tocadas quedaron además protegidas con `assertTestDatabase` antes de
su SQL, según el protocolo; no se ejecutó ninguna de ellas.

## Servicio y formulario

El correo sólo se valida cuando existe; se escribe nulo en ambas columnas
cuando se omite o vacía. Vaciar explícitamente el campo canónico no recupera
silenciosamente el correo anterior del alias `email`.
La detección de duplicados omite las claves y predicados de email cuando no
hay correo; si tampoco hay CURP no ejecuta una búsqueda vacía. CURP conserva
su comprobación institucional.

El alta manual exige celular del primer responsable (el principal asignado
por el servicio). La edición comprueba el principal real de la familia,
no el primer tutor del payload; un celular omitido en PATCH se conserva y uno
vaciado explícitamente se rechaza para el principal. Los secundarios pueden
no tener celular. Un solo tutor es el principal.

El importador central también normaliza correo/celular, crea correos nulos
y comprueba el celular real del principal dentro de su transacción. Si falta,
revierte el grupo. Los tutores existentes conservan la regla previa de no
sobrescribir contactos al reutilizarlos, sin backfill de contactos históricos.
No se cambió la distribución de responsabilidades de pago.

El formulario identifica al principal real al editar y marca sólo su celular
como obligatorio. Correo se muestra opcional; no se inventan direcciones.

## Casos de prueba del ajuste

- Doce casos nuevos contra la base: cinco requisitos de contacto; importación
  sin correo; vaciado explícito con alias anterior; emisión/canje de liga;
  búsqueda real por nombre; principal en segunda posición y edición secundaria;
  endpoint CSV sin columna de email y sincronización nullable del perfil.
- SPEI-01 se extendió con un tutor cuyo correo es realmente nulo y una aserción
  sobre los parámetros recibidos por el cliente Stripe simulado. No se llama
  a Stripe real ni se crea un correo de sustitución.
- Siete casos de seguridad aislados para normalización y destinatario omitido.
- El recorrido E2E existente de familias deja el correo sin capturar, comprueba
  que sólo el celular principal es obligatorio y verifica NULL en la base tras
  el alta, además de recargar, editar y archivar.
- Se completaron teléfonos sintéticos de los fixtures válidos de FCM-02,
  FCM-03, FCM-06, IFT-01/02/03, WIS-05/06 e IFP-01 para que sigan alcanzando sus reglas originales.
  Sus aserciones de conflicto, atomicidad, porcentajes y dry-run no cambiaron.

La primera selección detectó esos seis fixtures sin celular y un payload de
edición del test nuevo sin nombre familiar; se corrigieron los datos de prueba,
no se relajaron las reglas. La repetición de los tres archivos afectados
aprobó sus 21 casos. La primera corrida completa detectó además WIS-05,
WIS-06 e IFP-01 con el mismo fixture sin celular; se completaron esos datos,
sin cambiar aserciones. La selección de esos dos archivos y los doce casos
nuevos pasó 28/28.

## Resultados finales

Horas UTC del 29 de octubre de 2026; equivalentes de Ciudad de México
del 28 de octubre entre paréntesis.

### `npm run test:safety`

Inicio 03:04:26 UTC (21:04:26 CDMX), aplicación detenida:

```text
Test Files  11 passed (11)
     Tests  378 passed (378)
  Start at  03:04:26
  Duration  10.33s (transform 2.71s, setup 0ms, import 2.07s, tests 6.70s, environment 1ms)
```

### `npm run test:unit`

Reinicio previo registrado:

```text
2026-10-29T02:52:09.829Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
2:52:10 AM [express] serving on port 5000
```

Inicio 02:52:24 UTC (20:52:24 CDMX):

```text
Test Files  144 passed | 1 skipped (145)
     Tests  1392 passed | 1 skipped (1393)
  Start at  02:52:24
  Duration  144.37s (transform 2.92s, setup 19.88s, import 26.13s, tests 79.16s, environment 11ms)
```

La corrida anterior, a las 02:48:24 UTC, tuvo 1391 aprobadas, una omitida
y un fallo: `server/tests/condonacion-assistant.test.ts:284`,
`C-4: plan cancelado + audit saldo_condonado en DB`:
`AssertionError: expected 0 to be greater than or equal to 1`.
No se cambió esa prueba ni la lógica de condonación; la siguiente suite
completa pasó. No se comparó ese fallo aislado en el commit base y, por tanto,
queda **sin clasificar**, no “preexistente”.

### `npm run test:e2e`

Reinicio previo registrado:

```text
2026-10-29T02:55:02.457Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
2:55:02 AM [express] serving on port 5000
```

Inicio 02:55:12 UTC (20:55:12 CDMX):

```text
Running 101 tests using 1 worker
101 passed (5.4m)
```

Los 101 casos corresponden a 35 archivos. E2E-32 aprobó el formulario sin
correo, con NULL verificado en la base; E2E-17 permaneció sin cambios.
Las tres capturas que la suite sobrescribió se conservaron fuera de Git y
se restauraron sus versiones previas, sin incluir PNG en este ajuste.

### Comprobaciones complementarias

- `npm run build`: aprobado, repetido sobre el código final.
- `npm run check:routes`: aprobado, 44 rutas y 44 entradas.
- `npm run check:migration-policy`: aprobado.
- `npm run check`: 24 diagnósticos, igual al registro del commit base
  `44174f921592a8a71cfa00ad4b2fefaa32891a27`, comparando archivo, código
  y mensaje sin números de línea. Ningún diagnóstico nuevo ni de los archivos
  modificados salvo el diagnóstico previo de iteración de Map en payments.
- Captura pública de login correcta. El formulario autenticado lo verificó
  E2E-32, no se simuló autenticación para la herramienta de captura.

## Límites y hallazgos no corregidos

- No se hicieron llamadas reales a Stripe ni envíos reales de correo.
  La prueba de Customer fue con el cliente simulado; las herramientas
  heredadas de importación no se ejecutaron.
- `server/index.ts:33-54` registra ruta y parte de respuestas JSON antes de
  truncarlas. El canje de ligas puede dejar fragmentos de token en ese log.
  No se modificó el logger fuera del alcance; la prueba nueva de liga usa
  las rutas reales en un servidor de pruebas sin ese logger.
- Se conserva el hallazgo de lectura de auditoría de C-4 descrito arriba,
  sin clasificación de origen y sin cambiar su comportamiento para ocultarlo.
- Advertencias de compilación por tamaño de bundles y Browserslist no se
  corrigieron; no impidieron el build.

La rama de este ajuste parte de
`44174f921592a8a71cfa00ad4b2fefaa32891a27`.
No se integra a `replit-en-vivo`, no se publica y no se usa Apply changes.
La aplicación quedó detenida al terminar; `/proc/net/tcp` no mostró LISTEN
en 5000 y una comprobación de bind sin listen confirmó que el puerto estaba
libre. El workflow quedó en estado `finished`.
