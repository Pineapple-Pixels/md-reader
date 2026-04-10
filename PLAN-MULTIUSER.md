# Plan de acción: multi-usuario + teams + público con comentarios

> Estado: borrador, pendiente de confirmar Opción A de URLs antes de arrancar Fase 1.

## Objetivo

Pasar la app de single-user a multi-user (10-15 cuentas) con:
- Documentos privados por usuario.
- Documentos compartidos por team (ej: "team-ai" ve sus docs además de los suyos).
- Documentos públicos: lectura para todos los logueados, sin edición, solo comentarios estilo GitHub.

---

## Decisiones cerradas

| Tema | Decisión |
|------|----------|
| Base de datos | **PostgreSQL** (driver `postgres.js`) |
| Comentarios públicos | Por línea, estilo GitHub (hover muestra `+`, click abre form anclado) |
| URLs | **Opción A**: prefijo explícito por scope (`/me`, `/t/<slug>`, `/pub`) — *pendiente confirmación final* |
| Creación de usuarios | Admin-managed vía CLI (`npm run user:create`) |
| Layout filesystem | `storage/users/<userId>/`, `storage/teams/<slug>/`, `storage/public/` |

## Decisiones pendientes

- Confirmar Opción A para URLs.
- ¿Comentarios públicos requieren login obligatorio o permitimos anónimos? (recomiendo login obligatorio).
- ¿Reset de password por CLI alcanza o queremos flujo por email? (recomiendo CLI para 15 users).

---

## Stack

- **DB**: PostgreSQL 16 (`postgres:16-alpine` en docker-compose para dev).
- **Driver**: `postgres` (postgres.js) — API limpia, sin ORM.
- **Migraciones**: archivos `migrations/*.sql` + runner simple en `cli/migrate.js`. No vamos con Prisma/Drizzle.
- **Hashing**: `bcrypt` (cost 12).
- **Sesiones**: JWT en cookie httpOnly (igual que hoy), payload mínimo `{ userId }`.
- **Connection string**: `DATABASE_URL=postgres://user:pass@host:5432/mdreader` en `.env`.

### Modelo de datos

```sql
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'member', -- 'admin' | 'member'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id         SERIAL PRIMARY KEY,
  slug       TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE team_members (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  role    TEXT NOT NULL DEFAULT 'member', -- 'admin' | 'member'
  PRIMARY KEY (user_id, team_id)
);

-- Comentarios: extensión del formato actual (file + line)
-- Hoy viven en JSON; los migramos a tabla cuando entremos en Fase 5.
CREATE TABLE comments (
  id         SERIAL PRIMARY KEY,
  scope      TEXT NOT NULL,        -- 'me:<userId>' | 'team:<slug>' | 'public'
  file_path  TEXT NOT NULL,
  line       INTEGER,              -- nullable: comentario al doc completo
  author_id  INTEGER NOT NULL REFERENCES users(id),
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX comments_scope_file_idx ON comments(scope, file_path);
```

---

## Permisos

| Scope        | Read                  | Write       | Comment              |
|--------------|-----------------------|-------------|----------------------|
| `me`         | owner                 | owner       | owner                |
| `team:<X>`   | miembros del team     | miembros    | miembros             |
| `public`     | todos los logueados   | ❌ ninguno  | todos los logueados  |

Subir contenido a `public/` se hace solo desde un team (con permiso especial) o desde admin CLI. La UI normal no expone botones de edición sobre `public`.

---

## URLs (Opción A — pendiente confirmación)

```
/me/<folder>/<file>          → privado del user logueado
/t/<teamSlug>/<folder>/<file>→ team del que es miembro
/pub/<folder>/<file>         → público
```

Sidebar/topbar tendrá un selector con:
```
[Mis documentos]   → /me
[Team AI]          → /t/team-ai
[Team Backend]     → /t/backend
[Públicos]         → /pub
```

Las URLs viejas (`/doc/...`, `/edit/...`, `/pub/...`) redirigen a las nuevas durante una ventana de migración.

---

## Fases

