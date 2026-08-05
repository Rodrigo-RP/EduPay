---
name: Route Registry (§9.1 / §9.2)
description: Fuente única de rutas del panel administrativo y cómo se mantiene sincronizada con el asistente y CI.
---

## Regla
Toda pantalla nueva del panel administrativo debe tener una entrada en `shared/route-registry.ts`
ANTES de ser desplegada. El script `npm run check:routes` falla con código 1 si existe una
`<Route path="...">` en `client/src/App.tsx` sin entrada en `APP_ROUTES`.

## Estructura
- `shared/route-registry.ts` — `AppRoute[]` con path + label + keywords + `assistantExcluded?`
- `scripts/check-route-registry.ts` — script CI que compara App.tsx vs APP_ROUTES
- `server/assistant-knowledge.ts` — importa `ASSISTANT_ROUTES` del registro; emite `console.warn` en arranque si KNOWLEDGE_BASE tiene menos entradas

## Tipos de rutas
- Rutas normales: aparecen en el asistente (se omite `assistantExcluded`)
- Rutas excluidas (`assistantExcluded: true`): alias de raíz, páginas demo, herramientas internas, portales con token paramétrico

## Cómo agregar una pantalla nueva
1. Agregar entrada a `APP_ROUTES` en `shared/route-registry.ts` (path, label, keywords)
2. Si necesita cobertura completa del asistente (descripción + roles), agregar también a `KNOWLEDGE_BASE` en `server/assistant-knowledge.ts`
3. Ejecutar `npm run check:routes` — debe salir con código 0

## Por qué
Sin este mecanismo, el catálogo del asistente se queda atrás silenciosamente cada vez que
se agrega una pantalla. El CI lo convierte en un error detectable, no en un defecto que
descubre el administrador semanas después.
