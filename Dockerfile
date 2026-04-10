FROM node:22-alpine AS builder

WORKDIR /app

# Install server deps (incluye devDeps para compilar TS)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Shared types/utilities used by both client and server
COPY shared/ ./shared/

# Install client deps and build
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

# Build server (TypeScript → dist/)
COPY tsconfig.server.json ./
COPY src/ ./src/
COPY types/ ./types/
COPY cli/ ./cli/
RUN npm run build:server

# --- Production image ---
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist/ ./dist/
COPY cli/ ./cli/
COPY migrations/ ./migrations/
COPY --from=builder /app/public/ ./public/

EXPOSE 3500

ENV PORT=3500

CMD ["node", "dist/src/index.js"]
