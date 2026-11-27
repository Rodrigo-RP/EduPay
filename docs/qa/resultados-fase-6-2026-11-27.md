# Resultados de la fase 6: reportes, dashboards, notificaciones, asistente y búsqueda

Fecha: 27-nov-2026. Commit `8400ba6`. Entorno: base desechable `edupay_ci` (PostgreSQL 18) y servidor local con `APP_ENV=test`, las cuentas de `resultados-fase-1-2026-11-26.md` y la base reconstruida de `resultados-fase-4-2026-11-27.md`, que a esta altura contiene los datos de QA de las fases 3 a 5 (117 alumnos y más de 800 cargos en el campus 1). Producción no se tocó. Los scripts viven fuera del repositorio.

## Alcance y método

Funciones D-17 a D-65 del inventario D que se pueden ejercer sin Claude ni proveedor de correo. Se ejecutaron 44 pruebas por API:

- **Cifras:** se calculó en la base el saldo pendiente por cargo (monto base menos beca, más recargo, menos lo aplicado, para cargos no pagados, cancelados ni reestructurados) y se comparó con lo que reporta cada pantalla.
- **Consistencia:** se compararon entre sí las cifras que deberían ser iguales en distintos reportes.
- **Roles y exportaciones:** los 8 reportes con 6 roles, lectura y exportación a Excel y PDF; se abrieron los archivos para validar su estructura y contenido.
- **Casos controlados:** un alumno con 2 tutores, historial de pagos y un cargo vencido conocido, para aislar un problema de cálculo.

Limitaciones de entorno:
- El servidor de pruebas no tiene proveedor de correo (`configured:false`) ni clave de Claude. La vista previa y confirmación de lotes de correo (D-45) y el chat real del asistente no se ejercitaron; las pruebas automatizadas de correo (172) pasaron en la fase 0.
- La base tiene una distribución distinta a la de producción (ciclos, becas y recargos de prueba); los totales sirven para comparar entre reportes y contra la base, no como cifras esperadas del negocio.

## Resumen

44 pruebas: 33 pasan y 11 fallan. Las 11 fallas son **10 defectos nuevos (Q-53 a Q-62)** y Q-10 (asistente consulta módulos), que se reprodujo otra vez. La corrida también **refutó** el riesgo de inyección de fórmulas en los Excel.

## Defectos nuevos reproducidos

| ID | Defecto | Evidencia | Funciones |
|---|---|---|---|
| Q-53 | **Los reportes no coinciden en la cartera pendiente.** Cuatro pantallas que muestran el mismo concepto dan cuatro cifras: antigüedad de saldos 194,132,380, contador 193,539,380, dashboard 195,629,380 y consejo 202,387,380 (centavos). Solo la antigüedad coincide exactamente con la base (194,132,380, neto de beca, todos los ciclos) | 4 valores distintos | D-18, D-21, D-34, D-38 |
| Q-54 | **El reporte de riesgo y el semáforo inflan el adeudo.** El reporte de riesgo suma 2,683,021,590 contra 194,132,380 de la antigüedad (13.8 veces). En un caso controlado (alumno con 2 tutores, 3 pagos históricos y un cargo vencido de 1000 pesos), el semáforo muestra un adeudo de 24,000 y el reporte de riesgo de 12,000: el cálculo multiplica filas al unir cargos, pagos y tutores | Semáforo 2,400,000 y reporte 1,200,000 contra 100,000 real | D-24, D-40 |
| Q-55 | **El semáforo y el reporte de riesgo ignoran los cargos vencidos con pago parcial.** Un alumno con 70,000 centavos vencidos y un pago parcial aparece con adeudo 0, score 100 y semáforo verde, "Excelente historial" | adeudo 0 y verde | D-24, D-40 |
| Q-56 | **El "vencido" es distinto en cada reporte.** Base: 5,493,000. Dashboard administrativo: 1,820,000. Consejo: 80,954,952 (14.7 veces la base) | 3 cifras distintas | D-18, D-34 |
| Q-57 | **Conteos del dashboard administrativo que no cuadran:** "alumnos activos" muestra 105 y la base tiene 117 activos en el campus; "alumnos con adeudo" muestra 3 y la base tiene 103 alumnos con saldo pendiente en el ciclo (el 3 podría ser un conteo de vencidos, no verificado) | 105 contra 117; 3 contra 103 | D-18 |
| Q-58 | **Admisiones exporta reportes que no puede consultar, y trae datos reales.** El reporte de consejo, el contable y el de riesgo dan 403 en consulta, pero la exportación a Excel responde 200 con 36, 13 y 17 filas. Al revés, administración general y contador exportan el de admisiones aunque no pueden consultarlo | consulta 403 y exportación 200 con filas | D-33, D-35, D-37, D-41 |
| Q-59 | **La bitácora de una solicitud de aprobación se puede leer desde otra escuela:** `GET /api/approvals/logs/:id` responde 200 al administrador de campus de la otra escuela | HTTP 200 | D-50 |
| Q-60 | **Cualquier usuario puede marcar como leída la notificación de otra persona.** El asistente marcó la notificación del administrador de campus (200) y quedó `is_read = true` | HTTP 200 y fila modificada | D-51 |
| Q-61 | **La búsqueda global responde 500 si la consulta trae un byte nulo (`%00`)**; y los comodines `%` y `_` no se escapan: `%%%` o `___` devuelven alumnos sin que coincida ningún nombre (con límite de 10, y siempre dentro del campus propio) | 500; 10 resultados | D-62 |
| Q-62 | **La ruta pública `/cuentas` sirve cifras inventadas sin sesión:** "$42,000" y "73.2%" con el nombre de una escuela, en un producto multi-escuela | HTML con esas cifras | D-64 |

