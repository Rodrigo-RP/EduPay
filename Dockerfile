# EduPay para Cloud Run: un solo proceso Node.js (ver docs/PUBLICACION.md).
# La imagen no contiene secretos ni ejecuta migraciones, seeds ni DDL.

FROM node:20-slim AS build
WORKDIR /app

# El lockfile versionado apunta al registro interno de Replit; se corrige solo
# en esta copia (docs/INSTALACION-FUERA-DE-REPLIT.md).
COPY package.json package-lock.json ./
COPY scripts/lockfile-public.mjs scripts/lockfile-public.mjs
RUN node scripts/lockfile-public.mjs && npm ci

COPY . .

# Clave PUBLICABLE de Stripe: Vite la incrusta al compilar, no en ejecución.
ARG VITE_STRIPE_PUBLISHABLE_KEY
ENV VITE_STRIPE_PUBLISHABLE_KEY=$VITE_STRIPE_PUBLISHABLE_KEY
RUN npm run build && npm prune --omit=dev

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# El bundle del servidor usa --packages=external: necesita node_modules de producción.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node
# Cloud Run envía PORT; sin él, el servidor usa 5000.
EXPOSE 5000
CMD ["node", "dist/index.js"]
