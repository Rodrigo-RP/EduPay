# Fecha local de la escuela

Base del barrido: `35a2b93`. Las líneas de esta tabla corresponden a esa base,
antes de agregar imports o sustituir expresiones. Zona de negocio:
`shared/school-date.ts`. No se convierten columnas `date` como si fueran
instantes: una fecha de vencimiento, un período o una fecha ingresada ya son
fechas de calendario. Los timestamps sin zona de este esquema guardan UTC.

## Barrido de servidor y cliente

| Archivo y líneas en la base | Qué calcula | ¿Afecta dinero? / tratamiento |
|---|---|---|
| server/routes/conciliacion.ts:605,763,878,922,1178,1803 | Mora, fecha de pago, efectivo diario, depósitos, cierre y antigüedad bancaria | Sí; hoy y día de timestamps locales |
| server/routes/conciliacion.ts:556 | Cobrado del mes | Sí; mes local |
| server/routes/conciliacion.ts:13-22 | Hoy ya local, con zona duplicada | Sí; centralizar |
| server/routes/conciliacion.ts:27,1086,1119,1193,1221 | Validación/serialización de fechas y claves de cierre | Son fechas de calendario, no instantes UTC; preservar |
| server/routes/misc.ts:53,55,692,912,946,1309 | Cuotas, cargos, mora, cobro mensual y pagos del día | Sí; hoy y cortes locales; cuotas calculadas desde fecha explícita |
| server/routes/charges.ts:95,201,222,291,365,460,615 | Emisión, período, extraordinarios, vencidos y pago manual | Sí; calendario local |
| server/routes/charges.ts:244,320,462-463 | Año/ciclo de emisión | Sí; año y mes locales |
| server/lib/stripe-card-settlement.ts:92 | Fecha del pago confirmado | Sí; fecha local |
| server/lib/stripe-spei-settlement.ts:130 | Fecha de liquidación SPEI | Sí; fecha local |
| server/routes/guardian.ts:413,761,854 | Intent SPEI, emisión y ciclo de inscripción | Sí; calendario local |
| server/routes/payments.ts:679 | Inicio predeterminado de beca importada | Sí; hoy local |
| server/routes/payments.ts:673,675,684,873,875 | Seriales Excel y aritmética sobre fechas ingresadas | Sí, pero son fechas de calendario; no desplazar por zona |
| server/routes/payments.ts:469 | Nombre de plantilla CSV | No; sólo nombre de descarga |
| server/storage.ts:841 | Conteo de cargos vencidos | Sí; hoy local en Drizzle |
| server/assistant-actions.ts:103-104,111-112,197-198,416,419,692-693,881,1272,1277 | Becas vigentes, vencimientos, mora y condonación | Sí; hoy local |
| server/assistant-actions.ts:361-362,374-375,403-404,431-432,443-444,451-452,862,868-869,880,1280 | Rangos explícitos y fecha final derivada | Fechas de calendario; preservar sus casts/serialización |
| server/routes/assistant.ts:93-94 | Vigencia de becas | Sí; hoy local |
| server/lib/email/pg-repository.ts:23-24 | Elegibilidad de mora y recordatorio | Sí; hoy local; no activa envíos |
| server/lib/scholarship-engine.ts:40-43,81 | Ciclo vigente y fecha de resolución | Sí; calendario local |
| server/lib/scholarship-engine.ts:94-95,183-184,202-203,294,308 | Fechas explícitas de vigencia/emisión | Calendario, no timestamps; preservar |
| server/lib/surcharge-accrual.ts:50-55,339,358 | Fecha de cálculo y vencidos para recargos | Sí; fecha actual local; preservar fechas explícitas |
| server/lib/narrative-insights.ts:137,183-184,272,279 | Mora y alertas financieras | Sí; hoy local |
| server/routes/admin.ts:222-243,301,551-552,564,1499,1558 | Períodos, riesgo, becas y vigencia | Sí; calendario local |
| server/routes/admin.ts:110,114,1507 | Serialización de fechas de BD y fin de vigencia ingresada | Fechas de calendario; preservar |
| server/routes/reportes-consejo.ts:66-67,81-82,222-223,232-233 | Filtros por día de pagos y cargos | Sí; convertir timestamps UTC |
| server/routes/reportes-consejo.ts:95-102,119-140,204-205,259 | Mes anterior, tendencia, vigencia y mora | Sí; cortes locales; aritmética sobre fecha explícita se conserva |
| server/routes/reportes-riesgo.ts:129-130 | Días vencidos | Sí; hoy local |
| server/routes/reportes-antiguedad-saldos.ts:136,146-150 | Buckets de antigüedad | Sí; hoy local |
| server/routes/reportes-cobranza.ts:138,140 | Días de vencimiento | Sí; hoy local |
| server/routes/reportes-financiero.ts:188,267-270 | Vencidos y comparación mensual | Sí; cortes locales |
| server/routes/reportes-contable.ts:65 | Pagos del mes | Sí; mes del timestamp local |
| server/routes/reportes-admisiones.ts:74-75,109-110,262-263 | Filtro por día de alta que segmenta becas/ingresos | Sí; timestamps locales |
| server/routes/acciones.ts:199,233,245 | Bimestre de cobranza y fecha de acción | Sí; límites locales; preservar fechas sin hora |
| server/routes/fiscal.ts:795-796 | Vigencia con fechas provistas | Calendario explícito; no es hoy UTC |
| server/notification-system.ts:37,72 | Vencimiento de credenciales | No es cálculo de dinero; no cambiar |
| server/seed-demo.ts:45; server/seed-super-admin.ts:105 | Fecha en fixtures/alta de usuario | Sólo scripts de datos; no se ejecutan ni cambian |
| client/src/pages/caja-conciliacion.tsx:75,196,1466 | Día consultado para efectivo/cierre | Sí; ya local, centralizar zona |
| client/src/pages/caja-conciliacion.tsx:795 | Hora de pago en pantalla | Sí; zona local explícita |
| client/src/pages/cargos.tsx:72,220 | Emisión predeterminada | Sí; hoy local |
| client/src/pages/cargos.tsx:163 | Nombre de exportación | No; sólo descarga |
| client/src/pages/emision-cargos.tsx:416 | Fecha predeterminada de emisión | Sí; hoy local |
| client/src/pages/planes-pago.tsx:55,64 | Inicio predeterminado del plan | Sí; hoy local |
| client/src/pages/asignacion-precios.tsx:51-53 | Vencimiento extraordinario predeterminado a 30 días | Sí; derivar del día local |
| client/src/pages/becas.tsx:279-287 | Vigencia predeterminada de beca | Sí; partir del calendario local |
| client/src/pages/becas.tsx:823 | Nombre del reporte | No; sólo descarga |
| client/src/pages/fiscal-contable.tsx:428,533 | Mes del filtro y día de registro | Sí; mes/día locales |
| client/src/pages/dashboard-admisiones.tsx:89-91,532 | Cobro del mes y día de pago mostrado | Sí; mes/día locales |
| client/src/pages/dashboard-admisiones.tsx:68 | Altas en ventana móvil de 30×24 horas | No es día calendario ni UTC truncado; preservar |
| client/src/pages/portal-padres-3clics.tsx:845; client/src/pages/pagos.tsx:257 | Día de pago mostrado | Sí; distinguir fecha de calendario de timestamp |
| client/src/pages/historial.tsx:91,250 | Día/filtro y fecha de actividad | No mueve dinero; calendario local del filtro |
| client/src/pages/familias.tsx:997,1279 | Fecha de registro y nombre de descarga | No; fuera del cálculo financiero |
| client/src/pages/estudiantes.tsx:801,846; client/src/components/data-validation-report.tsx:156; client/src/pages/reportes-admisiones.tsx:149,157 | Nombres de descargas | No |
| client/src/pages/cuentas-por-cobrar.tsx:1061,1689,1783 | Fecha/hora de actividad de cobranza | Presentación; zona de escuela |
| client/src/pages/aprobaciones.tsx:466,554,639,719,927; client/src/pages/demo-aprobaciones.tsx:334,417 | Fecha presentada por helper de actividad | No calcula hoy ni día UTC de un cargo/pago |

Los comentarios de reportes que describen los mismos SQL no son consultas
adicionales. Los tests conservan sus relojes/fixtures propios; no sustituyen las
reglas de producción. Los instantes de auditoría, expiración y firmas siguen
siendo instantes UTC: no se cambia `created_at`, `NOW()` de persistencia ni TTL.
