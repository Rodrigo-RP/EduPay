# Resultados de la fase 4: flujos de dinero

Fecha: 27-nov-2026. Commit `8400ba6`. Entorno: base desechable `edupay_ci` (PostgreSQL 18) y servidor local con `APP_ENV=test`. Producción no se tocó. Se usaron las cuentas de `resultados-fase-1-2026-11-26.md`. Los scripts viven fuera del repositorio.

Entre las fases 3 y 4 el equipo se reinició: Docker Desktop y el servidor de pruebas estaban caídos. Arranqué Docker Desktop (programa local), levanté el contenedor `edupay-pg18` y reconstruí la base desechable desde cero con el seed y las mismas cuentas ficticias. Los datos de QA de las fases 1 a 3 se perdieron; sus resultados quedaron documentados.

## Alcance y método

Área C del inventario (79 funciones, 18 Críticas). Se ejecutaron 33 pruebas por API, con 2FA real, sobre las funciones de dinero que se pueden ejercer sin Stripe ni Facturapi. Cada prueba crea sus propios alumnos y cargos ficticios (los cargos se insertan directo en la base de pruebas para controlar monto, beca, recargo y vencimiento) y afirma el comportamiento diseñado: un fallo es un defecto reproducido o una decisión pendiente.

Correcciones de mi propia lectura durante la fase:
- `generar-mensual` pide el periodo como `YYYY-MM`; con otro formato un validador previo responde 400 antes de revisar permisos, lo que enmascaraba el resultado.
- Las cuotas de un convenio no viven en `payment_plan_installments` (tabla heredada): se generan como cargos nuevos con `plan_id`.
- Cancelar un convenio para "reinstalar" crea un cargo nuevo por el saldo pendiente; no restituye los cargos originales. Así está diseñado y mi primera expectativa era incorrecta.
- Las devoluciones son exclusivas de la administración general por diseño ("Solo la administración general puede devolver saldo a favor"); mi prueba esperaba otra cosa.
- El cierre de caja de hoy persistía entre corridas y dejó pasar vacío el caso de cobros posteriores al cierre; reinicié ese estado.

## Resumen

33 pruebas: 17 pasan y 16 fallan. Las 16 fallas son **12 defectos nuevos (Q-34 a Q-45)**, dos defectos ya conocidos que se reprodujeron otra vez (Q-15 y Q-17, excepciones bancarias) y un caso de observación (Q-41).

## Defectos nuevos reproducidos

| ID | Defecto | Evidencia | Funciones |
|---|---|---|---|
| Q-34 | **La beca se ignora en el pago manual y en el cobro en efectivo.** Un cargo de 1000 con beca del 50% no se liquida pagando el neto de 500: queda en `parcial`. El pago manual aceptó un segundo pago de 500 y cobró 1000 en total. La liquidación con tarjeta sí aplica la beca (`chargeBalance`) | Pago manual: estado `parcial` y 2 pagos por 100000 sobre un neto de 50000. Efectivo: "Pago en efectivo registrado (parcial)" con 50000 | C-10, C-19, C-43 |
| Q-35 | **El cobro en efectivo ignora el recargo.** Con un cargo de 1000 y un recargo de 100, pagar 1000 en efectivo lo deja `pagado` (el pago manual sí lo deja `parcial`) | Efectivo: `pagado`; manual (testigo): `parcial` | C-43 |
| Q-36 | **Cobro en efectivo sin idempotencia.** Dos solicitudes idénticas y simultáneas registran dos pagos (la clave de referencia usa la hora) | 2 pagos de una sola operación | C-43 |
| Q-37 | **`generar-mensual` duplica los cargos al repetir el mismo periodo.** La segunda ejecución de `2026-12` creó otros 48 cargos | Cargos: 112, 160 y 208 | C-07 |
| Q-38 | **`generar-mensual` emite el concepto y el monto de Primaria a todos los alumnos**, también a kinder, secundaria y bachillerato (280000 a todos) | 48 cargos del concepto "Colegiatura Mensual Primaria", incluidos los de otros niveles | C-07 |
| Q-39 | **`charges/generate` no valida permiso de módulo:** el asistente (que solo tiene lectura de cargos) obtiene la vista previa (200) y **crea cargos reales** (201) | Un cargo nuevo del alumno tras la petición del asistente | C-02 (confirma Q-09) |
| Q-40 | **Un cargo vencido con pago parcial no recibe recargo.** Con una regla del 10%, el cargo vencido sin pagos recibió 10000 y el vencido con un pago parcial recibió 0 | Recargo 10000 y 0 | C-13 |
| Q-41 | **Convenios: los cargos originales quedan `cancelado`**, no `reestructurado`, y no se distinguen de una cancelación real; las 3 cuotas nacen sin `ciclo_escolar`. Observación sujeta a decisión de producto | Estado `cancelado` en ambos origen; `con_ciclo: false` | C-32 |
| Q-42 | **Aprobar `delete_charge` sobre un cargo con pagos borra el cargo, sus pagos y sus aplicaciones, y responde "aprobada exitosamente".** Se pierde el historial de cobro | Cargo, pagos y aplicaciones en 0; bitácora `changes_applied` | C-38, C-40 |
| Q-43 | **El cierre de caja acepta una fecha futura** (`2030-01-01` da 201) y el corte no es reversible | HTTP 201 | C-45 |
| Q-44 | **Los cobros posteriores al cierre de caja se aceptan.** Tras cerrar el día, un cobro en efectivo (200) y un pago manual (201) se registran, y el corte deja de cuadrar | 200 y 201 tras el cierre | C-45 |
| Q-45 | **`auto-match` de otro campus de la misma escuela:** un administrador del campus 1 ejecuta el auto-match del campus 2 | HTTP 200 | C-52 |

