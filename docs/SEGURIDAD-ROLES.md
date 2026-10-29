# Seguridad de usuarios y alcance del asistente

Base de revisión: familias-real ya integrada. No se crean roles ni permisos.

## Jerarquía canónica

`shared/permissions.ts`, `ROLE_HIERARCHY`:
super_admin (7) > administrador_general (6) > administrador_campus (5) >
contador_general (4) > auxiliar_contable (3) > asistente (2) > admisiones (1).
`canEditUser` exige ambos roles conocidos y nivel del actor estrictamente mayor.
No hay excepción para superadministradores. Los permisos del módulo siguen
siendo necesarios: estar por encima en la jerarquía no concede permisos.

## Inventario de escrituras de usuarios

| Archivo | Ruta | Control |
|---|---|---|
| server/routes/users.ts | POST /api/users | USERS.CREATE, rol inferior; ámbito de sesión; sin flag de superadministrador |
| server/routes/users.ts | PUT /api/users/:id | USERS.UPDATE y destino/rol asignado inferiores; propios datos básicos como excepción |
| server/routes/users.ts | DELETE /api/users/:id | USERS.DELETE, destino inferior, sin autoeliminación |
| server/routes/users.ts | DELETE /api/admin/users/:id | Mismas reglas que el endpoint primario |
| server/routes/users.ts | POST /api/admin/users/:id/reset-password | USERS.UPDATE, destino inferior; nunca contraseña propia por este endpoint |
| server/routes/system.ts | POST /api/super-admin/create-user | Superadministrador autenticado más las mismas reglas de creación y ámbito |
| server/routes/system.ts | POST /api/super-admin/update-user-status | Destino inferior, mismo ámbito y estado booleano |
| server/routes/system.ts | POST /api/super-admin/reset-password | Destino inferior, mismo ámbito |
| server/routes/system.ts | POST /api/super-admin/create | Denegada: crearía un rol igual al máximo |
| server/routes/users.ts | PUT /api/profile | Sólo nombre, correo, teléfono y foto propios, sin mutación de rol |
| server/routes/users.ts | PUT /api/profile/password | Contraseña propia, verificación de contraseña actual y mismo ámbito |
| server/routes/system.ts | PUT /api/profile/photo | Sólo foto propia, mismo ámbito |
| server/routes/auth.ts | POST /api/auth/2fa/confirm; DELETE /api/auth/2fa | Segundo factor propio; no asignan roles |
| server/routes/demo-seed.ts | POST /api/demo/seed | ÚNICA excepción autorizada a la jerarquía; reemplazo demo con superadministrador, APP_ENV no productivo, ALLOW_DEMO_SEED=true y marcador test/demo |

Los endpoints de tutores editan guardians, no usuarios administrativos.
Los scripts no son rutas HTTP. El seed sí tiene una ruta y crea usuarios,
incluido super_admin. El dueño confirmó expresamente conservarla como única
excepción también a la jerarquía, junto con la excepción previa de reemplazo
de expedientes. No se alteraron sus guardas ni su comportamiento. Las demás
rutas de creación, edición, desactivación y cambio de rol no tienen excepciones.
Las pruebas la excluyen por nombre, no por prefijo ni por entorno del runner.

Cambios de rol o estado invalidan sesiones mediante password_changed_at, ya
existente. Las actualizaciones tienen lista de campos permitidos; los IDs,
ámbito y factores de autenticación no se escriben desde el cuerpo de gestión.

## Aislamiento del asistente

Las herramientas y sus resolutores reciben el ámbito de la sesión. Un lector
común acota las relaciones SQL mediante CTE antes de ejecutar agregados,
subconsultas o joins. Sólo admite SELECT/WITH internos parametrizados y
relaciones inventariadas; una relación desconocida se niega. La calificación
`public` o las comillas no eluden el filtro. El ámbito concurrente es independiente
por llamada y no puede sustituirse desde una llamada anidada.

Cada relación con campus se comprueba contra campuses, cuyo tenant debe ser el
de sesión. Cargos y becas se acotan por alumnos; pagos por cargos; aplicaciones
por sus pagos y cargos; facturas por pagos. Un tenant explícito distinto se
excluye aunque coincida el campus. Un tenant histórico nulo sólo se admite si
su padre ya acotado acredita la pertenencia: no se rellenan datos ni se hace
fallback a toda la institución. Las filas sin padre atribuible no se exponen.

Los checks de diagnóstico usan el mismo lector. La prueba destructiva de FK
se sustituyó por consulta del catálogo estructural: informa que comprueba una
FK validada, no afirma haber ejecutado una inserción inválida. Las sondas de
esquema con WHERE false LIMIT 0 y el catálogo estructural no devuelven datos
de familias; no requieren un tenant ficticio para inspeccionar columnas.
La auditoría conserva tenant, usuario y campus de sesión.

Una referencia explícita a un campus numérico distinto se rechaza antes de
consultar herramientas o al proveedor y se registra como assistant_scope_denied,
con IDs y motivo, sin guardar el texto. La bandeja de incidencias del asistente
también filtra tenant y campus, no sólo tenant.

## Consultas previas (sólo lectura)

```sql
SELECT current_database() AS database_name;
SELECT shobj_description(oid,'pg_database') AS environment_marker
FROM pg_database WHERE datname=current_database();
```

Resultado: heliumdb y edupay:test. El catálogo real de columnas se conserva
con la consulta completa en generated-artifacts/seguridad-roles/preflight.json
y scoping-columns.json, sin datos personales.
