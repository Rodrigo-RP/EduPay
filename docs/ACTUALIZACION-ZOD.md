# Actualización a Zod 4

## Fuentes oficiales consultadas antes de adaptar código

Consultadas el 30 de octubre de 2026:

- https://zod.dev/v4/changelog
- https://github.com/causaly/zod-validation-error/tree/v5.0.0
- https://github.com/causaly/zod-validation-error/blob/v5.0.0/CHANGELOG.md

Versiones solicitadas: Zod 4.6.7, zod-validation-error 5.0.0,
drizzle-zod 0.8.3 y @hookform/resolvers 5.9.1, sin rangos.

## Cambios de API que afectan o requieren revisión en EduPay

- `ZodError.errors` desaparece: usar `issues`, conservando el nombre del
  campo HTTP `errors` y el mensaje español de la ruta de usuarios.
- `z.record` debe expresar la clave y el valor explícitamente en el lector
  del catálogo físico. No cambia el catálogo ni autoriza migraciones.
- Los imports se hacen explícitos como `zod/v4`, también para los tipos
  inferidos de los esquemas generados por drizzle-zod.
- Los UUID de Zod 4 son más estrictos. Donde se usaba el patrón permisivo
  de Zod 3, usar `guid` y conservar el mensaje anterior; no restringir los
  identificadores existentes a versiones o variantes nuevas.
- `.int()` de Zod 4 agrega el límite de entero seguro. En los esquemas
  manuales se conserva la comprobación anterior de entero sin añadir
  límites: `Number.isInteger`, con el mismo mensaje anterior. Los límites
  explícitos posteriores permanecen intactos.
- Revisar `coerce`, defaults, campos opcionales, formatos de correo/fecha y
  el resolver del formulario. No añadir campos, límites ni nuevos mensajes
  españoles. No hay defaults dentro de un `.optional()` exterior que
  deban convertirse para conservar la ausencia de claves.
- `message` y varios métodos encadenados siguen admitidos, aunque
  deprecados: no se reemplazan por validaciones con otra semántica.
- zod-validation-error 5 cambia la redacción predeterminada y separa
  `createErrorMap` de `createMessageBuilder`. EduPay no importa esta
  biblioteca en su código; no se instala un mapa global que cambie sus
  mensajes existentes.
- La validación de arreglos demasiado largos en Zod 4.6.7 evita recorrer
  sus elementos. Debe comprobarse que el arreglo de conceptos conserva
  el máximo de veinte y rechaza la petición sin llegar a la base.

## Inventario de los 25 consumidores existentes

### Compartidos, scripts e interfaz

- `shared/schema.ts`
- `scripts/verify-schema-exact.ts`
- `client/src/pages/profile.tsx`

### Bibliotecas de servidor

- `server/lib/totp-crypto.ts`
- `server/lib/production-startup.ts`
- `server/lib/migrate-totp.ts`
- `server/lib/bootstrap.ts`
- `server/lib/login-rate-config.ts`
- `server/lib/guardian-responsibility.ts`
- `server/lib/email/webhook-signature.ts`
- `server/lib/email/service.ts`
- `server/lib/email/resend-provider.ts`
- `server/lib/email/recipients.ts`
- `server/lib/email/config.ts`

### Rutas

- `server/routes/users.ts`
- `server/routes/two-factor.ts`
- `server/routes/notifications.ts`
- `server/routes/email-notifications.ts`
- `server/routes/payments.ts`
- `server/routes/charges.ts`
- `server/routes/fiscal.ts`
- `server/routes/admin.ts`
- `server/routes/system.ts`
- `server/routes/misc.ts`
- `server/routes/guardian.ts`
