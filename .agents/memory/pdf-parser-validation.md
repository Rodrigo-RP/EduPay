---
name: PDF parser validation — BBVA y Santander
description: Resultados de extracción real con pdfjs-dist; decisiones de diseño confirmadas para el parser de estados de cuenta bancarios.
---

## Resultado de validación con PDFs reales

### Archivos validados
- 2 PDFs BBVA (texto nativo): texto extraíble con pdfjs-dist, estructura completamente mapeada.
- 2 PDFs Santander ("Estado_de_cuenta_mayo_2026_*.pdf"): **PDF escaneado/imagen** — 0 items de texto, ~5-7 operadores de imagen por página. OCR requerido.

### Librería correcta: pdfjs-dist (NO pdf-parse)
- `pdf-parse` v2.4.5 instalado tiene API de clase rota para text extraction: `new PDFParse()` lanza sin opciones obligatorias. No sirve para este proyecto.
- `pdfjs-dist` ya instalado como dependencia transitiva — usar directamente con `import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'`.
- La extracción requiere acceso a `item.transform[4]` (coordenada X) — texto plano solo no alcanza para BBVA.

### Estructura BBVA — coordenadas X confirmadas con datos reales

Cabecera de tabla (Y≈256):
```
[x=21]OPER  [x=70]LIQ  [x=105]DESCRIPCION  [x=321]REFERENCIA  [x=381]CARGOS  [x=427]ABONOS OPERACION  [x=536]LIQUIDACION
```
Nota: "ABONOS OPERACION" llega como un solo text item (comprimido en el PDF).

**Columnas de monto (datos reales, n=20 transacciones):**
| Columna | Rango X | Umbral |
|---|---|---|
| CARGOS | 375–391 | x ≤ 400 |
| ABONOS | 415–425 | x ≥ 410 |
| SALDO OPERACION | 470–496 | — |
| SALDO LIQUIDACION | 536–569 | — |

Sin solapamiento en ninguna transacción observada. Umbral seguro: x ≤ 400 → CARGO, x ≥ 410 → ABONO.

### Estructura de bloque BBVA

**Línea de inicio de bloque**: `DD/MES [x=16]  DD/MES [x=61]  DESCRIPCION [x=107]  MONTO [x=375..425]`

**SPEI RECIBIDO (ABONO) — 5 líneas**:
```
DD/MES  DD/MES  SPEI RECIBIDO[BANCO_SIN_ESPACIO]  MONTO[x≈420]
CLAVE_RASTREO + DESCRIPCION_CORTA  Referencia XXXXXXXXXX CODIGO
CLABE_18_DIGITOS
NUMERO_RASTREO_COMPLETO
NOMBRE_ORDENANTE
```
⚠️ "SPEI RECIBIDO" y el banco van concatenados sin espacio: `SPEI RECIBIDOSANTANDER`, `SPEI RECIBIDOBBVA`, etc. Regex: `/SPEI RECIBIDO/` (sin espacio después).

**SPEI ENVIADO (CARGO) — estructura similar**, pero MONTO en columna CARGOS (x≈380-391).

**Saldos OPERACION/LIQUIDACION**: solo en la última transacción con la misma FECHA_LIQUIDACION dentro del día. No en cada transacción. No usar para validar montos individuales.

**Cargo simple (no SPEI) — 2 líneas**:
```
DD/MES  DD/MES  DESCRIPCION  MONTO[x≈384-391]
RFC/AUT_INFO  Referencia ******XXXX
```

### Decisión de diseño resultante
- Parser BBVA: implementable con alta confianza.
- Parser Santander: bloqueado hasta obtener PDF de Santander **generado digitalmente** (descargado desde banca en línea, no escaneado). Los PDFs de Santander disponibles son todos escaneados.
- `pdf-parse` v2 instalado: desinstalar o ignorar — no aporta valor.

**Why:** La distinción CARGO/ABONO en BBVA es posición de columna, no contenido de texto. Sin coordenadas X, habría que parsear por descripción (frágil). Con pdfjs-dist las coordenadas están disponibles directamente.
