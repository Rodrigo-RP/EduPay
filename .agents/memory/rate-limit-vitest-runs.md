---
name: Rate limit acumulado entre runs de Vitest
description: El rate limiter del servidor (300 req/5min) persiste entre runs consecutivos de tests si el servidor no se reinicia entre ellos.
---

# Rate limit acumulado entre runs de Vitest

## Regla

Hacer `WorkflowsRestart("Start application")` antes de cada `npx vitest run` completo de la suite cuando se han hecho runs previos en los últimos 5 minutos.

## Por qué

El rate limiter autenticado (`_apiAuthLimiterStore`, 300 req/5min) vive en el proceso del servidor — no en el proceso de Vitest. `resetApiAuthRateLimitStore()` en `tests/setup.ts` resetea el store EN el proceso de Vitest (proceso separado) y no tiene efecto sobre el servidor. El servidor acumula el contador a través de múltiples runs hasta que el contador expira naturalmente (5 min) o el servidor se reinicia.

Con ~285 HTTP calls en la suite completa (~300 budget), uno o dos runs extra sin reinicio superan el límite y causan 429 en masa.

## Cómo aplicar

```
WorkflowsRestart("Start application")  ← limpia el rate limiter
sleep 3
npx vitest run                         ← empieza desde 0
```

No correr la suite más de una vez sin reiniciar entre runs.
