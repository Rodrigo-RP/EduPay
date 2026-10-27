# EduPay

## Resumen

EduPay es una plataforma web para gestionar cargos, cobranza y pagos escolares, con portales administrativos y para tutores.
Está en desarrollo, con un piloto planeado en el Instituto JFR. No tiene base de producción, según lo declarado por el responsable del proyecto; esto no se infiere del estado de publicación de Replit.
No es un ERP ni un LMS. No debe describirse como lista para producción ni como una plataforma completamente auditada.

## Estado verificado

Última evidencia de ejecución: 27 de octubre de 2026, código `f84a9fb`.

- `DATABASE_URL` se verificó como la base de pruebas `heliumdb`, con comentario físico `edupay:test`. Ese resultado identifica la conexión de esa verificación, no cualquier conexión futura ni `NEON_DATABASE_URL`.
- Unitarias: 1333 aprobadas, 1 omitida y 0 fallos; 140 archivos aprobados y 1 omitido.
- E2E: 90 aprobadas en 31 archivos, sin fallos, omisiones ni casos inestables. EM-02 se ejecutó.
- Evidencia local de esa corrida: `generated-artifacts/fix-suite-heliumdb/round3/` (`preflight.json`, `unit.log`, `e2e-results.json` y `check.log`). Son artefactos ignorados por Git; no suponer que acompañan a un clon nuevo.
- Notificaciones por correo, fases A y B, están integradas: repositorios PostgreSQL, preparación de lotes, adaptador Resend, procesamiento de resultados y webhooks. No hay proveedor de correo real configurado ni envíos reales verificados.
- La presencia de una implementación, un Secret o una suite aprobada no certifica por sí sola una operación real con un proveedor ni la seguridad de toda la aplicación.

## Reglas de trabajo

- Leer y aplicar `.agents/skills/edupay-protocolo-desarrollo/SKILL.md` y `docs/PROTOCOLO-AUDITORIA.md`. Ante contradicciones, prevalece la skill.
- Usar lenguaje sencillo y español claro. Hacer ediciones incrementales y conservar lo que no forma parte de la tarea.
- Antes de cada suite dependiente de HTTP, reiniciar el servidor y registrar su línea real de arranque y hora. No confundirlas con la hora de inicio de las pruebas.
- Priorizar la experiencia móvil y un pago en tres clics o menos como objetivo de diseño, no como una medición ya demostrada.
- No publicar, ejecutar seeds, aplicar migraciones ni escribir en bases sin la autorización correspondiente.
- No guardar contraseñas, tokens ni claves privadas en código, documentación o memoria, tampoco de cuentas demo.
- No mostrar guardado, envío, entrega o timbrado exitoso sin evidencia de persistencia o del proveedor. Reportar implementaciones parciales y simulaciones como tales.

## Arquitectura

- **Frontend:** React 18 y TypeScript; rutas con Wouter; datos con TanStack Query; estilos Tailwind CSS y componentes Radix/shadcn. Entradas en `client/src/main.tsx` y `client/src/App.tsx`.
- **Backend:** Node.js, TypeScript y Express; `server/index.ts` crea la aplicación y `server/routes.ts` registra las rutas.
- **Acceso:** existen autenticación JWT, comparación de hashes bcrypt y comprobaciones mediante `hasPermissionForUser`. Esto no equivale a demostrar que todas las rutas y alias tengan aislamiento correcto.
- **Límites de peticiones:** `server/routes.ts` monta `express-rate-limit` para login, rutas administrativas y pago de tutores. Esto no equivale a un WAF ni a cobertura universal de endpoints.
- **Base:** PostgreSQL mediante `@neondatabase/serverless` y Drizzle ORM. `server/db.ts` consume `DATABASE_URL`; `shared/schema.ts` es el modelo de aplicación.
- **Migraciones:** `drizzle.config.ts` usa `drizzle/physical/schema.ts` y `drizzle/migrations/`. `db:generate` genera archivos y `db:migrate` aplica las migraciones versionadas.
- **`db:push` está bloqueado:** invoca `scripts/reject-db-push.ts`, que termina con error.
- **Post-merge:** `.replit` apunta a `scripts/post-merge.sh`; ese script contiene instalación, migración y build. No usar “Apply changes” como sustituto de una integración Git autorizada.

