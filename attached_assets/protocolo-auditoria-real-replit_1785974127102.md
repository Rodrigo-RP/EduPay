# Protocolo de Auditoría Real de Código para EduPay (Replit)

## 1. El problema exacto que este protocolo corrige

Pedir "audita el código y dime si hay errores" produce casi siempre una respuesta tranquilizadora, porque el agente está leyendo y razonando sobre el código, no ejecutándolo. Una lectura estática detecta errores obvios de sintaxis, pero no detecta que un botón no dispara el endpoint correcto, que un formulario guarda mal un campo, o que una función que depende de otra tres capas más abajo nunca se llega a ejecutar en el flujo real. Eso solo se descubre corriendo el sistema de verdad. Este documento existe para que ninguna afirmación de "ya no hay errores" se acepte sin evidencia de ejecución real.

## 2. Regla dura: ninguna afirmación sin evidencia ejecutada

A partir de ahora, cualquier reporte de Replit del tipo "revisé el código y no encontré errores" se considera inválido si no incluye, en el mismo mensaje:

- El comando exacto que se ejecutó.
- La salida completa de ese comando, sin resumir ni parafrasear.
- El resultado explícito (pasó / falló) por cada caso probado, no una conclusión general.

Si Replit no puede mostrar eso, la instrucción es responder literalmente: "no ejecuté pruebas reales, solo revisé el código." Esa honestidad vale más que una falsa sensación de seguridad.

## 3. Inventario de funcionalidades como checklist obligatorio

Mantener un archivo vivo, por ejemplo `docs/qa/matriz-de-pruebas.md`, con una fila por cada pantalla, botón, endpoint y función crítica de la plataforma. Cada fila indica: qué hace, cómo se prueba, y la fecha y resultado de la última vez que se probó de verdad. Cada vez que se agrega una función nueva, se agrega una fila nueva a este archivo en el mismo commit. Esto es lo que te permite, meses después, saber qué parte de la plataforma nunca se ha vuelto a probar desde que se escribió.

## 4. Dos capas de prueba obligatorias por módulo

- Pruebas automatizadas de lógica (Vitest): validan funciones y reglas de negocio de forma aislada, como ya establece el proyecto para el motor financiero.
- Pruebas de extremo a extremo (Playwright): simulan al usuario real haciendo clic en la interfaz, llenando formularios y verificando que el dato correcto termine guardado en base de datos y que la pantalla muestre lo que debe mostrar.

Una función se considera probada solo cuando pasó por las dos capas, no solo por la primera. La mayoría de los "funciona en la auditoría pero no al usarlo" pasa exactamente porque solo se corrió la primera capa, o ninguna.

## 5. Protocolo de reporte estandarizado al terminar cada módulo

En lugar de pedir "audita el código", pide textualmente un reporte con esta estructura fija:

```
Módulo probado: [nombre]
Comando ejecutado: [comando exacto]
Resultado: [output completo, sin resumir]
Casos que pasaron: [lista]
Casos que fallaron: [lista, con el error exacto]
Funciones de este módulo que NO se probaron y por qué: [lista]
```

Si el reporte no tiene esta forma, la respuesta no cuenta como auditoría, es una opinión.

## 6. Regresión obligatoria: correr toda la suite, no solo lo nuevo

Cada vez que se termina un cambio, la instrucción explícita es: "corre toda la suite de pruebas existente del proyecto, no solo las del módulo que acabas de tocar, y pega el resumen completo (cuántas pasaron, cuántas fallaron, cuáles)." Un módulo nuevo puede romper silenciosamente uno viejo si comparten una función o una tabla, y eso solo se detecta si se vuelve a correr todo, no únicamente lo reciente.

## 7. Límite real de Replit con un proyecto de este tamaño

Con más de 15 mil líneas de código, es probable que cuando Replit dice "audité todo el proyecto y no hay errores", en realidad no esté considerando el proyecto completo dentro de su ventana de contexto, sino una porción de él, sin advertírtelo. Esto no es exclusivo de Replit, es una limitación general de los agentes basados en LLM frente a proyectos grandes, y es la misma razón por la que ya se decidió que el motor financiero central de EduPay se construya con Claude Code en el repositorio, dejando a Replit para prototipos de interfaz. Si de todos modos vas a usar Replit para auditar código central, pide auditorías con alcance explícito y acotado ("audita solo el módulo de conciliación, archivo por archivo") en vez de "audita todo el proyecto" de una sola vez; una auditoría sin alcance definido es la más propensa a ser superficial sin que se note.

## 8. Instrucción exacta para copiar y pegar en Replit

```
A partir de ahora sigue este protocolo para cualquier revisión de código o corrección de errores:

1. No me digas que "ya no hay errores" sin haber ejecutado algo. Toda afirmación de que
   una función funciona debe venir acompañada del comando que corriste y la salida completa,
   sin resumir.

2. Para cualquier módulo que yo te pida revisar, ejecuta las pruebas automatizadas existentes
   de ese módulo (Vitest) y, si el módulo tiene interfaz de usuario, simula el flujo completo
   con Playwright: clic real en el botón, verificación de que el backend lo procesó, y
   verificación de que el registro correcto quedó en base de datos.

3. Si el módulo no tiene pruebas automatizadas todavía, tu primera tarea es escribirlas antes
   de poder decir que el módulo está sano. No se vale "revisar visualmente" como sustituto de
   una prueba ejecutada.

4. Cada vez que termines algo, entrégame el reporte en este formato exacto, sin omitir ninguna
   sección:

   Módulo probado:
   Comando ejecutado:
   Resultado (salida completa):
   Casos que pasaron:
   Casos que fallaron:
   Funciones que NO se probaron y por qué:

5. Antes de decir que un módulo nuevo está terminado, corre TODA la suite de pruebas del
   proyecto, no solo la del módulo nuevo, y dime cuántas pasaron y cuántas fallaron en total.

6. Si el proyecto es demasiado grande para revisarlo completo de una sola vez, dímelo
   explícitamente en vez de reportar que "todo está bien". Prefiero que me digas los límites
   de lo que alcanzaste a revisar que una falsa sensación de seguridad.
```

## 9. Relación con el asistente virtual de EduPay

El catálogo de smoke-tests que ya se definió para el asistente virtual (sección 5 del documento `asistente-virtual-edupay.md`) puede convertirse, con el tiempo, en la misma suite de regresión que exige este protocolo. Construir uno alimenta al otro: cada prueba de humo que el asistente usa para autodiagnosticar en producción es, al mismo tiempo, una prueba que Replit debería estar corriendo antes de declarar un módulo terminado.
