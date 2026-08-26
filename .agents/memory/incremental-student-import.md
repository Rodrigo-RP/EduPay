---
name: Importación incremental de alumnos
description: Decisiones de producto y concurrencia para cargas continuas de estudiantes.
---

`/importacion-datos` es el camino canónico para agregar alumnos durante el ciclo;
el asistente de configuración inicial permanece reservado para el arranque.

**Why:** El flujo continuo necesita preview real y omitir alumnos existentes sin
actualizarlos ni abortar el resto del archivo.

**How to apply:** Deduplicar por CURP y matrícula dentro de tenant/campus. Mientras
no existan índices únicos físicos, adquirir locks transaccionales para todas las
claves del archivo, deduplicarlas y ordenarlas globalmente antes de procesar filas;
locks por fila permiten carreras o deadlocks con archivos en orden inverso.

Los índices físicos están pospuestos hasta ejecutar un preflight de sólo lectura
en producción/JFR, mostrar el resultado al usuario y recibir aprobación explícita.