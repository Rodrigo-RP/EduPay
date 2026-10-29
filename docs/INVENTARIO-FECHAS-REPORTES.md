# Inventario de fechas exportadas

Este inventario corrige el reporte anterior: **`payments.fecha_pago` es un día
de negocio escolar, no un instante UTC**, aunque su tipo físico sea
`timestamp without time zone`.

Las inserciones de pagos usan `SCHOOL_TODAY_SQL`: el día escolar se guarda a
medianoche. Aplicar `schoolDateSQL` a ese valor vuelve a convertir un día ya
resuelto y puede mostrar el día anterior. Por eso Financiero exporta
`p.fecha_pago::date`, sin conversión de zona.

| Reporte / archivo en `server/routes/` | Columna exportada | Origen y tipo físico | Semántica y tratamiento |
|---|---|---|---|
| Cobranza / `reportes-cobranza.ts` | `fecha_emision` | `charges.fecha_emision`, `date` | Día de calendario; sin conversión |
| Cobranza / `reportes-cobranza.ts` | `fecha_vencimiento` | `charges.fecha_vencimiento`, `date` | Día de calendario; sin conversión |
| Antigüedad / `reportes-antiguedad-saldos.ts` | `fecha_vencimiento` | `charges.fecha_vencimiento`, `date` | Día de calendario; sin conversión |
| Admisiones / `reportes-admisiones.ts` | `fecha_registro` | `students.created_at`, `timestamp without time zone` | Instante UTC histórico; `schoolDateSQL` antes de exportar |
| Financiero / `reportes-financiero.ts` | `fecha_pago` | `payments.fecha_pago`, `timestamp without time zone` | **Día escolar a medianoche**; `::date` sin desplazar el día |
| Contable / `reportes-contable.ts` | `mes` | Derivado de `payments.created_at`, `timestamp without time zone` | Primero convierte el instante UTC con `schoolDateSQL`; luego agrupa por mes. El resultado representa el primer día de ese mes escolar |

El tipo físico por sí solo no define la semántica: `fecha_pago` y `created_at`
no son intercambiables. Los objetos `Date` que devuelve el controlador para
fechas y timestamps sin zona se formatean con sus getters locales para conservar
el calendario recibido. Los instantes deben resolverse en SQL antes de llegar
a esa representación.

La prueba `server/tests/reportes-financiero-fecha-pago.test.ts` inserta un pago
con `SCHOOL_TODAY_SQL`, ejecuta el manejador real del reporte y comprueba la
celda de fecha del Excel. Sus fixtures viven en una sola transacción que se
revierte con `ROLLBACK`, sin dejar pagos ni expedientes persistidos.