Q-10 se reprodujo otra vez: el asistente consulta `/api/assistant/modules` con 200.

### Sobre Q-53 a Q-57: cómo interpretarlos

- No sé cuál debería ser la definición correcta de cada indicador, solo que **deben coincidir entre pantallas** y, cuando una es verificable contra la base, coincidir con ella. La antigüedad de saldos es la única que cuadra exactamente con mi cálculo; que las otras difieran puede deberse a filtros distintos (ciclo, mes, fecha de corte). Aun así, el consejo y el reporte de riesgo muestran cifras de un orden de magnitud distinto, lo que sugiere un error de cálculo y no una diferencia de definición.
- Q-54 y Q-55 son los más serios porque el semáforo y el reporte de riesgo son los que usaría el área de cobranza para decidir a quién contactar: hoy mostrarían a un deudor real como "verde" y a otro con deuda normal como "rojo" con la deuda multiplicada.

## Hallazgos de los agentes refutados o reducidos

| Hallazgo | Resultado |
|---|---|
| Excel sin neutralización de fórmulas (D-42) | **Refutado en lo esencial.** Un nombre que empieza con `=HYPERLINK(...)` se guarda como celda de texto, no como fórmula: 0 celdas con fórmula en el archivo. Excel no lo evalúa. El riesgo sería solo de un CSV, que estos reportes no generan |
| Lectura de reportes por rol (H-D09, parte de consulta) | **Coincide con el diseño.** Los 8 reportes responden 200 solo a los roles con permiso (consejo: AG, AC y CG; contable: AG, AC, CG y AX; riesgo: AG, AC, CG y AX; admisiones: AC, AD y AS). Lo que no coincide es la exportación (Q-58) |
| `REPORTS.read` universal (H-D09) | **Confirmado como diseño actual:** financiero, estudiantes, cobranza y antigüedad los leen los 6 roles, incluidos asistente y admisiones. Sigue pendiente la decisión de producto |
| Aprobaciones visibles para cualquier rol (fase 2) | **Refutado en parte:** una solicitud pendiente la ven solo el aprobador y el solicitante; contador, auxiliar, admisiones, asistente y la otra escuela no la ven en `pending`, `history` ni `my-requests`. Lo que falla es la bitácora (Q-59) y la lectura de notificaciones (Q-60) |
| POST `/api/notifications/send` heredado (D-47) | Sin proveedor responde 503 `EMAIL_NO_CONFIGURADO`, que es razonable; no 410 |

## Funciones que pasan (comportamiento correcto confirmado)

