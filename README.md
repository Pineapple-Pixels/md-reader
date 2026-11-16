# md-reader

Servidor de documentos Markdown como sitio web editable, con soporte multi-usuario, teams y comentarios inline.

## Stack

- **Backend:** Node 22 + Express 5 + TypeScript (strict)
- **Frontend:** React 19 + Vite + TanStack Query + React Router
- **Base de datos:** PostgreSQL 16 (via postgres.js)
- **Auth:** JWT en cookie httpOnly + bcrypt
- **Infra:** Docker multi-stage + docker-compose

## Setup local

### Requisitos

- Node.js 22+
- Docker (para PostgreSQL)

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus valores
```

Variables requeridas:

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `PORT` | `3500` | Puerto del servidor |
| `STORAGE_DIR` | `./storage` | Directorio raiz de almacenamiento |
| `DATABASE_URL` | — | Connection string de PostgreSQL |
| `JWT_SECRET` | — | Secreto para firmar JWT (requerido en prod) |
| `ADMIN_USER` | `admin` | Username del admin inicial (solo seed) |
| `ADMIN_PASS` | — | Password del admin inicial (solo seed) |

### 3. Levantar PostgreSQL

```bash
docker compose up -d postgres
```

### 4. Correr migraciones

```bash
npm run db:migrate
```

### 5. Iniciar en modo desarrollo

```bash
npm run dev
```

Abre http://localhost:5173 (Vite) o http://localhost:3500 (Express directo).

## Arquitectura

```
storage/
  users/<userId>/    -> docs privados por usuario
  teams/<slug>/      -> docs compartidos por team
  public/            -> docs visibles sin login

src/
  index.ts           -> entry point Express
  lib/               -> logica de negocio (auth, storage, comments, users, teams)
  routes/
    api.ts           -> API privada (requiere auth)
    public-api.ts    -> API publica (sin auth)
    admin-api.ts     -> API admin (auth + role admin)

client/              -> SPA React (Vite)
shared/              -> tipos compartidos entre server y client
cli/                 -> herramientas CLI (migrate, user, team)
migrations/          -> SQL versionado
```

### Scopes

Cada usuario opera en un "scope":

- **me** — docs privados del usuario
- **team:\<slug\>** — docs del team (requiere membership)
- **public** — docs visibles para todos (solo admin escribe)

## Scripts disponibles

| Script | Descripcion |
|--------|-------------|
| `npm run dev` | Servidor + Vite en modo desarrollo |
| `npm run build` | Build de produccion (client + server) |
| `npm start` | Arrancar build de produccion |
| `npm test` | Correr tests (vitest) |
| `npm run lint` | Lint con ESLint |
| `npm run typecheck` | Chequeo de tipos TypeScript |
| `npm run db:migrate` | Correr migraciones de DB |
| `npm run test:e2e` | Tests end-to-end y visuales con Playwright |
| `npm run test:e2e:update` | Regenerar las capturas de referencia |

### Tests end-to-end (Playwright)

Levantan el build de produccion en el puerto 3600, sobre una base y un storage nuevos en cada corrida
(`mdreader_e2e`, `.e2e-storage/`), cargan datos de prueba (`e2e/seed.ts`) y recorren login, organizaciones,
diseno por org, temas y la cuenta sin organizacion. Comparan cada pantalla contra las capturas de
referencia en `e2e/app.spec.ts-snapshots/` y verifican que cambiar el tema de la app no mueva un pixel del documento.

Necesitan un Postgres con permiso para crear bases. Por defecto usan uno descartable en el puerto 5433:

```bash
docker run -d --name mdreader-e2e -e POSTGRES_USER=mdreader -e POSTGRES_PASSWORD=mdreader -p 5433:5432 postgres:16-alpine
```

```bash
npm run test:e2e
```

Otro servidor: `E2E_DATABASE_URL=postgres://user:pass@host:puerto/postgres`. Si un cambio de UI es a proposito,
regenerar las referencias con `npm run test:e2e:update` y revisar las imagenes nuevas antes de commitearlas.
El reporte con capturas y trazas de los fallos queda en `playwright-report/` (`npx playwright show-report`).
Las referencias son de Windows (`-win32.png`); en otro sistema operativo hay que generarlas de nuevo.

### Gestion de usuarios (CLI)

```bash
npm run user:create -- <username> <password> [--role=admin|member] [--name="Display Name"]
npm run user:passwd -- <username> <newPassword>
npm run user:delete -- <username>
npm run user:list
```

### Gestion de teams (CLI)

```bash
npm run team:create -- <slug> <name>
npm run team:delete -- <slug>
npm run team:list
npm run team:add-user -- <slug> <username> [--role=admin|member]
npm run team:remove-user -- <slug> <username>
npm run team:members -- <slug>
```

## Deploy (Coolify/Docker)

```bash
docker compose up -d
```

Variables de entorno requeridas en produccion:
- `POSTGRES_PASSWORD` — password del Postgres del compose (sin ella queda `mdreader`, solo apta para dev)
- `JWT_SECRET` — secreto seguro (generar con `openssl rand -base64 64`)
- `STORAGE_DIR` — path al volumen de storage

Las migraciones se corren automaticamente al arrancar. El Postgres no publica puertos en produccion;
`docker-compose.override.yml` lo expone solo en `127.0.0.1:5432` para desarrollo local.

**Auto-deploy:** cada push a `main` corre el CI y, si pasa, el job `deploy` llama al deploy webhook de Coolify.
Necesita dos secrets del repo en GitHub: `COOLIFY_WEBHOOK` (Coolify → app → Webhooks → Deploy Webhook) y
`COOLIFY_TOKEN` (Coolify → Keys & Tokens → API token con permiso de deploy). Sin ellos el job avisa y no deploya.