## Integraciones

Clasificación al revisar el código y la existencia de Secrets el 27 de octubre de 2026. “Configurado” en esta tabla sólo acredita los elementos indicados; no implica que se hayan validado las credenciales ni probado una operación real durante esta revisión.

| Servicio | Estado y alcance comprobado |
|---|---|
| PostgreSQL / Neon | Implementado y configurado para pruebas mediante `DATABASE_URL`; identidad y marcador documentados arriba. |
| Stripe / Stripe Connect | Implementado; Secrets de API y webhook presentes y clave pública de prueba declarada. Rutas de Connect y verificación de firma existentes. Configuración operativa por campus y cobros reales no verificados aquí. |
| SPEI mediante Stripe | Implementado sobre PaymentIntents y webhook de Stripe. No es una conexión directa con STP. No se verificó una transferencia bancaria real en esta revisión. |
| Facturapi | Adaptador implementado y Secret presente. Sólo permite Test Secret Key y organización `sandbox`; Live y multi-RFC no están habilitados. No se validó la clave ni un timbrado real aquí. |
| Anthropic / Claude | Implementado y Secret presente; hay cliente SDK y llamadas `messages.create`. No se hizo una llamada nueva al proveedor en esta revisión. |
| Resend | Implementado sin configurar: falta `RESEND_API_KEY` y no están definidos remitente ni destinatarios autorizados. El adaptador REST y la validación Svix existen; no hay worker de envío activado automáticamente por el registro de rutas. |
| Proveedor de correo simulado | Simulado, para pruebas. No equivale a aceptación o entrega por Resend. |
| SendGrid | Inexistente como adaptador operativo en el código revisado; sólo hay metadata histórica en `.replit` y no hay Secret de SendGrid. |
| STP directo | Inexistente como integración operativa; el flujo SPEI encontrado usa Stripe. |
| Openpay | Inexistente como adaptador de cobro; aparece como opción de interfaz. |
| Conekta | Inexistente como adaptador de cobro; aparece como opción de interfaz. |
| Evo Payment | Inexistente como adaptador de cobro; aparece como opción de interfaz. |
| Facturama | Simulado: una respuesta heredada devuelve el nombre y conexión “activo” de forma literal; no hay adaptador PAC que lo respalde. |
| Enlace Fiscal | Sin implementación encontrada. No confundirlo con el adaptador Facturapi. |
| SMS | Sin transporte de proveedor encontrado; un canal enumerado no acredita envíos. |
| WhatsApp Business | Sin integración automática de proveedor encontrada. Sí hay enlaces manuales `wa.me` para compartir; abrirlos no demuestra envío ni entrega. |
| Redis | Sin conexión ni cliente operativo encontrado; la cola de auditoría usa PostgreSQL. |
| Facebook Business | Sin cliente, flujo OAuth ni llamadas de proveedor encontrados. |
| Instagram Business | Sin cliente, flujo OAuth ni llamadas de proveedor encontrados. |
| TikTok Ads | Sin cliente, flujo OAuth ni llamadas de proveedor encontrados. |

En correo, `aceptado` sólo se registra tras aceptación del proveedor; `entregado` es otro estado y requiere evidencia del webhook. En desarrollo y pruebas, los destinatarios deben estar en `EMAIL_ALLOWED_RECIPIENTS`. Sin configuración no se debe sustituir el proveedor por un éxito simulado.

## Entornos

- `APP_ENV` es independiente de `NODE_ENV`. Las guardas de escritura exigen `development` o `test` y el marcador físico correspondiente; el nombre de la base por sí solo no autoriza nada.
- `DATABASE_MARKER_SQL`, en `server/lib/database-safety.ts`, lee el comentario PostgreSQL. Las pruebas requieren `edupay:test`; los seeds admiten `edupay:test` o `edupay:demo`. Nunca crear el marcador automáticamente para desbloquear una operación.
- `.replit` define `APP_ENV=development` y `ALLOW_DEMO_SEED=true` únicamente en `[userenv.development]`. No llevar esa habilitación a `shared` ni a publicación. El seed exige además sus guardas y una autorización de ejecución.
- `NEON_DATABASE_URL` es una conexión obsoleta según el responsable del proyecto. El CI aún la exige y la configura; la aplicación usa `DATABASE_URL`. No tratarlas como equivalentes ni modificar la primera para hacer pasar pruebas.
- Los Secrets se administran por el mecanismo de Secrets del proyecto; su existencia no acredita validez, modo de operación o configuración por campus.