Se reprodujeron otra vez Q-15 y Q-17: el auxiliar contable (que tiene el enlace "Excepciones bancarias") recibe 403 en la lista y el asistente la lee con 200.

### Sobre Q-34, que es el más importante

- Es el hallazgo #4 de la sección 4.1 del plan (antes "sin reproducir"). **Queda reproducido.** El efecto práctico: un alumno con beca no puede liquidar su cargo pagando lo que le corresponde por caja ni por el pago manual, y por esos canales el sistema permite cobrarle el monto completo. Habría que decidir si la beca se muestra en el cargo pero solo se descuenta por tarjeta.
- **No probé la liquidación con tarjeta** (depende de Stripe). Que la tarjeta sí aplica la beca se afirma por lectura del código (`stripe-card-settlement.ts` usa `chargeBalance`), no por ejecución.
- Impacto en producción: depende de cuántos cargos con `beca_aplicada` mayor que 0 existen. Se mide con una consulta de solo lectura (`SELECT count(*) FROM charges WHERE beca_aplicada > 0`), que no he ejecutado.

## Hallazgos de los agentes refutados

| Hallazgo | Resultado |
|---|---|
| C-H3: un monto no numérico o con tres decimales en el cobro en efectivo responde 500 | **Refutado.** Texto, tres decimales, cero y negativo responden 400 y no registran pagos |
| C-H13(c): una aprobación cuya ejecución falla responde éxito sin avisar | **Confirmado y agravado**: no solo responde éxito, sino que el borrado sí se ejecuta y destruye pagos (Q-42). No se reprodujo el caso de ejecución fallida porque el borrado no falla |

## Funciones que pasan (comportamiento correcto confirmado)

