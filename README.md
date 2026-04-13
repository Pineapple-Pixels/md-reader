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
- `DATABASE_URL` — connection string PostgreSQL
- `JWT_SECRET` — secreto seguro (generar con `openssl rand -base64 64`)
- `STORAGE_DIR` — path al volumen de storage

Las migraciones se corren automaticamente al arrancar.
