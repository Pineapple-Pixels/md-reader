# Auditoría de Proyecto — md-reader — 2026-04-13

**Fecha:** 2026-04-13
**Stack:** Node 22 + Express 5 + TypeScript strict, React 19 + Vite + TanStack Query, PostgreSQL 16, Docker multi-stage
**Estado general:** NECESITA ATENCIÓN

## RESUMEN EJECUTIVO

Arquitectura sólida con buena separación de capas (routes → lib → db), TypeScript strict, y seguridad base bien implementada (bcrypt, JWT httpOnly, path traversal mitigado, SQL parameterizado). Los riesgos principales son: **ausencia total de tests**, **falta de rate limiting en endpoints de comentarios**, **sin CI/CD**, y **documentación vacía**. El código tiene duplicación moderada y algunos magic numbers. Prioridad inmediata: agregar rate limiting a comentarios y crear un test suite mínimo.

## SCORECARD

| Dimensión | Estado | Nota |
|-----------|--------|------|
| Arquitectura | **OK** | Capas claras, sin circular deps, patrones consistentes |
| Calidad de código | **WARN** | Duplicación en routes/admin, magic numbers, type assertions |
| Testing | **CRIT** | 0 tests, 0 framework, 0 CI |
| Seguridad | **WARN** | SQL/path OK, falta rate limit en comments, XSS potencial en comments |
| API/Contratos | **WARN** | Zod en mutaciones OK, sin paginación, tipos compartidos incompletos |
| Dependencias | **OK** | Todo usado, versiones actuales, lock file en git |
| Documentación | **CRIT** | README vacío, sin API docs, onboarding imposible |

---

## HALLAZGOS CRÍTICOS

### 1. Sin tests — Riesgo de regresión alto
- No existen archivos `.test.ts`, `.spec.ts`, ni carpeta `__tests__/`
- No hay framework de testing instalado (vitest, jest, etc.)
- No hay script `test` en `package.json`
- **Impacto:** Cualquier refactor o fix puede romper funcionalidad sin saberlo
- **Fix:** Instalar vitest, crear tests para auth, storage, y comments como mínimo

### 2. Rate limiting ausente en comentarios
- **`src/routes/api.ts:354`** — `POST /comments` sin rate limiter
- **`src/routes/public-api.ts`** — Endpoints públicos de lectura sin límite
- Solo existe rate limiting en login (`src/index.ts:51-57`)
- **Impacto:** Spam masivo de comentarios posible
- **Fix:** Aplicar `express-rate-limit` a `/api/comments` y `/api/public/*`

### 3. README vacío — Onboarding imposible
- `README.md` sin contenido útil
- Sin guía de setup local, variables de entorno, migraciones, deploy
- **Fix:** Documentar setup, arquitectura, y scripts disponibles

---

## HALLAZGOS IMPORTANTES

### 4. Sin CI/CD
- No existe `.github/workflows/`
- ESLint instalado pero sin pipeline
- **Fix:** GitHub Actions con lint + build (y tests cuando existan)

### 5. Duplicación en routes
- `public-api.ts` y `api.ts` comparten patrón idéntico de render: readFile → md.render → respuesta
- Patrón `(err as NodeJS.ErrnoException).code` repetido 8+ veces en routes
- **Fix:** Extraer `renderDocHelper()` reutilizable y helper de error tipado

### 6. AdminPage.tsx — 450+ líneas, componentes duplicados
- `CreateUserForm`, `EditUserForm`, `CreateTeamForm` comparten ~90% de lógica
- `UsersPanel` (79 líneas), `TeamsPanel` (69 líneas), `MembersPanel` (99 líneas) mezclan fetch + state + render
- **Fix:** Extraer formulario genérico y separar en archivos

### 7. Tipos compartidos incompletos (`shared/types.ts`)
- Solo define: `SearchEntry`, `Comment`, `TeamMembership`, `AuthResponse`
- Faltan: `RenderResponse`, `UserResponse`, `TeamResponse`, respuestas de admin
- `/api/render` devuelve `{ html, comments, commentCount, canWrite, canComment }` sin tipo
- **Fix:** Agregar interfaces para todas las respuestas de API en `shared/types.ts`

