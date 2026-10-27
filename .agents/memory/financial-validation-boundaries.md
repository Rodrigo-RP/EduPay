---
name: Validación financiera en límites de confianza
description: Por qué los precios persistidos requieren validación además de las peticiones y sus rutas alternativas.
---

La emisión debe comprobar el importe efectivo proveniente de datos históricos,
no sólo los valores del cuerpo HTTP. No corregir un precio inválido redondeándolo
ni sustituyéndolo por una cifra de respaldo. Las rutas alternativas deben mantener
el mismo contrato que el flujo principal.

**Why:** Las validaciones de entrada nuevas no saneaban los conceptos y productos
ya guardados: un concepto negativo todavía podía emitir deuda negativa y un
concepto de cero podía activar un monto de respaldo sin configuración real.

**How to apply:** En cualquier emisor de cargos, validar todos los precios que
puedan usarse antes de la primera escritura. Incluir fixtures heredadas inválidas
en pruebas aisladas. Un nivel del catálogo puede tener cero para indicar que no
se vende allí, pero eso no autoriza crear conceptos o cargos de cero ni aceptar
un producto sin ningún precio positivo.
