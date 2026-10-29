---
name: Jerarquía y aislamiento administrativo
description: Reglas del dueño para gestión de usuarios y consultas del asistente.
---

La gestión de usuarios no tiene una excepción para superadministradores:
no se asignan roles iguales o superiores al propio ni se gestionan pares o
superiores. Sólo se permiten los datos básicos propios como excepción.
Los destinos de otro tenant o campus deben responder 404.

**Why:** El dueño pidió expresamente aplicar la misma jerarquía a todas las
rutas, incluidos alias heredados, y obtener el ámbito desde la sesión.

**How to apply:** No reintroducir acceso transversal en alias de usuarios
por considerar que un superadministrador es global. No ampliar el catálogo
de roles o permisos para resolver un caso de gestión.

La única excepción autorizada también a la jerarquía es POST /api/demo/seed:
conserva su comportamiento de reemplazo demo, incluida la creación del rol
máximo, sólo bajo todas sus guardas existentes de superadministrador, entorno
no productivo, habilitación explícita y marcador de prueba/demo.

**Why:** El dueño confirmó esta excepción ante el conflicto entre la regla
de jerarquía y conservar la carga demo sin cambios.

**How to apply:** Excluir esa ruta por nombre en las pruebas de jerarquía,
junto con su excepción de reemplazo de expedientes; no extenderla a alias,
rutas de gestión u otros mecanismos de creación de usuarios.

El asistente conserva siempre tenant y campus de sesión. Una petición en
texto no autoriza cambiar ese ámbito; los intentos de forzar otro campus
deben quedar registrados sin guardar texto con datos personales.

**Why:** El dueño exige que ni herramientas, consultas ni diagnósticos
permitan obtener alumnos, familias o adeudos de otro campus.

**How to apply:** Incluir agregados, subconsultas, resolutores y bandejas de
incidencias en las pruebas de aislamiento, no sólo la búsqueda de alumnos.