- **Pago manual (C-19):** la misma clave de idempotencia dos veces registra un solo pago; un monto que excede el saldo da 409; cero, negativo, sin clave y clave corta dan 400 sin dejar pagos; el pago exacto liquida; un cargo pagado o cancelado se rechaza (409); el asistente y admisiones reciben 403 y otro campus u otra escuela reciben 404.
- **Efectivo (C-43):** el pago parcial deja el cargo en `parcial`; el excedente se registra como saldo a favor (20000 centavos de 200 pesos); los montos inválidos se rechazan con 400; el asistente y admisiones reciben 403; un alumno de otro campus o escuela no se cobra; sin cargos pendientes no hay error de servidor.
- **Emisión:** la vista previa de `charges/generate` no escribe; `generar-mensual` rechaza al asistente (403) con un periodo válido.
- **Recargos (C-13):** una regla del 10% se aplica a un cargo vencido (10000 sobre 100000), repetir el mismo mes no acumula, y el asistente recibe 403.
- **Convenios (C-32, C-35):** se rechazan 2 y 13 cuotas, el modo mixto, la fecha imposible, al asistente y a otra escuela; las 3 cuotas suman el saldo original (120000); cancelar exige motivo de al menos 10 caracteres, destino y motivo de condonación; otro campus no puede cancelar; "reinstalar" crea un cargo nuevo con todo el saldo; un plan ya cancelado da 409; la **segunda condonación dentro de 90 días se frena** y pide autorización de la administración general.
- **Aprobaciones (C-38, C-40):** solo la administración general decide (AC, CG y AX reciben 403); aprobar un cambio de monto lo ejecuta; otra escuela no puede decidir.
- **Cierre de caja (C-45):** el asistente y admisiones reciben 403; la fecha imposible y el efectivo negativo dan 400; un segundo cierre del mismo día da 409.
- **Devoluciones:** solo la administración general las lista (200); AC, CG, AX, AS y AD reciben 403; otra escuela no ve los saldos de la escuela A.
- **Conciliación:** el asistente y admisiones no ejecutan la conciliación (403); la otra escuela no puede hacer auto-match sobre el campus 1.
- **Tutor y terceros:** `guardian/pagar` rechaza sin cargos (400), con identificadores inválidos (400), sin método de pago (422) y con cargos de otro alumno (403); con un cargo propio y sin cuenta de Stripe responde 422 y no registra pagos; el timbrado rechaza al asistente (403) y sin pagos seleccionados responde 400; el webhook de Stripe sin secreto responde 503.

## Cobertura de la fase sobre las 18 funciones Críticas del área C

| Función | Estado |
|---|---|
| C-02 emisión por nivel (vista previa y real) | Probada, con Q-39 |
| C-07 cargos mensuales | Probada, con Q-37 y Q-38 |
| C-10 beca y recargo por canal de cobro | Probada, con Q-34 y Q-35 |
| C-13 recargos por mora | Probada, con Q-40 |
| C-19 pago manual | Probada |
| C-32 convenio (modo A) | Probada, con Q-41 |
| C-35 cancelar y condonar | Probada (condonación repetida frenada) |
| C-38 y C-40 aprobaciones y ejecución | Probadas, con Q-14 (fase 1) y Q-42 |
| C-43 cobro en efectivo | Probada, con Q-34, Q-35 y Q-36 |
| C-45 cierre de caja | Probada, con Q-43 y Q-44 |
| C-51 conciliación automática | **Solo permisos**: no se importaron movimientos bancarios ni se ejecutó el FIFO |
| C-52 auto-match por campus | Probada solo en alcance, con Q-45 |
| C-59 webhook de Stripe | **Solo el rechazo sin secreto** (503) |
| C-60 y C-61 pago con tarjeta y SPEI del tutor | **Solo validaciones previas a Stripe** |
| C-71 confirmar devolución con TOTP | **Solo permisos**: el flujo completo lo cubre `e2e/40-devoluciones` (pasó en la fase 0) |
| C-74 timbrado masivo | **Solo permisos y validación**: sin Facturapi no se timbró nada |

## Qué no cubre esta fase

- **Dependen de terceros y no se probaron de punta a punta:** SPEI, devoluciones por Stripe, cobros por revisar, confirmaciones asíncronas, regenerar y cancelar CFDI, registro de CSD.
- **Conciliación bancaria:** no se importaron estados de cuenta ni se ejecutó la conciliación automática, la cola de revisión ni la bandeja de excepciones con datos.
- **Saldo a favor y devoluciones:** el flujo completo lo cubren `e2e/36-saldo-a-favor` y `e2e/40-devoluciones`, que pasaron en la fase 0; aquí solo se probaron permisos y aislamiento.
- **Convenios modo B (futuro), reportes de caja, dashboard de caja y planes con pago inicial:** no se ejercieron.
- **Dos hallazgos de agentes no se intentaron:** el re-timbrado de CFDI (`timbrar-lote`) y la liquidación parcial de pagos con varios cargos por tarjeta, porque requieren el tercero.
- **Interfaz:** todo fue por API. No se evaluaron pantallas, mensajes ni flujos de varios pasos.
- **Volumen y concurrencia:** salvo el doble envío simultáneo de efectivo, no se probó concurrencia de pagos.

## Relación con el plan

El plan se actualizó con Q-34 a Q-45, y la memoria con el estado de las fases 0 a 4. El hallazgo #4 de la sección 4.1 ("beca ignorada en pago manual y efectivo") pasa de "sin reproducir" a "reproducido".