### 8. Sin paginación en listados
- `GET /api/docs`, `GET /api/public/docs`, `GET /api/admin/users`, `GET /api/admin/teams` retornan arrays completos
- Aceptable para volúmenes bajos, problema a escala
- **Fix:** Agregar `?limit=&offset=` cuando el volumen lo justifique

### 9. XSS potencial en comentarios
- Campo `text` y `author` validados con Zod (largo máx) pero no sanitizados contra HTML
- `markdown-it` tiene `html: false` (correcto) — pero comentarios no pasan por markdown-it
- **Impacto:** Depende de cómo el cliente renderiza — si usa `textContent` está OK, si usa `innerHTML` es XSS
- **Fix:** Verificar que el cliente nunca use `dangerouslySetInnerHTML` con texto de comentarios, o sanitizar server-side

---

## OBSERVACIONES

### 10. Magic numbers sin constantes
- `src/routes/api.ts:32-33` — `COMMENT_TEXT_MAX = 2000`, `COMMENT_AUTHOR_MAX = 100` (definidos pero no exportados/reutilizados)
- `client/pages/DocPage.tsx:59,62` — `2000` ms en setTimeout sin constante

### 11. Type assertions abusivas
- `(err as NodeJS.ErrnoException).code` repetido en routes sin validación runtime
- `(err as Error).message?.includes()` en admin-api.ts (líneas 173, 214, 244)
- `as T` cast directo sin validación en `shared/api.ts:56` (apiFetch)
- **Fix:** Helper tipado: `function isNodeError(err: unknown): err is NodeJS.ErrnoException`

### 12. Cookie `secure` solo en producción
- `src/index.ts:109-114` — `secure: process.env['NODE_ENV'] === 'production'`
- En dev las cookies viajan por HTTP (esperado, no es bug)

### 13. Naming inconsistente menor
- Exports mixtos: default en routes, named en lib
- `import type` usado en server, inconsistente en client

---

## LO QUE ESTÁ BIEN

- **Arquitectura limpia:** Separación routes → lib → db sin circular dependencies
- **TypeScript strict:** `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- **SQL seguro:** postgres.js con template literals parametrizados — SQL injection imposible
- **Path traversal mitigado:** `resolveDoc()` valida con `resolve()` + `startsWith()` check
- **Auth robusto:** bcrypt cost 12, JWT httpOnly + secure + sameSite strict, hydrate cache con TTL
- **Admin protegido:** Doble middleware `requireAuth` + role check, self-delete prevention
- **Zod en mutaciones:** Todas las rutas POST/PATCH/DELETE validan con Zod schemas
- **Scope isolation:** Users no pueden acceder a archivos de otros users/teams
- **Docker multi-stage:** Builder → prod optimizado, node:22-alpine actualizado
- **Deps limpias:** Todas usadas, versiones actuales, lock file versionado
- **Migraciones idempotentes:** `IF NOT EXISTS`, tracking de ejecución

---

## PLAN DE ACCIÓN RECOMENDADO

### Prioridad 1 — Seguridad (esta semana)
1. **Rate limiting en comentarios** — Aplicar limiter a `POST /api/comments` y rutas públicas
2. **Sanitizar comentarios** — Verificar que el cliente no renderiza HTML de comentarios, o escapar server-side

### Prioridad 2 — Calidad (próxima semana)
3. **Testing mínimo** — Instalar vitest, tests para: auth (login/JWT), storage (resolveDoc/path traversal), comments (CRUD), admin API (CRUD + permisos)
4. **CI básico** — GitHub Actions: `npm run lint && npm run build`

### Prioridad 3 — Mantenimiento
5. **README** — Setup local, env vars, migraciones, scripts, arquitectura
6. **Refactor duplicación** — Extraer renderDocHelper, error handler tipado, AdminPage en sub-archivos
7. **Tipos compartidos** — Completar `shared/types.ts` con todas las respuestas de API

### Prioridad 4 — Nice to have
8. Paginación en listados cuando el volumen crezca
9. OpenAPI/Swagger para documentar endpoints
10. Logging estructurado (reemplazar console.error)
