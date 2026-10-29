---
name: Resolución de dependencias con npm
description: Fallo interno de Arborist observado al simular correcciones de seguridad y límites de la evidencia
---

En este entorno, npm 10.8.2 y una ejecución temporal de npm 10.9.4 fallaron en `#loadPeerSet` con `Cannot read properties of null (reading 'edgesOut')` durante `npm audit fix --dry-run`. También ocurrió sin filtro de antigüedad. La dependencia desencadenante no quedó identificada.

**Why:** La simulación evitó modificar el árbol sin comprobar su compatibilidad. Cambiar de versión menor de npm y preferir deduplicación no resolvieron el fallo; no debe atribuirse exclusivamente al filtro de fechas.

**How to apply:** Confirmar si sigue ocurriendo antes de una nueva corrección masiva. No convertir un fallo interno de npm en permiso para usar `--force` o ignorar requisitos pares sin autorización expresa. Si reaparece, informar que la resolución está bloqueada y separar las correcciones efectivamente instaladas de las pendientes.

Un `npm ci` con salida 0 no demuestra por sí solo que todos los requisitos pares sean válidos: en una copia limpia instaló correctamente y después `npm ls --all` señaló un requisito incompatible.

**Why:** `--legacy-peer-deps` permite resolver ignorando esos requisitos, y la instalación posterior puede emitir advertencias en lugar de fallar.

**How to apply:** Comprobar tanto `npm ci` sin opciones que ignoren requisitos pares como `npm ls --all` en una copia temporal con el manifiesto y lockfile que realmente se entregarían. Un diagnóstico que modifica el manifiesto solo en `/tmp` no verifica los archivos del proyecto.

Cuando un lockfile resuelto ignorando pares produce una disposición incompatible, una resolución limpia desde el mismo manifiesto puede distinguir un problema del lockfile de una restricción real del manifiesto.

**Why:** La resolución limpia eliminó incompatibilidades por ubicación de paquetes; una dependencia fijada exactamente siguió siendo incompatible hasta autorizar su actualización. No bastaba con corregir únicamente las versiones de paquetes que el auditor marcaba como vulnerables.

**How to apply:** Hacer primero el diagnóstico en una copia temporal sin secretos ni configuración de la app. Comparar todas las dependencias directas y las líneas protegidas antes de adoptar el lockfile generado; pedir autorización si el arreglo exige cambiar una versión exacta fuera del alcance acordado.
