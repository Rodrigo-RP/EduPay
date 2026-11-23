# Despliegue y base de datos de producción (Cloud Run + Cloud SQL PG18)

**Decisión vigente (11-nov-2026, Karla):** la producción de EduPay es **Cloud SQL para PostgreSQL 18**, con la aplicación en **Cloud Run** y la imagen construida con **Cloud Build**. Ya no se usa Neon ni la publicación de Replit (`docs/PUBLICACION.md` quedó como registro histórico). Se está llevando a producción al mismo tiempo que se hacen los ajustes finales.

> Este repositorio es **público**. Aquí no van el ID del proyecto, la IP de la instancia, las URLs de los servicios, las cuentas de Google ni ninguna contraseña. Esos datos viven en `datos-google-cloud.local.md` (ignorado por git) y en Secret Manager.

## Piezas

| Pieza | Qué es |
|---|---|
| Base de datos | Cloud SQL para PostgreSQL **18**, una instancia con alta disponibilidad regional. La base de la aplicación se llama `edupay`. |
| Aplicación | Servicio de Cloud Run, un solo contenedor Node 22 (`Dockerfile`). Se conecta por socket: `DATABASE_URL` con `?host=/cloudsql/PROYECTO:REGION:INSTANCIA`. |
| Imagen | `gcloud builds submit --config cloudbuild.yaml --substitutions=_STRIPE_PK=pk_...` (la clave **publicable** de Stripe se incrusta al compilar; sin ella el build falla a propósito). |
| Secretos | Secret Manager. La imagen no lleva secretos ni ejecuta migraciones, seeds ni DDL. |
| Sincronización con el Dashboard | Cloud Run Job `edupay-sync-puente` (sin `--apply` solo simula; `--apply --confirm-tenant=<id>` escribe). Lee la función `puenteEduPayLectura` del Dashboard. |
| Acceso | El servicio es **privado** hasta que el Propietario del proyecto otorgue invocación pública. Entrada de usuarios: solo por SSO desde el Dashboard. |

## Variables de entorno obligatorias (nombres, no valores)
- Arranque de producción (`server/lib/production-startup.ts`): `APP_ENV=production`, `NODE_ENV=production`, `DATABASE_URL`, `SESSION_SECRET`, `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`. `ALLOW_DEMO_SEED=true` impide el arranque. El arranque se bloquea si la base tiene marcador `edupay:test` o `edupay:demo`.
- SSO (`server/lib/sso/config.ts`): `SSO_ENABLED`, `SSO_PUBLIC_KEY`, `SSO_ISSUER`, `SSO_AUDIENCE`, `SSO_SESSION_TTL_MINUTES` (decidido: **240**), `SSO_ASSERTION_MAX_AGE_SECONDS` (60 s). Apagado por defecto.
- Puente: `EDUPAY_BRIDGE_URL`; `EDUPAY_BRIDGE_SA_KEY` solo si se corre fuera de Google Cloud (en Cloud Run se usa la identidad del servicio).
- Stripe: `STRIPE_WEBHOOK_SECRET` (se monta cuando el servicio sea público).

## Reglas de seguridad de la base de producción
- **La base de producción no lleva marcador** `edupay:test` ni `edupay:demo`, y nunca debe llevarlo. Las suites unitarias, e2e y seeds están bloqueadas ahí a propósito.
- Nunca correr `npm test`, e2e, seeds ni `db:migrate` / `db:baseline:mark` contra producción. Esos comandos la rechazan.
- Las migraciones de producción van **solo** por `npm run db:migrate:prod`, a través del proxy de Cloud SQL y con `APP_ENV=production`. Sin `--apply` es un simulacro de solo lectura; con `--apply --confirm=<base>` escribe.
- Toda escritura en producción (migración, sincronización con `--apply`, UPDATE puntual) exige un **respaldo previo** y la autorización explícita de Karla ("Autorizo…").
- La verificación posterior es `npm run db:verify:prod` (solo lectura, compara contra `drizzle/schema-catalog.json`).

## Orden para llevar un cambio a producción
1. Revisar y probar en local y en CI (PostgreSQL 16 y 18).
2. Construir la imagen con Cloud Build.
3. Respaldo de la base.
4. `db:migrate:prod` en simulacro; con autorización, `--apply`; luego `db:verify:prod`.
5. Desplegar la revisión nueva de Cloud Run con la imagen nueva (conservando variables y secretos; ver `gcloud run services describe` antes).
6. Verificar arranque y rutas, y dejar constancia.

## Pruebas
- **CI** (GitHub Actions): PostgreSQL **16 y 18** desechables, marcados `edupay:test`. Un CI verde no valida cobros ni correos reales.
- **Local:** un PostgreSQL desechable (por ejemplo, un contenedor de Docker) marcado `edupay:test`. Nunca la base de producción.
- Las pruebas aisladas (`npm run test:safety`) no necesitan base real, pero sí variables ficticias (`DATABASE_URL` falsa, `STRIPE_SECRET_KEY` de prueba). En Windows, ejecutar Vitest desde una ruta con la letra de unidad en mayúscula (`C:/...`), o `vi.mock` no coincide.

## Estado (20-nov-2026)
- Migraciones aplicadas en producción: **0000 a 0011** (12 en el historial; la 0011 agrega `departamento` a `firebase_staff_candidates`). Verificado con `db:verify:prod`: estructura idéntica al catálogo.
- El servicio y el Job `edupay-sync-puente` usan la imagen construida el 20-nov con la clave publicable de **prueba** de Stripe. El servicio es **público** (`allUsers` con `run.invoker`) desde el 20-nov.
- El puente Dashboard → EduPay funciona en lectura: el simulacro del Job trae 23 candidatos de personal. **La sincronización de datos nueva (`--apply`) no se aplica todavía**; se aplica justo antes de probar el flujo completo con SSO.
- Pendiente: llave `sk_test_` y webhook de Stripe (los pagos de prueba aún fallan), RFC real del Instituto, SSO (fase B, ver `docs/PUENTE-PERSONAL-DASHBOARD.md`), asignar accesos del personal desde el panel.
- Respaldo automático diario de Cloud SQL activo (13:00 UTC). Antes de cada migración o `--apply` se toma además un respaldo manual.
- En Cloud Shell, para migrar o verificar, instalar los cuatro paquetes **juntos** (`npm install --no-save --no-package-lock drizzle-orm@0.45.4 pg@8.23.1 tsx@4.23.15 zod@4.6.7` en `~`); instalar uno solo borra los demás. Un Editor no puede leer secretos: la clave de `edupay_app` se teclea con `read -rs`.

## Lo que ya no aplica (no usar como guía)
- Publicación en Replit (Reserved VM, `deploymentTarget`, base administrada de Replit) y `docs/PUBLICACION.md`.
- La base de pruebas `heliumdb` de Replit y las ramas de Neon. El driver `@neondatabase/serverless` solo sigue en dependencias por unas pruebas heredadas y por la configuración del CI; el servidor usa `pg`.
