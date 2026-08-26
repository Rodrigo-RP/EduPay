---
name: Parser BBVA PDF
description: Decisiones de diseño y umbrales empíricos del BBVAParser; qué extrae y qué no.
---

## Regla principal
El parser de BBVA infiere transacciones EXCLUSIVAMENTE de la posición X de los montos en el PDF nativo.
No usar pdf-parse v2 — su API de clase está rota y no extrae texto. Usar pdfjs-dist.

## Umbrales X validados con 20 transacciones reales
| Columna        | Rango X      | Umbral usado      |
|----------------|--------------|-------------------|
| FECHA OPER     | x ≈ 16       | x ≤ 30            |
| FECHA LIQ      | x ≈ 61       | x ∈ [50, 80]      |
| DESCRIPCION    | x ≈ 107      | x ≥ 100           |
| CARGO          | x ∈ [375,391]| x ≤ 400           |
| ABONO          | x ∈ [415,425]| x ≥ 410           |
| SALDO OPER/LIQ | x ∈ [470,569]| x ≥ 460 (ignorar) |

## Estructura de bloque SPEI RECIBIDO (5 líneas)
1. `DD/MES DD/MES SPEI RECIBIDO[BANCO_SIN_ESPACIO] MONTO` — línea principal
2. Rastreo corto + `Referencia NNNNNN CODIGO_BANCO`
3. CLABE 18 dígitos exactamente
4. Rastreo largo (dígitos + alfanumérico largo) — NO es nombre
5. Nombre del ordenante

## ⚠ "SPEI RECIBIDO" y el banco van sin espacio
`SPEI RECIBIDOSANTANDER` — el banco va pegado al tipo de movimiento.

## Cargos
Se descartan silenciosamente (no van a errors[]).

## Año
Se infiere de `pdf.getMetadata().info.CreationDate` — formato `D:YYYY...`.
Fallback: `new Date().getFullYear()`.

## Import en ESM/tsx
```typescript
// @ts-ignore
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
```
Importación dinámica dentro de parse() para evitar problemas de resolución .mjs en TypeScript.

## Endpoint nuevo
`POST /api/conciliacion/importar-pdf` — multipart campo `pdf`, query `banco=BBVA`, `dry_run`.
Guard: PAYMENTS.PROCESS. Auditoría: BANK_PDF_IMPORT post-COMMIT.

La confirmación requiere el `preview_token` emitido por un dry-run vigente. El
token está ligado a usuario, tenant, campus, banco y SHA-256 de los bytes; no
aceptar commits directos ni cambiar el archivo después del preview.

En UI, el upload de archivo vive separado del importador CSV: BBVA acepta PDF y
Santander acepta XML/CFDI. Cambiar banco o archivo invalida el preview.

## Helper compartido
`insertBankRows(client, campusId, tenantId, rows[])` en conciliacion.ts — shared entre /importar y /importar-pdf.
Espera `monto_centavos` ya en enteros; no hace conversión. La validación de fecha/monto se hace ANTES de llamarlo.

## Santander
Santander México emite el estado de cuenta como un CFDI 4.0 (.xml) con addenda `EstadoDeCuentaBancario`.
El XML contiene `<Santander:MovimientoECB IdMovto="..." fecha="..." descripcion="..." importe="..." monMov="..." />`.
Los importes son SIEMPRE positivos — la dirección se infiere por whitelist de prefijos en `descripcion`:
  ABONO_PREFIXES = ["ABONO", "DEPOSITO", "SPEI RECIBIDO", "TRANSFERENCIA RECIBIDA", "PAGO RECIBIDO", ...]
El parser usa regex `<Santander:MovimientoECB\b([^>]*?)\/>`  (NO `[^/]+` — se rompe con "N/A" en atributos).
La referencia es el `IdMovto`; no hay CLABE ni nombre del ordenante en el ECB.
El endpoint `/api/conciliacion/importar-pdf` ya acepta banco=Santander con archivo .xml (multer acepta cualquier mime).
