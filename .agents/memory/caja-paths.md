---
name: Caja and semaforo API paths
description: Las rutas reales del backend para caja y semáforo — diferentes al path del frontend
---

## Rutas reales del backend

| Módulo | Path Frontend | Path Backend API |
|--------|---------------|-----------------|
| Caja movimientos bancarios | /caja | `/api/caja/movimientos-banco` |
| Caja estadísticas conciliación | /caja | `/api/caja/estadisticas-conciliacion` |
| Semáforo de riesgo | /semaforo-riesgo | `/api/riesgo/semaforo/:campusId` |
| Semáforo sin campusId | /semaforo-riesgo | `/api/riesgo/semaforo` |

## Rutas que NO existen
- `/api/bank-transactions/:campusId` — no existe, retorna HTML (Vite catch-all)
- `/api/historial/:campusId` — no existe, retorna HTML
- `/api/semaforo-riesgo/:campusId` — no existe

**Why:** Los paths del frontend y del backend no siempre coinciden en este proyecto. El frontend usa react-query con queryKey que puede diferir del path de la pantalla.
