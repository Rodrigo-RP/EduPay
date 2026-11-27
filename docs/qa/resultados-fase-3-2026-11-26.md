# Resultados de la fase 3: datos maestros y configuración

Fecha: 26-nov-2026. Commit `8400ba6`. Entorno: base desechable `edupay_ci` (PostgreSQL 18) y servidor local con `APP_ENV=test`, las mismas cuentas y datos que `resultados-fase-1-2026-11-26.md`. Producción no se tocó. Los scripts viven fuera del repositorio.

## Alcance y método

Área B del inventario (58 funciones). Se ejecutaron 52 pruebas por API contra el servidor real, con 2FA real, sobre las 11 funciones Críticas del área y las validaciones que los agentes reportaron. Cada prueba afirma el comportamiento diseñado: un fallo es un defecto reproducido (o una decisión de producto pendiente), no una prueba rota. Las pruebas crean sus propios alumnos, familias y productos ficticios, así que la base desechable queda con datos de QA adicionales.

Dos lecciones de método que cambiaron resultados:
- Playwright reinicia el proceso tras una prueba fallida y se pierde el estado compartido; las pruebas de familias fallaban en cascada por eso, no por el sistema. Cada prueba crea ahora sus datos.
- Un 400 en una petición mal armada por mi prueba oculta el comportamiento real. Se corrigieron los cuerpos con las formas que lee el código (por ejemplo, la alta de familia devuelve `family_id`, no `id`).

## Resumen

52 pruebas: 35 pasan y 17 fallan. Las 17 fallas son **15 defectos nuevos (Q-19 a Q-33)** y 2 ya conocidos (Q-11 y Q-12). Además, **4 hallazgos de los agentes quedaron refutados o reducidos** (sección siguiente).

## Defectos nuevos reproducidos

| ID | Defecto | Evidencia | Funciones |
|---|---|---|---|
| Q-19 | **Alta de alumno sin validación:** una CURP "XXX" y un `status` inventado se aceptan | 201 en ambos casos | B-03 |
| Q-20 | **Asignación masiva en el alta de alumno:** el servidor guarda lo que viene en el cuerpo, incluidos `id`, `password_hash` y `username` (reproducido dos veces) | La fila quedó con el `id` impuesto, `username = 'qa-hack'` y `password_hash = 'hack'` | B-03 |
| Q-21 | **Importación legada de alumnos** (la del botón de Estudiantes): una coma dentro de comillas parte la fila (el nombre "…, Hijo" se lee como CURP "HIJO" y se rechaza); el nombre completo se guarda entero en `nombres` con `apellido_paterno` nulo; reimportar el mismo archivo duplica | `Fila 2: CURP inválida (HIJO)`; fila con `nombres` completo y apellido nulo; 2 alumnos iguales tras la segunda importación | B-06 |
| Q-22 | **Un CSV con BOM falla completo con un mensaje engañoso:** el importador no quita el BOM, así que la primera columna se lee mal. El mismo archivo sin BOM importa bien. Un archivo guardado desde Excel como "CSV UTF-8" lleva BOM. La plantilla oficial funciona tal cual porque su BOM cae en una línea de comentario que se descarta, pero deja de funcionar si se borran los comentarios | Sin BOM: 2 de 2; con BOM: 0 de 2, "Nombre completo y CURP son requeridos" | B-18 |
| Q-23 | **Subir un archivo `.txt` a la importación responde 500** en lugar de un 4xx | HTTP 500 | B-18 |
| Q-24 | **Conceptos:** editar sin enviar `iva` lo deja en `false` (borra el IVA); crear un concepto sin nombre responde 500 | `iva` pasó de `true` a `false`; 500 | B-25 |
| Q-25 | **Productos:** `PATCH /api/products/:id` sin el campo `activo` responde 500 | HTTP 500 | B-29 |
| Q-26 | **Información institucional sin validación:** RFC "123" y un correo sin formato se guardan | 200 en ambos | B-37, B-41 |
| Q-27 | **Fechas de vencimiento:** sin `meses_aplicacion` responde 500; se acepta una segunda regla activa para el mismo concepto y mes, que luego hará fallar la emisión de cargos | 500 y 201 | B-47 |
| Q-28 | **Periodos de vencimiento:** un cuerpo vacío responde 500 en lugar de 400 | HTTP 500 | B-48 |
| Q-29 | **Reglas de pago (`/api/payment-rules`):** el asistente puede crear y leer reglas | POST 200 y GET 200 | B-52 |
| Q-30 | **Calendario financiero:** crear un evento sin título responde 500; completar un evento inexistente responde 200 | 500 y 200 | B-53 |
| Q-31 | **Validación de integridad antes de activar:** cuenta las becas de alumnos de otro campus de la misma escuela y marca un error bloqueante falso (en el campus 2: "9 becas asignadas a alumnos que no pertenecen a este campus") | `ok:false` con ese error | B-43 |
| Q-32 | **`update-school-status` responde "Estado de escuela actualizado a suspendida" sin cambiar nada** (éxito simulado) | La fila del tenant quedó idéntica | B-57 |
| Q-33 | **Asignación de precios por nivel (función Crítica):** (a) el nivel se deduce del texto de `grado`, no del campo `nivel_escolar`; con grados como "3°" cualquier dígito del 1 al 6 se clasifica como PRIMARIA, así que alumnos de secundaria, kinder y bachillerato pagaron el precio de primaria (20000 en lugar de 30000, y cargos a niveles con precio 0 que debían omitirse); (b) los alumnos sin grado reconocible se cobran como PRIMARIA; (c) ejecutar la asignación dos veces **duplica los cargos** (15 pasaron a 30) | 15 cargos del mismo monto; `skipped_without_price: 0`; 30 cargos tras la segunda ejecución | B-30 |

