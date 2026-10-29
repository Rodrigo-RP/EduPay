# RESUMEN

Se integró familias-real por avance directo: replit-en-vivo local y remoto
quedaron en 0ac938f0f17bc44b6e4f0e83d16ddb4c5675b96c.
El trabajo de seguridad permanece exclusivamente en seguridad-roles, sin integrar.

La jerarquía única existente es super_admin > administrador_general >
administrador_campus > contador_general > auxiliar_contable > asistente >
admisiones. No se crearon roles ni permisos. Ningún alias administrativo
puede asignar pares/superiores, gestionar pares/superiores ni elevar el rol
propio. Datos básicos propios son la excepción de autogestión, no de ámbito:
sin tenant/campus válidos tampoco hay autorización global para super_admin.
Destinos de otro tenant/campus devuelven 404.

POST /api/demo/seed es la ÚNICA excepción autorizada a la jerarquía, junto
con su excepción previa al reemplazo de familias/tutores/alumnos. Conserva
exactamente sus guardas: superadministrador, APP_ENV no productivo,
ALLOW_DEMO_SEED=true y marcador edupay:test o edupay:demo. No se cambió
su comportamiento ni el botón; las pruebas la excluyen por nombre.

Las consultas, herramientas y diagnósticos del asistente usan tenant/campus
de sesión. Un intento explícito de forzar otro campus numérico se rechaza
antes de las herramientas/proveedor y se audita sin guardar el texto.
El lector admite datos históricos con tenant nulo sólo cuando su padre
ya filtrado acredita pertenencia; nunca admite un tenant explícito ajeno.
Los metadatos estructurales sin filas personales se consultan como tales.

# ARCHIVOS MODIFICADOS

- shared/permissions.ts: comparación jerárquica estricta sobre el catálogo existente.
- server/lib/user-authorization.ts: decisiones comunes, ámbito y campos permitidos.
- server/routes/users.ts: gestión, alias y perfil propio protegidos.
- server/routes/system.ts: alias heredados protegidos, estado false válido y foto propia.
- server/routes/auth.ts: segundo factor propio limitado al ámbito.
- server/routes/demo-seed.ts: sólo comentario de la excepción autorizada; sin cambio funcional.
- server/lib/assistant-scoped-reads.ts: contexto por llamada y CTE filtradas antes de agregados/joins.
- server/assistant-actions.ts: herramientas y resolutores bajo ese contexto.
- server/assistant-health-checks.ts: diagnósticos acotados; FK comprobada por catálogo,
  no mediante inserción inválida. No presenta una inspección estructural como prueba de escritura.
- server/routes/assistant.ts: rechazo auditado y bandeja de incidencias por tenant/campus.
- server/safety-tests/assistant-scope.test.ts: lector, relaciones y contexto concurrente.
- server/safety-tests/user-role-matrix.test.ts: 557 casos e inventario AST de
  14 rutas no exceptuadas; exclusión exacta POST /api/demo/seed, sin comodines.
- server/safety-tests/user-routes-policy.test.ts: seis pruebas HTTP, almacenamiento simulado.
- server/safety-tests/user-system-policy.test.ts: seis pruebas HTTP de alias heredados.
- server/tests/assistant-session-isolation.test.ts: tres pruebas con fixtures propios
  en heliumdb, dos tenants y tres campus; también filas con tenant explícito inconsistente.
- server/tests/password-changed-at.test.ts: superadministrador de prueba del ámbito
  correcto, en vez de asumir que el ID global 1 pertenece al campus; mismas aserciones.
- docs/SEGURIDAD-ROLES.md: inventario de rutas, matriz esperada y decisiones.
- .agents/memory/MEMORY.md y role-and-assistant-isolation.md: reglas confirmadas.
- Este reporte.

# MIGRACIONES

Ninguna creada o aplicada. Sin cambios de esquema, npm install, Apply changes,
publicación ni desactivación de workflows. Las escrituras de fixtures y los
seeds internos de las suites se ejecutaron únicamente en heliumdb marcada
edupay:test; no se lanzó un seed manual.

# PRUEBAS

Corridas finales, UTC 29/10/2026; hora local CDMX 28/10/2026:

| Comando | Inicio UTC / CDMX | Resultado | Duración |
|---|---|---|---|
| npm run test:safety | 03:55:07 / 21:55:07 | 15 archivos, 980 aprobadas | 8.94 s |
| npm run test:unit | 03:52:28 / 21:52:28 | 145 archivos aprobados, 1 omitido; 1395 pruebas aprobadas, 1 omitida | 125.33 s |
| npm run test:e2e | 03:56:29 / 21:56:29 | 101 aprobadas, 35 archivos; EM-02 ejecutada | 5.3 min |
| npm run build | Entre unitarias y E2E | exit 0 | — |
| npm run check:routes | Entre unitarias y E2E | 44 rutas, exit 0 | — |
| npm run check:migration-policy | Entre unitarias y E2E | exit 0 | — |
| npm run check | Rama actual y copia temporal de 0ac938f | exit 2 en ambas; mismos 24 diagnósticos | — |

Seguridad también pasó antes de unitarias (980, 03:51:31, 11.81 s).
Se repitió tras sustituir únicamente el spread de Set por Array.from en
la prueba estática, para ser compatible con el target de TypeScript.
La comparación de tsc elimina sólo posiciones línea/columna: mismos archivos
y mensajes; cero diagnósticos añadidos o eliminados.

Bloques completos de las suites:

```text
Test Files  15 passed (15)
     Tests  980 passed (980)
  Start at  03:55:07
  Duration  8.94s (transform 1.30s, setup 0ms, import 2.70s, tests 4.22s, environment 1ms)

Test Files  145 passed | 1 skipped (146)
     Tests  1395 passed | 1 skipped (1396)
  Start at  03:52:28
  Duration  125.33s (transform 2.74s, setup 19.56s, import 25.34s, tests 61.46s, environment 12ms)

101 passed (5.3m)
```

Reinicios reales antes de cada suite que usa el servidor:

```text
2026-10-29T03:52:13.538Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
3:52:13 AM [express] serving on port 5000

2026-10-29T03:56:18.670Z [audit-retry] info: audit_retry worker iniciado (intervalo: 30s, max_attempts: 3)
3:56:18 AM [express] serving on port 5000
```

En copia temporal de 0ac938f, tres reproducciones HTTP aisladas confirmaron
200 al editar un par superadministrador, elevar un inferior al rol máximo
y editar un destino de otro tenant con igual campus. En la rama corregida,
las pruebas HTTP verifican 403, 403 y 404 respectivamente.

La primera corrida unitaria expuso incompatibilidades de esta implementación:
reset propio debía conservar 400; becas históricas nulas no debían desaparecer
si el alumno acredita su ámbito; el fixture root global no era del campus
de la prueba. Se corrigieron sin llamar a estos fallos «preexistentes».
Los fixtures nuevos se ajustaron a longitud RFC válida y búsqueda de alumno
inequívoca. Corrida final completa sin fallos, sin relajar aserciones existentes.

Captura pública del login verificada. Evidencia local ignorada en
generated-artifacts/seguridad-roles/: logs completos, comparación tsc, preflight,
estados de workflow y capturas. Las tres imágenes que E2E regenera se copiaron
allí y se restauraron en Git; no se incluyen PNG ni resultados generados.
Workflow detenido al terminar; /proc/net/tcp sin listener 5000, verificado
2026-10-29T04:04:12Z. No se eliminó ni desactivó el workflow.

# CONSULTAS A LA BASE

Diagnóstico manual exclusivamente SELECT. Consultas completas:

```sql
SELECT current_database() AS database_name;
-- Resultado: heliumdb; se repitió antes de las escrituras de las suites.

SELECT shobj_description(oid, 'pg_database') AS environment_marker
FROM pg_database WHERE datname = current_database();
-- DATABASE_MARKER_SQL; resultado: edupay:test.

SELECT table_name,column_name
FROM information_schema.columns
WHERE table_schema='public'
AND table_name IN ('users','students','families','guardians','charges','payments','campuses')
ORDER BY table_name,ordinal_position;
-- 130 columnas; verificación previa del SQL de ámbito.

SELECT table_name,array_agg(column_name ORDER BY ordinal_position) AS columns
FROM information_schema.columns
WHERE table_schema='public'
AND table_name IN ('students','families','guardians','family_students',
 'student_guardian','charges','payments','payment_applications','payment_plans',
 'scholarships','bank_transactions','concepts','products','users','audit_log',
 'approval_notifications','pending_approvals','institutional_settings','invoices','campuses')
GROUP BY table_name ORDER BY table_name;
-- 20 tablas; relaciones disponibles para el lector acotado.

SELECT table_name,column_name,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public'
AND table_name IN ('tenants','families','concepts','charges')
ORDER BY table_name,ordinal_position;
-- 45 columnas; requisitos reales de los fixtures nuevos.
```

Las consultas internas de herramientas y las escrituras/teardown de pruebas
son verificación automatizada, no diagnósticos manuales ni backfills. Los
fixtures nuevos verifican el marcador y limpian únicamente sus propios IDs.
No se modificó NEON_DATABASE_URL ni se usó como destino.

# DOCUMENTACIÓN EXTERNA CONSULTADA

No aplica: no se agregó integración, biblioteca ni llamada a API externa.
Se consultaron la skill del proyecto, docs/PROTOCOLO-AUDITORIA.md y las
instrucciones locales de workflows y memoria.

# LO QUE NO PUDE VERIFICAR

El check global no está verde: conserva los 24 errores reproducidos en la
base. Una prueba y su archivo continúan omitidos por la configuración
existente; no se modificaron filtros ni se añadieron skips. No se presenta
esta entrega como auditoría completa de autenticación o de producción.

# HALLAZGOS FUERA DE ALCANCE (NO CORREGIDOS)

- server/routes/auth.ts:527-531 conserva una ruta HTTP de reset condicionada
  por NODE_ENV, contraria al protocolo. Presente en la base; blame señala
  6d918e9a, 17/08/2026. No fue creada ni alterada por esta tarea.
- server/routes/shared.ts:72-78 compara iat con password_changed_at redondeado
  a segundos. Cambios en el mismo segundo no quedan invalidados por esa
  comparación. La carga de metadatos también conserva rol/ámbito del JWT.
  Observación de código, sin prueba de explotación; no se amplió este trabajo
  a rediseñar la revocación de sesiones.
- La captura del login mostró un handshake 400 del WebSocket de Vite.
  La pantalla renderiza y E2E pasó; este aviso no se comparó con la base,
  por lo que queda sin clasificar, no «preexistente».

# RAMA

seguridad-roles, desde 0ac938f0f17bc44b6e4f0e83d16ddb4c5675b96c.
Commits separados de jerarquía, aislamiento del asistente, matriz/excepción
demo y este reporte; todos con [skip ci]. Sin merge a replit-en-vivo.

# COMMIT

El hash completo final y la salida real de git ls-remote se entregan en el
mensaje final, después del commit de este reporte. El propio archivo no
puede incluir su hash autorreferente. Se verifica además que replit-en-vivo
local/remoto permanezcan en la base y que el árbol de trabajo quede limpio.
