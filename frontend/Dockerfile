# TenisAI - Frontend (Next.js) para producción. Lo usa docker-compose.prod.yml.
# Para desarrollo no hace falta: npm run dev.

FROM node:24-bookworm-slim AS base
# Prisma necesita OpenSSL para su motor de consultas
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- Dependencias (capa propia: solo se repite si cambia package-lock.json) ---
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci

# --- Compilación ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Salida autónoma: server.js con solo los archivos que usa (next.config.ts)
ENV NEXT_OUTPUT=standalone
RUN npx prisma generate && npx next build

# --- Imagen final ---
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# CLI de Prisma para aplicar las migraciones al arrancar (misma versión que el cliente)
RUN npm install -g prisma@5.22.0 \
    # Carpeta de la base de datos (volumen): del usuario sin privilegios que ejecuta la web
    && mkdir -p /datos && chown node:node /datos

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=build --chown=node:node /app/prisma/migrations ./prisma/migrations
# Administración: dar o quitar el rol de organizador (README, «Producción»)
COPY --from=build --chown=node:node /app/scripts/organizador.mts ./scripts/organizador.mts

USER node
EXPOSE 3000
# Aplica las migraciones pendientes (no borra datos) y arranca la web
CMD ["sh", "-c", "prisma migrate deploy && exec node server.js"]
