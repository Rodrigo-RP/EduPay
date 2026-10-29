---
name: Errores de consultas y diálogos
description: Evitar listas falsas y bloqueos persistentes al proteger pantallas con diálogos portados.
---

Los diálogos deben representar sus propios estados de error, carga y
reintento; ocultar el contenedor de una pantalla no basta para ocultarlos.
Al detectar fallos globales, considerar consultas activas, no simplemente
consultas con observadores montados.

**Why:** Los portales de React se montan fuera del contenedor DOM oculto.
Un diálogo puede seguir mostrando su valor predeterminado vacío aunque la
pantalla principal ya muestre error. Además, una consulta deshabilitada
al cerrar un diálogo puede conservar observadores y un error en caché;
si se considera activa por ello, bloquea la pantalla sin poder reintentarse.

**How to apply:** En diálogos que leen datos, distinguir fallo de ausencia
real de registros y conservar un reintento accesible dentro del diálogo.
Comprobar también que cerrarlo desactiva el bloqueo global correspondiente.

Las pruebas aisladas de un diálogo deben preparar sus propias identidades
y relaciones, no elegir el primer alumno que haya quedado de otra suite.
**Why:** Una corrida aislada puede encontrar el campus vacío aunque la
suite completa prepare datos antes. Esa ausencia no prueba un fallo del
diálogo y no debe resolverse alterando las reglas de la aplicación.
