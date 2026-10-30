# Publicar EduPay por primera vez

Esta guía prepara una publicación futura. No significa que ya se publicó ni
autoriza al agente a entrar a la base de producción.

## 1. Antes de publicar

1. Revisa e integra la rama autorizada sólo después de su CI en verde.
2. En Publishing, confirma que usarás la base administrada de Replit para
   producción, **separada de `heliumdb`**, que es exclusivamente de pruebas.
   No apuntes `DATABASE_URL` de producción a `heliumdb` ni a una base externa.
3. Publica **sólo la estructura**. No actives la opción de copiar los datos de
   desarrollo ni sobrescribir datos: se copiarían cuentas demo, alumnos de
   prueba, movimientos y registros que no pertenecen a la escuela real.
4. El build es `npm run build` y el arranque es `npm run start`. Ninguno debe
   ejecutar DDL, seeds ni scripts de mantenimiento.

### Modalidad obligatoria: Reserved VM, una sola instancia

Publica EduPay como **Reserved VM con una sola instancia y un solo proceso
servidor Node.js**. No uses Autoscale, réplicas ni un administrador de procesos
en modo cluster con la implementación actual. Selecciona y verifica Reserved VM
en Publishing antes de confirmar cualquier publicación.

La documentación oficial consultada el 30 de octubre de 2026 describe Reserved
VM, pero no especifica un valor de `deploymentTarget` para esa modalidad.
Por eso no se cambia `.replit` ni se inventa un valor: actualmente conserva
`deploymentTarget = "autoscale"`. **Ese valor no cumple este requisito**; no
publiques si el panel sigue mostrando Autoscale. Confirma explícitamente la
modalidad Reserved VM en el panel.

Esta restricción es necesaria por cuatro motivos:

- **Procesos de fondo:** el worker de reintentos de auditoría necesita un
  proceso continuamente disponible. La cola sí es durable en PostgreSQL,
  pero su procesamiento depende del worker.
- **WebSockets:** las conexiones abiertas y el registro usado para cerrarlas
  al cambiar contraseña o restablecer 2FA pertenecen al proceso servidor.
  Actualmente no existe coordinación para cerrarlas en otras instancias.
- **Registro pendiente de 2FA:** el secreto pendiente se conserva cifrado en
  memoria durante un máximo de diez minutos. Otra instancia no comparte ese
  registro; un reinicio lo pierde y exige comenzar un registro nuevo.
- **Límites de intentos:** sus contadores están en memoria por proceso.
  Varias instancias repartirían los intentos entre contadores independientes;
  un reinicio también reinicia esos contadores.

Reserved VM no vuelve durable la memoria ni evita reinicios. Los secretos TOTP
confirmados, los hashes de respaldo y la cola de auditoría permanecen en la base.
Antes de admitir varias instancias se necesita estado pendiente y límites
compartidos, además de coordinación de revocaciones de WebSocket.

### Las migraciones nunca se corren en producción

**No ejecutes `npm run db:migrate`, `db:baseline:mark`, `db:push`, SQL de
migraciones ni `scripts/post-merge.sh` sobre producción.** Tampoco agregues
esos comandos al build o al arranque.

Replit aplica la estructura al publicar. `db:migrate` y `db:baseline:mark`
rechazan `APP_ENV=production` o `NODE_ENV=production`, antes de importar el
pool o ejecutar SQL. Esto también vale cuando la base de producción todavía
no tiene tablas. Si falta una tabla en producción, se revisa la estructura de
desarrollo y se vuelve a publicar; no se intenta repararla desde el arranque.
En desarrollo/CI ambos comandos exigen además entorno explícito `development`
o `test` y el marcador físico `edupay:test`, antes de cualquier escritura.

`Apply changes` no es el procedimiento de integración de este proyecto:
su hook instala dependencias, corre migraciones de desarrollo y recompila.

## 2. Variables y secretos de producción

Configúralos en **Publishing → Production app secrets**, no copiándolos desde
el entorno de desarrollo. Usa secretos nuevos, distintos y generados con tu
gestor de contraseñas. No los pongas en Git, documentos, chats ni capturas.