Q-11 (administrador general y contador sin acceso a la lista de becas) y Q-12 (`nombre_completo` queda desactualizado al editar un apellido) se reprodujeron otra vez en esta fase.

### Sobre Q-33: lo que sí y lo que no se sabe

- La función `getAcademicLevel` (`shared/academic-levels.ts`) documenta que su valor por defecto es PRIMARIA "por decisión de diseño", y que los dígitos del 1 al 6 sin palabra clave se tratan como primaria. El problema aparece cuando el `grado` trae solo el número, como en el seed ("3°").
- **No sé cómo viene el `grado` en los 669 alumnos reales de producción.** Si trae el nombre del nivel ("3° Primaria", "1° Secundaria"), el efecto (a) y (b) no ocurre; el efecto (c), la duplicación, ocurre en cualquier caso. Se resuelve con una consulta de solo lectura en producción (`SELECT nivel_escolar, grado, count(*) FROM students GROUP BY 1, 2`), que no he ejecutado.

## Hallazgos de los agentes refutados o reducidos

| Hallazgo | Resultado |
|---|---|
| H-B10: la fecha de vencimiento acepta días fuera de 1 a 31 | **Refutado en parte.** Día 45 y día 0 responden 400. Lo que sí falla es el cuerpo sin `meses_aplicacion` (500) y la regla duplicada (Q-27) |
| H-B24: los productos aceptan precios negativos o de texto | **Refutado.** Precio negativo y "abc" se rechazan con 4xx. Lo que sí falla es el PATCH sin `activo` (Q-25) |
| H-B15: una vigencia de beca inválida responde 500 | **Refutado.** "mañana" como vigencia inicial responde 400 |
| H-B13: la importación parsea archivos antes de autenticar | **Refutado para la subida sin sesión:** responde 401. Lo que sí se reprodujo es el problema del BOM (Q-22) |

## Funciones que pasan (comportamiento correcto confirmado)

