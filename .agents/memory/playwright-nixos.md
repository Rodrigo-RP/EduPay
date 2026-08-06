---
name: Playwright en NixOS Replit
description: Configuración necesaria para que Playwright funcione en el entorno NixOS de Replit.
---

# Playwright en NixOS

## El problema
El binario de chromium que descarga `npx playwright install chromium` falla con:
```
chrome-headless-shell: error while loading shared libraries: libglib-2.0.so.0: cannot open shared object file
```
Porque NixOS no tiene los `.so` en las rutas estándar de Linux.

`npx playwright install-deps chromium` también falla porque intenta usar `apt-get`.

**Why:** NixOS no usa el sistema de paquetes de Linux estándar; las librerías están en `/nix/store/...`.

## Solución
1. Instalar chromium del sistema NixOS via CodeExecution:
   ```js
   await installSystemDependencies({ packages: ["chromium"] });
   ```
2. Localizar el binario resultante: `which chromium` devuelve la ruta en `/nix/store/`.
3. Configurar Playwright para usarlo via `executablePath` en `playwright.config.ts`:
   ```ts
   launchOptions: {
     executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/nix/store/<hash>-chromium-<ver>/bin/chromium",
     args: ["--no-sandbox", "--disable-setuid-sandbox"],
   }
   ```

## Estado actual
- Chromium instalado: v125 (`/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium`)
- `playwright.config.ts` ya apunta a esa ruta
- 29/29 tests E2E pasan con esta configuración

## Precaución
Si el entorno se recrea, el hash del nix store puede cambiar. Usar `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` como variable de entorno para evitar hardcodear el path.