| Variable | Qué configurar |
|---|---|
| `APP_ENV` | `production`; ya está en `[userenv.production]` de `.replit`. No sobrescribir con `development` o `test`. |
| `NODE_ENV` | El comando `npm run start` lo establece en `production`. |
| `DATABASE_URL` | La conexión que Replit asigna a **su nueva base de producción**, nunca la de desarrollo. |
| `SESSION_SECRET` | Nuevo valor aleatorio, mínimo 32 caracteres. |
| `JWT_SECRET` | Otro nuevo valor aleatorio, mínimo 32 caracteres; no reutilizar `SESSION_SECRET`. |
| `TOTP_ENCRYPTION_KEY` | Secret nuevo: exactamente 32 bytes aleatorios en base64 canónico. No copiar el de desarrollo ni cambiarlo después sin recifrar los secretos TOTP. |
| `STRIPE_SECRET_KEY` | Clave de la cuenta y entorno de Stripe elegidos para producción. El SDK la exige al arrancar. No copiar la de desarrollo. |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Clave pública de la misma cuenta y entorno de Stripe; es configuración del build, no una contraseña. Sustituye la clave de pruebas compartida. |
| `STRIPE_WEBHOOK_SECRET` | Secreto nuevo del endpoint de webhook de esta publicación. Sin él no se deben aceptar liquidaciones del proveedor. |
| `BOOTSTRAP_TOKEN` | Nuevo valor aleatorio de al menos 32 caracteres, de un solo uso lógico. Mantenerlo sólo mientras se crea la institución. |

No habilites `ALLOW_DEMO_SEED`: debe estar ausente o ser `false`.

Después del cambio de contraseña temporal, el administrador inicial registra
su autenticador y guarda sus diez códigos de respaldo. Todo el personal debe
completar ese registro antes de usar la app. Consulta `docs/SEGURIDAD-2FA.md`.
`ALLOW_DEMO_SEED=true` impide el arranque de producción.

Los proveedores opcionales (correo, Facturapi, Anthropic y los demás que
realmente se activen) necesitan credenciales propias del entorno de
producción. No copies las de desarrollo. No confundas disponer de una clave
con tener configurado y probado un proveedor. Revisa su configuración antes
de habilitar envíos, cobros o timbrado.

No añadas `NEON_DATABASE_URL` para sustituir la conexión administrada.
Esta preparación no modifica esa variable ni convierte una base externa.

## 3. Primera publicación y comprobación de arranque

Cuando decidas publicar tú, revisa la configuración y las advertencias del
panel antes de confirmar. Después abre los logs:

- Debe aparecer `serving on port 5000`.
- Si falta un secreto obligatorio, el mensaje identifica su **nombre**, no
  muestra su valor.
- Si la base tiene marcador `edupay:test` o `edupay:demo`, el arranque se
  bloquea. No quites ese marcador para forzarlo: revisa el destino configurado.
- `POST /api/demo/seed` no se registra en producción, ni para un superadministrador.
- El servidor no importa `test-support`; CI verifica el grafo real de imports.
- La cola de auditoría debe existir por la estructura publicada. El servidor
  sólo comprueba sus columnas; no la crea.

Hasta este punto no hay usuarios ni instituciones. La pantalla de inicio de
sesión no crea cuentas automáticamente.

## 4. Crear tu institución y el primer administrador

El mecanismo es `POST /api/bootstrap`. Es público pero exige:

- `APP_ENV=production` y el secreto `BOOTSTRAP_TOKEN` configurado.
- El token en `Authorization: Bearer …`, nunca en la URL.
- Base sin usuarios, instituciones **ni campus**.
- Nombres, RFC y correo válidos. No acepta rol, tenant ni campus elegidos
  por el cliente: crea la institución y asigna sus nuevos IDs.

El resultado crea un **administrador general**, no un superadministrador.
Es la autorización inicial de esta guía, no una excepción para que un
usuario existente eleve su rol. No concede permisos nuevos.

Para no escribir secretos en el historial, este ejemplo se ejecuta en una
terminal privada **de tu computadora**, con Python 3. Pide los valores de forma
interactiva; no los incluyas en el código ni lo ejecutes en el workspace.
Usa la URL HTTPS que muestre Publishing, no el dominio de desarrollo.