- **Alumnos (B-01 a B-05):** el listado muestra solo alumnos del campus de cada rol; el acceso directo a un alumno de otro campus da 403 y un identificador inválido 400; admisiones da de alta, asistente y contador no, y el campus del cuerpo se ignora (siempre el del token); la edición persiste, rechaza CURP inválida, campos desconocidos y alumnos de otro campus; un estatus de 60 caracteres da 400.
- **Familias (B-08, B-12 a B-16):** el listado funciona y rechaza estados inválidos; admisiones no lo lee (403); la alta de familia con tutor y alumno funciona; se rechazan: alumno que ya está en una familia, porcentajes que suman 90, CURP de tutor inválida, correo de otro tutor y alumno de otro campus; archivar exige motivo y dos confirmaciones, lo rechaza admisiones y asistente (403), lo hace el administrador de campus, la reactivación funciona y otra escuela no puede; archivar una familia con saldo da 409; la edición de una familia propia funciona y otro campus, otra escuela y el asistente quedan fuera; el balance rechaza ids ajenos o inválidos; un porcentaje de responsabilidad de 150 se rechaza.
- **Importaciones (B-17, B-18, B-20, B-21, B-23):** las plantillas se descargan y la categoría inexistente da error controlado; la importación incremental de alumnos hace simulacro sin escribir, crea los 14 alumnos, omite el duplicado del mismo archivo y reimportar no duplica; la plantilla oficial sin modificar importa; el asistente recibe 403; adeudos migrados rechaza fecha imposible, monto negativo y monto decimal con mensajes específicos y sin escribir; becas rechaza porcentaje 120 y vigencia invertida; familias y tutores hacen simulacro, crean y rechazan el porcentaje 150.
- **Catálogo y becas (B-27, B-28, B-30 parcial, B-32, B-34 a B-36):** alta de producto con código repetido 409, categoría inválida 400 y precios inválidos rechazados; contador y asistente no leen el catálogo y otra escuela no lo ve; la beca individual asigna, avisa de la solapada, rechaza 101, `monto_fijo`, negativos y texto, y da 404 para un alumno de otro campus; tipos de beca y reglas automáticas rechazan datos inválidos y roles sin permiso; el ciclo "2026" se rechaza.
- **Configuración (B-37, B-42, B-44, B-50, B-51, B-53):** el asistente no escribe la información institucional; los endpoints heredados responden 410; los recargos rechazan cuerpo vacío y asistente; el paso inválido del asistente de configuración da 400; la simulación de cargos la lee el administrador de campus y no el asistente; el calendario rechaza la creación por el auxiliar contable.
- **Aislamiento (B-55):** la escuela B no ve alumnos, conceptos ni productos de la A y no puede editar alumnos, archivar familias ni asignar becas a alumnos de la A.

## Cobertura de la fase sobre las 11 funciones Críticas del área B

| Función | Estado |
|---|---|
| B-14 alta de familia | Probada (rutas feliz y negativas) |
| B-16 archivar y reactivar familia | Probada |
| B-18 importación incremental de alumnos | Probada, con defecto Q-22 (BOM) y Q-23 |
| B-20 importación de adeudos migrados | Solo rechazos; **la ruta feliz (crear cargos migrados) no se probó** |
| B-30 asignación de precios | Probada, con defecto Q-33 |
| B-32 beca individual | Probada |
| B-46 Stripe Connect del campus | **No probada** (depende de Stripe; el webhook no está configurado) |
| B-47 fechas de vencimiento | Probada la configuración, con Q-27; la emisión que las usa (B-49) no |
| B-49 resolutor de fecha al emitir cargos | **No probada** por API; solo la cubren las pruebas unitarias |
| B-50 recargos | Solo validaciones; **no se creó ni aplicó ninguna regla** |
| B-55 aislamiento | Probada |

## Qué no cubre esta fase

- **Interfaz:** todo fue por API. No se llenaron formularios ni se pulsaron botones en el navegador, así que los textos de error, la deshabilitación de botones y los flujos de varios pasos (por ejemplo el asistente de configuración inicial) no se evaluaron.
- **No ejecutadas:** B-07, B-09, B-10, B-11, B-19, B-22, B-24, B-26 (cubierta en la fase 1), B-33, B-38 a B-41, B-45, B-46, B-49, B-54, B-56 y B-58.
- **Positivos de dinero:** no se creó una regla de recargo ni se emitieron cargos mensuales; esos flujos son de la fase 4.
- **`grado` de producción:** véase Q-33.
- **Efecto de las configuraciones:** no se probó que una fecha de vencimiento o una beca configuradas cambien el cargo emitido después; eso se mide en la fase 4.

## Relación con el plan

El plan se actualizó con estos defectos (Q-19 a Q-33), y la memoria del proyecto con el estado de las fases 0 a 3. La base desechable sigue activa para la fase 4, ahora con datos de QA adicionales.