- **Reportes:** los 8 reportes responden solo a los roles con permiso; exportan a Excel (zip válido) y a PDF (empieza con `%PDF`) y rechazan formatos no admitidos con 400; el auxiliar contable y el asistente no pueden exportar (403); el Excel de cobranza trae tantas filas como cargos reporta la pantalla.
- **Aislamiento:** el reporte de estudiantes da totales distintos para el campus 1, el campus 2 y la otra escuela, y cada uno coincide con la base; el Excel de la otra escuela no trae alumnos de la escuela A aunque se envíe `campus_id`.
- **Dashboard administrativo (D-18):** los filtros con SQL, ciclo inválido y periodos inventados no producen error de servidor; admisiones recibe 403 y el asistente 200; un nivel no puede exceder el total.
- **Búsqueda (D-62):** un alumno propio aparece, el del otro campus y el de otra escuela no; las consultas de 2 caracteres dan vacío; no hay inyección con comillas ni etiquetas.
- **Asistente:** un mensaje vacío o de más de 500 caracteres da 400 y sin sesión 401; sin clave de Claude responde de forma degradada sin error de servidor; pedir datos de otro campus o escuela se rechaza.
- **Acciones de seguimiento:** solo administrador de campus, general y contador la leen; admisiones, asistente y auxiliar reciben 403; una acción inexistente da 4xx.
- **Notificaciones:** la configuración la leen administrador de campus, general, contador y auxiliar (200), y admisiones y asistente reciben 403; sin proveedor la vista previa se rechaza sin crear intenciones y el contador y el asistente no pueden prepararla; el lote con id que no es UUID da 422; el webhook de Resend sin firma se rechaza.
- **Aprobaciones:** la visibilidad de las solicitudes es correcta (sección de refutados).

## Cobertura de la fase

| Función | Estado |
|---|---|
| D-18 dashboard administrativo (Crítica) | Probada, con Q-53, Q-56 y Q-57 |
| D-24 semáforo, D-40 riesgo | Probadas, con Q-54 y Q-55 |
| D-26 a D-41 reportes y exportaciones | Probados, con Q-58 |
| D-42, D-43 motor de exportación y aislamiento | Probados |
| D-44 a D-49 notificaciones | **Parcial.** Sin proveedor no se ejercitó la vista previa, la confirmación ni el reenvío. D-45 (Crítica) se apoya en las 172 pruebas automáticas de correo de la fase 0 |
| D-50, D-51 aprobaciones | Probadas, con Q-59 y Q-60 |
| D-53 a D-55 acciones | **Parcial:** permisos y rechazo de una acción inexistente; no se creó ninguna acción ni se asignó una real |
| D-56 a D-60 asistente | **Parcial.** Sin clave de Claude no se probó el contenido de las respuestas, las sugerencias de beca ni la exportación por intención; D-60 (Crítica) solo se verificó con las consultas de otro campus y escuela |
| D-62 búsqueda, D-64 ruta pública | Probadas, con Q-61 y Q-62 |
| D-17, D-19 a D-23, D-25 | Dashboards por rol y hub de reportes: **cubiertos en la fase 2** (carga y errores de red), no en cifras |
| D-61 widget del asistente, D-65 límites de tasa | **No ejercitados** (el widget lo cubre `e2e/21`, que pasó en la fase 0) |

## Qué no cubre esta fase

- **Cifras del negocio:** no sé cuál es la definición correcta de cada indicador. Las comparaciones son contra mi cálculo en la base y entre reportes.
- **Datos reales:** los datos son ficticios. En producción el comportamiento de Q-54 (que depende de cuántos tutores y pagos tiene cada alumno) puede ser más o menos grave.
- **Interfaz:** no se revisó cómo se ven los reportes, los gráficos, la paginación ni los filtros en pantalla; solo lo que devuelve el servidor y los archivos exportados.
- **Contenido visual de los PDF:** solo se validó que empiecen con `%PDF`; no se revisaron columnas, totales ni formato.
- **Rendimiento:** no se midió el tiempo de los reportes con volúmenes grandes.
- **Correo y asistente con servicios reales.**

## Relación con el plan

El plan se actualizó con Q-53 a Q-62, y la memoria con el estado de las fases 0 a 6. Quedan por hacer la fase 7 (humo de solo lectura en producción, que requiere autorización) y, si se quiere, repetir las fases con las correcciones aplicadas.
