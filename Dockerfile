FROM node:22-alpine AS builder

WORKDIR /app

# Install server deps
COPY package*.json ./
RUN npm ci

# Install client deps and build
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

# --- Production image ---
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/
COPY cli/ ./cli/
COPY --from=builder /app/public/ ./public/

EXPOSE 3500

ENV PORT=3500

CMD ["node", "src/index.js"]
