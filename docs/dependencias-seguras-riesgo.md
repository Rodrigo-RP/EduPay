# Dependencias protegidas: análisis sin actualización mayor

Se conservan exactamente drizzle-orm 0.39.1, zod 3.25.76 y zod-validation-error 3.4.0. No se modificaron sus versiones ni reglas de negocio.

## Drizzle: identificadores SQL

El aviso [GHSA-gpj5-g38j-94v9](https://github.com/advisories/GHSA-gpj5-g38j-94v9) afecta a identificadores y alias construidos con entradas no confiables, no a todo valor parametrizado. La corrección está en 0.45.2; el salto desde 0.39 no está autorizado.

En las rutas revisadas no se identificó una entrada del usuario pasada directamente a `sql.identifier()` o a un alias de Drizzle:

- `server/storage.ts:355,477,507,638,805`: ordenación con columnas del esquema, no con nombres suministrados por el cliente.
- `server/storage.ts:841`: `sql.raw(SCHOOL_TODAY_SQL)` utiliza la constante del servidor, no texto del usuario.
- `server/routes/notifications.ts:371-401`: tabla y columna interpoladas proceden del mapa fijo `SPEC`; una acción desconocida se rechaza antes de consultar. El identificador de entidad y el aislamiento se parametrizan.
- `server/lib/family-service.ts:96-102,326-340`: los nombres de columna de la actualización proceden de `guardianFields`, una lista fija; los valores usan parámetros.

Esto reduce la exposición de esas rutas, pero NO demuestra la ausencia de todo posible flujo de identificadores en el proyecto ni elimina la vulnerabilidad de la dependencia. Recomendación: conservar el mapeo estricto de identificadores y preparar, en un trabajo autorizado aparte, la actualización de Drizzle con pruebas de SQL y migraciones. No se ejecutó un ataque contra la base.

## Zod: los límites HTTP no bastan

El aviso [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) describe acumulación de errores por elemento y agotamiento de memoria al validar colecciones.

- `server/index.ts:31-32`: JSON y formularios admiten hasta 10 MB.
- `server/routes/shared.ts:36-43`: archivos multipart de hasta 10 MB.
- `server/routes/admin.ts:62,77`: arrays con máximo de 20 conceptos y 30 criterios.
- `server/routes/admin.ts:1895-1899,1981-1989`: estos esquemas validan el cuerpo de rutas autenticadas.
- `server/lib/email/service.ts:12,34`: array de hasta 5,000 estudiantes, validado mediante Zod.

La autenticación y los límites de bytes reducen exposición, pero no prueban que se evite trabajo excesivo antes de devolver 400. Una prueba aislada, sin servidor, red ni base, ejecutó:

```js
const input = Array(10000).fill(null);
const result = z.array(z.string()).max(20).safeParse(input);
```

Resultado: cuerpo JSON de 50,001 bytes, muy inferior a 10 MB; validación rechazada, pero produjo 10,001 errores. Por tanto, `.max()` y el límite actual de bytes NO impiden recorrer una colección grande y acumular errores.

No se intentó agotar memoria ni se enviaron cargas abusivas a la app. No se cuantificó el umbral de caída.

Recomendación: autorizar un endurecimiento separado que limite cardinalidad antes de Zod y ajuste límites por ruta; planificar después la actualización mayor de Zod con pruebas de esquemas. No se considera mitigado el aviso solo por existir el límite de 10 MB.

## zod-validation-error

El audit lo marca por su dependencia de Zod. No se actualizó a 5 ni se afirma que formatear el error resuelva la acumulación previa. Debe revisarse junto con la futura actualización de Zod; ocultar el aviso no corrige su causa.
