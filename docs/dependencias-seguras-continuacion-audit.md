# npm audit final: continuación de dependencias seguras

Fecha de consulta: 29 de octubre de 2026, aproximadamente 13:32 UTC. Comando: npm audit --json. Salida 1 porque hay vulnerabilidades pendientes. No se ejecutó --force.

Resultado: **24 paquetes: 0 críticos, 7 altos, 11 moderados y 6 bajos**. El cierre anterior de esta rama registraba 54 (3 críticos, 24 altos, 18 moderados y 9 bajos); son 30 paquetes menos y cero críticos en esta fuente.

Se aplicaron las correcciones con --legacy-peer-deps y un corte conservador de antigüedad --before=2026-10-15T00:00:00Z. La condición de 14 días de la instrucción original se conserva: no se incorporan versiones publicadas después de ese corte. Las fechas que siguen proceden de npm view <paquete> time --json.

| Paquete | Severidad | Tipo | Ámbito según lockfile | Justificación pendiente |
|---|---|---|---|---|
| @esbuild-kit/core-utils | moderate | Transitiva | Desarrollo | Heredado de drizzle-kit 0.30; npm ofrece cambiar el rango/línea del kit, fuera de los tres cambios autorizados del manifiesto. |
| @esbuild-kit/esm-loader | moderate | Transitiva | Desarrollo | Heredado del kit y core-utils; misma restricción que drizzle-kit. |
| @sendgrid/client | low | Transitiva | Producción | Propaga el hallazgo de helpers/deepmerge; el árbol compatible de @sendgrid/mail 8 lo conserva. |
| @sendgrid/helpers | low | Transitiva | Producción | Depende de deepmerge afectado; npm propone @sendgrid/mail 6.5.2, cambio mayor hacia atrás no autorizado. |
| @sendgrid/mail | low | Directa | Producción | Propaga los hallazgos de client/helpers. No se acepta el cambio a la versión mayor 6 que ofrece npm. |
| @tailwindcss/typography | moderate | Directa | Desarrollo | Hereda postcss-selector-parser. La corrección 6.1.5 se publicó 2026-10-19T15:02:08.894Z: no cumple 14 días. |
| @vitest/coverage-v8 | moderate | Directa | Desarrollo | La corrección compatible 4.1.12 se publicó 2026-10-15T14:39:54.281Z; al ejecutar estas verificaciones aún no cumplía 14 días. |
| @vitest/mocker | moderate | Transitiva | Desarrollo | La corrección 4.1.12 se publicó 2026-10-15T14:40:12.730Z; aún no cumplía 14 días. |
| body-parser | high | Transitiva | Producción | La corrección 1.20.9 se publicó 2026-10-22T11:38:27.889Z; no cumple 14 días. |
| cookie | low | Transitiva | Producción | Heredado de csurf. Su rango no admite cookie 0.7; npm ofrece cambiar csurf hacia atrás. No se fuerza ni se agrega override. |
| csurf | low | Directa | Producción | Propaga cookie. Paquete archivado; sustituir la protección CSRF sería un cambio funcional fuera de esta tarea. |
| deepmerge | low | Transitiva | Producción | El árbol de SendGrid conserva esta dependencia; npm no ofrece una corrección compatible del padre, sino cambiar @sendgrid/mail de versión mayor. |
| drizzle-kit | moderate | Directa | Desarrollo | npm ofrece 0.31.11 fuera del rango actual ^0.30.4; el manifiesto solo puede cambiar en tipos de Node y los dos paquetes PDF. No se modifica ese rango. |
| drizzle-orm | high | Directa | Producción | La corrección requiere salir de 0.39; está expresamente prohibido. Se conserva 0.39.3 y el análisis de exposición en docs/dependencias-seguras-riesgo.md. |
| esbuild | moderate | Transitiva | Desarrollo | Quedan copias transitivas antiguas del kit y de Vite 5. El esbuild directo sí subió dentro de 0.25. Corregir los padres exige otros rangos/líneas no autorizados. |
| exceljs | moderate | Directa | Producción | Heredado de uuid. npm ofrece ExcelJS 3.4.0 frente al 4 actual: cambio mayor hacia atrás, no autorizado. |
| multer | high | Directa | Producción | La corrección 2.5.0 se publicó 2026-10-22T11:58:46.216Z; no cumple 14 días. |
| node-forge | high | Directa | Producción | La corrección 1.4.1 se publicó 2026-10-27T04:44:07.718Z; no cumple 14 días. |
| postcss-selector-parser | moderate | Transitiva | Producción | La corrección 6.1.5 se publicó 2026-10-19T15:02:08.894Z; no cumple 14 días. |
| uuid | moderate | Transitiva | Producción | ExcelJS conserva uuid 8.3.2; la corrección sugerida por el escáner cambia de versión mayor y no cabe en el rango del padre. |
| vite | high | Directa | Desarrollo | Los avisos residuales de Vite 5 y su esbuild requieren otra línea de Vite; Vite 6 o superior en la app sigue prohibido. No confundir con el Vite 8 interno de Vitest. |
| vitest | moderate | Directa | Desarrollo | La corrección compatible 4.1.12 se publicó 2026-10-15T14:51:24.991Z; aún no cumplía 14 días. |
| zod | high | Directa | Producción | npm propone Zod 4; está prohibido. Se mantiene 3.25.76 y el análisis de exposición existente, sin afirmar que los límites HTTP eliminan el riesgo. |
| zod-validation-error | high | Directa | Producción | Hereda Zod. npm propone versión 5; está prohibida. Se mantiene 3.5.4. |

## Alcance de estas justificaciones

Una vulnerabilidad pendiente no se considera segura ni no explotable por quedar documentada. No se usaron --force, overrides, cambio de Node ni supresiones. Los avisos heredados se cuentan como paquetes afectados por npm, no como vulnerabilidades independientes nuevas.

Los 25 registros de Replit tienen otra granularidad y fuente. Incluyen dos alertas de SheetJS cuyo rango es incorrecto para el tarball oficial 0.20.3; la evidencia oficial y los conteos sin descontar están en docs/dependencias-seguras-continuacion-escaneo.md.

Las horas de publicación de Vitest son importantes: el día 15 a las 14:51 UTC todavía no llevaba 14 días al correr estas pruebas el día 29 antes de las 14:51 UTC. No se cambió el criterio de antigüedad para alcanzar cero avisos.