### Fase 1 — Postgres + auth multi-user
**Objetivo**: reemplazar el `ADMIN_USER`/`ADMIN_PASS` actual por una tabla `users` real, sin tocar UI.

- Agregar `postgres` y `bcrypt` a `package.json`.
- `docker-compose.yml`: servicio `postgres:16-alpine` + volumen.
- `.env.example`: `DATABASE_URL=...`.
- `src/lib/db.js`: pool de conexión exportado.
- `migrations/001_users.sql`: tabla `users`.
- `cli/migrate.js`: runner que aplica migraciones pendientes (tracking en tabla `_migrations`).
- `cli/user.js`: comandos `create`, `passwd`, `delete`, `list`.
- `npm run` scripts: `db:migrate`, `user:create`, `user:passwd`.
- Refactor de `src/lib/auth.js`:
  - `login(user, pass)` → busca en DB, valida con `bcrypt.compare`.
  - JWT payload: solo `{ userId }`.
  - `verifyToken` ahora también hidrata `user` desde DB (con cache in-memory de 60s).
- Migración del admin actual: `ADMIN_USER`/`ADMIN_PASS` se inserta como user id 1, role `admin`. Al primer arranque si la tabla está vacía y existen las env vars, se hace el seed.
- Tests: login OK, login fail, password hashing, JWT round-trip.

**Riesgo**: si `JWT_SECRET` cambia, todos los usuarios deslogueados. Documentar en README.

**Salida**: visualmente idéntico a hoy, pero con DB atrás.

---

### Fase 2 — Teams + memberships
**Objetivo**: modelar teams en DB, sin UI todavía.

- `migrations/002_teams.sql`: tablas `teams` y `team_members`.
- `cli/team.js`: `create`, `delete`, `add-user`, `remove-user`, `list`.
- `verifyToken` extiende `req.user` con `teams: [{ slug, name, role }]`.
- Helper `userHasTeam(req, slug) → boolean`.
- Tests: crear team, agregar miembro, query memberships.

**Salida**: backend lista para autorizar por team. Sin cambios visibles aún.

---

### Fase 3 — Storage scoping
**Objetivo**: refactor del filesystem y endpoints para soportar los 3 scopes.

- Nuevo layout:
  ```
  storage/
    users/<userId>/
    teams/<teamSlug>/
    public/
  ```
- `src/lib/storage.js`:
  - `resolveScope(scopeStr, user) → { basePath, canWrite, canComment }`
  - `scopeStr` válidos: `me`, `team:<slug>`, `public`.
  - Valida que el user tenga acceso (owner / member / siempre).
  - `isWritableDocPath` ahora también consulta `canWrite` del scope. `public` devuelve `false` siempre.
- Endpoints `/api/project`, `/api/render`, `/api/pull`, `/api/push`, `/api/upload`:
  - Reciben `scope` como query param obligatorio.
  - Middleware valida acceso antes de leer/escribir.
- `src/routes/public-api.js`: queda como atajo público (no requiere auth para listar/leer; comentarios siguen requiriendo login).
- Script de migración `cli/migrate-storage.js`:
  - `pub-local/` → `storage/users/<adminId>/` (admin del seed).
  - `pub-docs/` → `storage/public/`.
  - Idempotente, con backup automático del estado previo.
- Tests: escribir en team siendo miembro OK, escribir siendo no-miembro 403, escribir en public 403, leer público sin login OK.

---

### Fase 4 — Frontend: scope switcher + routing
**Objetivo**: que el usuario pueda navegar entre sus 3 espacios.

- React Router: nuevas rutas
  - `/me/*` → `<ProjectPage scope="me" />`
  - `/t/:slug/*` → `<ProjectPage scope={`team:${slug}`} />`
  - `/pub/*` → `<ProjectPage scope="public" />`
- Las viejas rutas redirigen.
- `ProjectPage` y `EditorPage` reciben `scope` como prop y lo pasan en todas las llamadas a `apiFetch`.
- React Query keys incluyen `scope`: `['project', folder, scope]`.
- Topbar: dropdown/tabs con scope picker. Items dinámicos según `req.user.teams`.
- Index page (`PrivateIndexPage`): filtra proyectos por scope activo.
- Botón "Editar":
  - Visible si `scope === 'me'` (siempre) o `scope === 'team:X'` (siempre, todos los miembros pueden editar).
  - Oculto si `scope === 'public'`.
