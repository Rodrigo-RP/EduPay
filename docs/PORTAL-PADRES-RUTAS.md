# Inventario de llamadas del portal de padres

Revisión sobre `saldo-a-favor`; no se cambian permisos ni reglas financieras.

| Pantalla/componente | Llamadas propias o transitivas | Resultado |
|---|---|---|
| `pages/portal-padres-3clics.tsx` | GET `/api/guardian/dashboard`, POST `/api/guardian/pagar`, POST `/api/guardian/spei-intent` | Sólo rutas de tutores. Invalidaciones de caché repiten dashboard. |
| `pages/parent-portal.tsx` | GET `/api/guardian/dashboard` | Sólo tutor; sus hijos se revisan abajo. |
| `hooks/use-institution.tsx`, proveedor global de ambas pantallas | Antes GET `/api/institutional-info`, que es del personal. Ahora GET `/api/guardian/institutional-info` con sesión de tutor | Única llamada HTTP del personal encontrada en el árbol del portal; corregida. Se habilita después de resolver el tipo de sesión. |
| `components/layout/mobile-header.tsx` | Ninguna | Recibe el nombre por propiedades. |
| `components/payment-modal.tsx` → `pages/checkout.tsx` | Ninguna API; enlace interno `/portal-3clics?cargo=...` | No consume rutas del personal. |
| `pages/magic-link-redirect.tsx` | GET `/api/auth/magic/:token` | Canje público de liga del tutor; no es ruta autenticada del personal. |
| `hooks/use-auth.tsx`, `lib/auth.ts` | POST `/api/auth/guardian-login` al entrar como tutor | Autenticación de tutor, no personal. GET `/api/auth/user` sólo cuando `auth_type=user`. |
| `hooks/use-academic-filter.tsx` | Ninguna | Estado local. |
| `components/RealTimeProvider.tsx` → `hooks/use-realtime.tsx` | Sin conexión WebSocket cuando no hay usuario del personal | El tutor no abre el canal del personal ni ejecuta sus invalidaciones. |
| Guardas de onboarding, header/sidebar del personal | No montados en la rama guardian de App | No ejecutan llamadas durante el portal. |

La prueba de navegador de saldo a favor registra todas las peticiones HTTP
iniciadas por la página del padre y exige cero rutas distintas de guardian o
su endpoint de acceso. La petición negativa a una ruta financiera del personal
se realiza expresamente desde el cliente HTTP de la prueba, no desde la pantalla,
y debe ser denegada.

El endpoint institucional del tutor entrega sólo `nombre_legal` y `logo_url`,
buscados por ID/tenant autenticados y campus del registro de guardian. No usa
tenant/campus suministrados en la URL o el cuerpo. Si no hay configuración del
campus, el nombre procede del tenant y el logo queda nulo, no se inventa.