## Cuentas de prueba

`server/seed-demo.ts` define y crea las cuentas administrativas y de tutores de demostración. Este documento no contiene correos con contraseñas ni IDs fijos de campus.
La identidad efectiva y el campus se deben obtener de la sesión o consultar en la base autorizada, no copiar de notas históricas. No ejecutar el seed sólo para recuperar accesos sin autorización.

## Sin verificar o no implementado

- **AES-256 aplicado a datos del sistema:** hay una clase de cifrado en `shared/security-engine.ts`, pero no se encontraron consumidores operativos; no demuestra cifrado de campos ni de la base.
- **2FA obligatorio global:** hay enrolamiento y verificación TOTP con Speakeasy y QR; la ruta de activación global sólo responde éxito, sin persistir una política global.
- **WAF:** sin respaldo de un WAF operativo en el código revisado. No se auditó infraestructura externa.
- **Detección de fraude operativa:** existe middleware y un motor, pero el historial está vacío y no se encontró montaje del middleware antifraude en el registro de rutas.
- **CSRF completo:** hay referencias a cabeceras, pero no se encontró generación y validación integral de tokens CSRF.
- **Protección universal contra SQL injection, XSS e inyección de comandos:** existen consultas parametrizadas y sanitización, pero no una auditoría que permita garantizar cobertura de todas las rutas. El detector de ataques no está montado globalmente.
- **Cabeceras Helmet y ExpressBrute globales:** están definidos, pero no se encontró su montaje; los límites de peticiones activos usan `express-rate-limit`, no ExpressBrute.
- **Openpay:** sólo opción de interfaz; sin adaptador encontrado.
- **Conekta:** sólo opción de interfaz; sin adaptador encontrado.
- **Evo Payment:** sólo opción de interfaz; sin adaptador encontrado.
- **Facturama:** estado de conexión heredado simulado, no integración verificada.
- **Enlace Fiscal:** sin implementación encontrada.
- **SMS:** sin proveedor de envío encontrado.
- **WhatsApp automático:** enlaces manuales no equivalen a integración Business ni a confirmación de entrega.
- **Redis:** sin cola o cliente Redis operativo encontrado.
- **Facebook Business:** sin integración encontrada.
- **Instagram Business:** sin integración encontrada.
- **TikTok Ads:** sin integración encontrada.
- **Instalación PWA y operación offline:** no verificadas; React/Tailwind no las garantizan.
- **Onboarding en menos de una hora:** objetivo no medido.
- **Más de 80 % de puntualidad y predicción efectiva de morosidad:** sin evidencia de medición o validación con un piloto real.
- **WebSocket libre de fallos y número exacto de notificaciones operativas:** no se sostiene como garantía general mediante esta revisión.
- **Todas las funcionalidades con datos reales, preparación total para producción o cumplimiento fiscal certificado:** no verificados; no usar esas afirmaciones.

## Pendientes conocidos

- Preparar CI con una base desechable, sin depender de la conexión obsoleta `NEON_DATABASE_URL` ni reutilizar una base compartida.
- Retirar la ruta HTTP `/api/test/reset-auth-rate-limit`, registrada cuando `NODE_ENV !== "production"` en `server/routes/auth.ts`; contradice la prohibición de rutas de prueba condicionales del protocolo.
- Auditoría de dependencias del 27 de octubre de 2026: **53 vulnerabilidades** (5 bajas, 18 moderadas, 25 altas y 5 críticas). Comando de sólo lectura: `npm audit --json --ignore-scripts`; no se aplicaron correcciones.
- **24 diagnósticos de TypeScript** en la comprobación de `f84a9fb`, idénticos al comparar con la base de esa ronda. No confundir las suites aprobadas con un `npm run check` aprobado.
- Configurar y autorizar por separado la prueba real de correo a un destinatario propio; no activar workers por actualizar documentación.
- Revisar las notas históricas de `.agents/memory/`: algunas aún contienen credenciales, IDs obsoletos o recomendaciones de rutas de prueba contrarias a la skill. No tomarlas como autorización.
