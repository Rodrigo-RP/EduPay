# Instalación fuera de Replit

## Dependencias

Usar Node.js 20 y npm. Hacer la instalación en un clon o copia de trabajo
dedicado al entorno de destino.

El lockfile versionado contiene URLs del registro interno de Replit. Fuera de
Replit, antes de instalar:

```sh
node scripts/lockfile-public.mjs
npm ci
npm ls --all
npm run check
npm run build
```

El primer comando modifica **sólo la copia local** de `package-lock.json`:
reemplaza el prefijo `http://package-firewall.replit.internal/npm/` por
`https://registry.npmjs.org/`. No actualiza versiones, dependencias ni
integridades. Es idempotente: repetirlo informa cero reemplazos.
No subir ese cambio del lockfile al repositorio. `npm ci` instala las
versiones bloqueadas, sin usar `npm install` ni `npm audit fix`.
El workflow `.github/workflows/ci.yml` llama al mismo script en su runner.

## Configuración y base de datos

La instalación de dependencias no arranca la app ni aplica migraciones.
Configurar las variables del entorno de destino mediante su gestor de secretos,
sin copiarlas al código, al lockfile, a documentación ni a comandos guardados.
La app usa `DATABASE_URL`; comprobar por separado la identidad y el marcador
de su base antes de autorizar cualquier escritura.

Antes del build se necesita la configuración pública de Stripe
`VITE_STRIPE_PUBLISHABLE_KEY`. El arranque requiere la configuración del servidor,
incluidos `SESSION_SECRET`, `JWT_SECRET` y, para los módulos que lo exigen,
`STRIPE_SECRET_KEY`. Una configuración presente no demuestra que un proveedor
esté operativo. No usar claves de prueba como sustituto de una configuración real.

No ejecutar automáticamente `db:migrate`, seeds ni `scripts/post-merge.sh` para
completar la instalación. Requieren autorización independiente para la base
de destino. Tampoco usar “Apply changes” como paso de instalación.

## Verificación aislada del CI

GitHub Actions crea un PostgreSQL 16 nuevo por corrida, lo identifica como
`edupay:test` y usa `APP_ENV=test`. Sólo en ese servicio desechable ejecuta
las migraciones existentes y los fixtures antes de las suites.
Genera su configuración efímera y omite las pruebas de servicios reales
cuando no están habilitadas; un CI verde no valida cobros ni mensajes reales.

Los archivos `.github/ci/neon-config.mjs` y `postgres-bridge.mjs` permiten al
controlador Neon conectarse al PostgreSQL local del runner. Son exclusivos
del CI: no configurarlos para una instalación normal ni para una base externa.
