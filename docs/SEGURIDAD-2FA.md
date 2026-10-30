# Dos factores para el personal

Todos los roles del catálogo de `users` deben registrar un autenticador antes
de acceder a cualquier pantalla de trabajo. Los padres conservan su flujo y
duración de sesión anteriores. El administrador inicial primero cambia su
contraseña temporal, vuelve a iniciar sesión y después registra dos factores.

## Clave de cifrado

`TOTP_ENCRYPTION_KEY` es un Secret del servidor: exactamente 32 bytes aleatorios
en base64 canónico. Zod valida el formato; es obligatoria en producción.
Nunca se envía al navegador ni se imprime. Conservarla de forma segura: cambiarla
sin recifrar previamente los secretos existentes impediría descifrarlos.
No copiar la clave de desarrollo a producción.

Los secretos TOTP se almacenan como `v1:iv:tag:cifrado`, AES-256-GCM con IV
aleatorio de 12 bytes y AAD vinculada al ID del usuario. No existe lectura
compatible con texto plano en el login: el backfill explícito debe preceder
a la activación del nuevo código si existen cuentas antiguas configuradas.

`npx tsx scripts/encrypt-totp-secrets.ts` es idempotente y sólo permite
`heliumdb`, APP_ENV development/test y marcador `edupay:test`. Valida todos
los cifrados existentes y actualiza los secretos antiguos en una transacción.
No modifica el esquema ni se ejecuta al arrancar, publicar o migrar.

## Registro

El QR y el código manual contienen el mismo secreto. Se entregan únicamente
durante un registro pendiente del usuario autenticado, con `Cache-Control:
no-store`. El pendiente sólo se conserva cifrado en memoria del servidor,
vence a los diez minutos y no sobrevive reinicios. Un nuevo registro genera
otro secreto y reemplaza al anterior. Setup y confirmación se serializan por
cuenta, incluida la respuesta, para impedir entregas concurrentes posteriores
a la confirmación. Tras confirmar ningún endpoint recupera el secreto.

Se entregan diez códigos de respaldo aleatorios de 128 bits, una sola vez.
Sólo sus hashes SHA-256 vinculados a la cuenta se guardan en PostgreSQL.
El consumo es un UPDATE condicional atómico: el mismo código no permite
dos inicios de sesión, ni siquiera con peticiones concurrentes.

## Restablecimiento

Desde Usuarios, sólo un administrador general con el permiso existente
USERS.UPDATE puede restablecer a otra cuenta de rol inferior del mismo tenant
y campus. No hay excepción para pares ni para la propia cuenta. Se exige un
motivo, una primera confirmación y otra con un desafío de cinco minutos
ligado a actor, objetivo y versión de la cuenta.

La transacción bloquea la fila, elimina secreto y hashes, cambia la versión
de sesión y escribe el evento pendiente en audit_retry_queue. El worker
persiste audit_log fuera de la transacción (ADR-001). Los reintentos no duplican
el cambio ni el evento. No existe un botón de desactivación propia.

Guardar los códigos de respaldo es esencial: esta tarea no introduce una
excepción de jerarquía para recuperar a un administrador general sin ellos.

## Sesiones y tiempo real

Las sesiones del personal tienen un límite absoluto de ocho horas contado
desde el inicio original; refrescar el JWT no lo prolonga. El acceso de padres
no cambia. Una sesión que sólo verificó contraseña sólo puede registrar dos
factores o cambiar la contraseña inicial: no puede usar APIs ni WebSocket.

Cambiar/restablecer una contraseña o restablecer dos factores invalida la
versión de sesión y cierra inmediatamente las conexiones del proceso servidor.
Una generación de revocación evita aceptar una conexión cuya autenticación
estaba en curso durante el cambio. Cada WebSocket también vence al terminar
su sesión. La coordinación entre varias instancias no está implementada;
el cierre inmediato aquí está limitado al proceso que confirma el cambio.

## Esquema y verificación

La migración 0006 agrega únicamente `users.twofa_backup_hashes text[]`, nullable.
Se entrega generada, sin aplicarla en heliumdb. El CI sí crea el esquema en su
PostgreSQL desechable y compara exactamente el catálogo antes y después.
No usar “Apply changes”: el hook post-merge aplicaría las migraciones pendientes.
No ejecutar migraciones en producción; se conserva el procedimiento de
`docs/PUBLICACION.md`.