```python
import getpass
import json
import urllib.request
import urllib.error
from urllib.parse import urlparse

url = input("URL HTTPS publicada por Replit: ").strip().rstrip("/")
if urlparse(url).scheme != "https" or not urlparse(url).netloc:
    raise SystemExit("Se necesita la URL HTTPS publicada y verificada.")
token = getpass.getpass("BOOTSTRAP_TOKEN de producción: ")
data = {
    "institutionName": input("Nombre legal de la institución: "),
    "rfc": input("RFC de la institución: "),
    "campusName": input("Nombre del primer campus: "),
    "adminName": input("Nombre del administrador: "),
    "adminEmail": input("Correo del administrador: "),
}
request = urllib.request.Request(
    url + "/api/bootstrap",
    data=json.dumps(data).encode(),
    headers={
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
    },
    method="POST",
)
try:
    with urllib.request.urlopen(request, timeout=60) as response:
        result = json.load(response)
    print("Institución creada. Guarda la temporal en tu gestor; no la compartas.")
    print("Contraseña temporal:", result["temporaryPassword"])
except urllib.error.HTTPError as error:
    print("No se completó la solicitud. Código HTTP:", error.code)
    print("Revisa el resultado antes de intentar nuevamente.")
```

**La contraseña sólo se devuelve al confirmar la operación.** No aparece en
logs ni auditoría y no existe una contraseña predeterminada. No guardes el
resultado en el repositorio ni hagas capturas con el token o la contraseña.
Si se corta la conexión después de confirmar, no supongas que no se creó:
el mecanismo no devolverá otra temporal. Pide revisar el estado y el
procedimiento de recuperación antes de repetir operaciones.

El token incorrecto se rechaza antes de conectar a la base. Hay un límite de
5 intentos cada 15 minutos por IP. Dos peticiones simultáneas no crean dos
instituciones: se bloquean las tablas durante la comprobación y escritura.

Después del primer uso, la base ocupada y el marcador persistido de
onboarding lo dejan cerrado, aunque el secreto siga existiendo. El wizard
no puede sobrescribir esa clave reservada. **Retira `BOOTSTRAP_TOKEN` de los
secretos de producción después de usarlo.** No borres registros ni cambies
marcadores para intentar volver a habilitarlo.

## 5. Cambiar la contraseña y comprobar el acceso

1. Inicia sesión con tu correo y la contraseña temporal.
2. Sólo verás **“Cambia tu contraseña temporal”**. No puedes usar las APIs
   protegidas ni saltarte la pantalla desde otra URL.
3. Elige una contraseña diferente, de al menos 12 caracteres y máximo
   72 bytes UTF-8. Confírmala.
4. El sistema guarda el cambio y te pide iniciar sesión otra vez. La
   contraseña temporal y los tokens anteriores dejan de servir.
5. Verifica tu institución/campus y completa su configuración antes de
   importar alumnos o emitir cargos. No cargues datos demo.
6. La creación y el primer cambio guardan eventos en la cola durable de
   auditoría. El worker los pasa a `audit_log` fuera de la transacción;
   una cola pendiente no significa que ya se escribió la auditoría final.

## 6. Qué verifica CI y qué sigue siendo una comprobación de publicación

CI usa PostgreSQL 16 desechable, con datos y secretos de prueba generados en
el runner. Compara exactamente las 12 categorías del catálogo, tanto antes
como después del servidor y las suites. Falla si cambian tablas, columnas,
tipos, CHECK, estados `NOT VALID`, índices, esquemas o los demás objetos
inventariados. No normaliza diferencias ni reemplaza el catálogo en CI.
No compara propietarios, privilegios/ACL, roles del servidor ni valores
actuales de secuencias.

Prueba además el bootstrap sobre **otra base vacía desechable**: rollback,
dos solicitudes concurrentes, cambio obligatorio y rechazo de reutilización.
La prueba de navegador verifica la pantalla y el bloqueo de APIs.

El catálogo esperado está en `drizzle/schema-catalog.json`; cualquier cambio
futuro se captura y revisa deliberadamente en desarrollo, junto con su
migración. Nunca se “arregla” CI ignorando diferencias.

Estas pruebas no verifican tu futura publicación, sus secretos, sus permisos
de base ni los proveedores reales. No hacen cobros, envíos ni timbrados.

Referencias oficiales consultadas:
- [Bases de desarrollo y producción](https://docs.replit.com/features/data-and-storage/development-and-production).
- [Secrets](https://docs.replit.com/core-concepts/project-editor/app-setup/secrets).
- [Tipos de publicación: Reserved VM](https://docs.replit.com/features/publishing/deployment-types) — consultada el 30 de octubre de 2026.
- [Configuración de Replit](https://docs.replit.com/features/project-setup/configuration) — consultada el 30 de octubre de 2026.