- Upload de archivos: deshabilitado en `public`.

**Riesgo**: cache de React Query stale si el user cambia de scope. Las keys incluyen scope, pero conviene invalidar al cambiar.

---

### Fase 5 — Comentarios por línea en vista renderizada (estilo GitHub)
**Objetivo**: en cualquier scope (incluido `public`), hacer hover sobre una línea del rendered HTML y comentarla.

- **Renderer markdown**: agregar `data-line="<n>"` a cada bloque (`<p>`, `<li>`, `<pre>`, headings). Si usamos `marked`, hay un hook `renderer` por tipo. El número de línea es el del primer renglón del bloque en el source.
- **CSS**: hover sobre `[data-line]` muestra un botón `+` flotante a la izquierda (posición sticky o absolute con offset).
- **Click en `+`**: abre un popover/inline form anclado a esa línea.
- **Submit**: POST `/api/comments` con `{ scope, file_path, line, text }`. Backend valida que el user pueda comentar en ese scope.
- **Render de comentarios existentes**: debajo del bloque correspondiente, expandidos por default (igual que reviews de GitHub PR), colapsables.
- **Migración de comentarios**: `comments.js` actual usa JSON. Script `cli/migrate-comments.js` los pasa a la tabla `comments`.
- **`SourcePage`**: revertir el bloqueo `if (isPublic) return` del `toggleForm` ahora que público también puede comentar (con login).
- Tests: comentar en public siendo user normal OK, comentar sin login 401, comentar en team sin ser miembro 403.

---

### Fase 6 — Admin UI mínima (opcional)
**Objetivo**: dejar de depender del CLI para gestión cotidiana.

- Ruta `/admin` accesible solo si `req.user.role === 'admin'`.
- Pantallas:
  - **Users**: lista, crear, eliminar, resetear password.
  - **Teams**: lista, crear, agregar/quitar miembros, eliminar.
- Formularios simples, sin diseño elaborado.

Si el CLI alcanza, esta fase queda para después.

---

## Riesgos transversales

- **Migración de prod**: la primera vez que corra Fase 3 mueve archivos en disco. **Backup obligatorio** antes. Script idempotente y con dry-run.
- **JWT_SECRET**: hoy es `dev-only-secret-do-not-use-in-prod`. Antes de Fase 1 en prod, rotar a un secret fuerte (`openssl rand -base64 64`) y forzar relogin.
- **Comentarios existentes**: hoy viven en JSON. La migración de Fase 5 los convierte a filas en `comments`. Verificar que se conserven `author`, `date`, `line`, `file`.
- **CSRF**: cookie + `sameSite=strict` ya cubre. Si abrimos comentarios sin login, revisar.
- **Rate limiting**: hoy solo en `/api/auth/login`. Para POST de comentarios agregar limiter por user/IP en Fase 5.
- **Path traversal en scopes**: cada `resolveScope` debe pasar por `isWritableDocPath`/`resolveDoc` que ya bloquea `..` y null bytes. Test explícito por scope.

---

## Orden recomendado

1. **Fase 1** (backend, invisible) → mergeable solo
2. **Fase 2** (backend, invisible) → mergeable solo
3. **Fase 3** (backend, cambia storage) → mergeable solo, requiere migración en deploy
4. **Fase 4** (frontend, cambia URLs) → anuncio al equipo
5. **Fase 5** (frontend + backend, feature visible) → la que justifica todo
6. **Fase 6** (opcional)

Cada fase termina en un estado deployable. Si pausamos entre fases, el sistema sigue funcionando.

---

## Próximo paso

Confirmar:
- [ ] Opción A para URLs (`/me`, `/t/<slug>`, `/pub`).
- [ ] Comentarios públicos requieren login (sí/no).
- [ ] Arrancar por Fase 1.
