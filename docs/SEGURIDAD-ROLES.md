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

Los endpoints de tutores editan guardians, no usuarios administrativos.
Los scripts y el seed no son rutas de gestión de usuarios: se mantienen sus
guardas existentes, sin ejecutarlos directamente ni ampliar sus facultades.

Cambios de rol o estado invalidan sesiones mediante password_changed_at, ya
existente. Las actualizaciones tienen lista de campos permitidos; los IDs,
ámbito y factores de autenticación no se escriben desde el cuerpo de gestión.

## Consultas previas (sólo lectura)

```sql
SELECT current_database() AS database_name;
SELECT shobj_description(oid,'pg_database') AS environment_marker
FROM pg_database WHERE datname=current_database();
```

Resultado: heliumdb y edupay:test. El catálogo real de columnas se conserva
con la consulta completa en generated-artifacts/seguridad-roles/preflight.json
y scoping-columns.json, sin datos personales.
