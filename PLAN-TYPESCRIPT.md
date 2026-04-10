# Plan: migrar el backend a TypeScript

> Estado: en ejecución. Fase 1 en curso.

## Objetivo

Pasar el backend (`src/`, 8 archivos JS ESM) a TypeScript con strict mode, sin tocar el frontend (ya está en TS) y dejando el terreno preparado para el plan multi-user.

## Estado actual del backend

```
src/
  index.js              ← Express setup (104 líneas)
  lib/
    auth.js             ← JWT
    comments.js         ← JSON storage de comentarios
    config.js           ← env vars
    meta.js             ← write queue
    search-index.js
    storage.js          ← resolveDoc, path validation
    tree.js             ← file walker
  routes/
    api.js              ← rutas privadas
    public-api.js       ← rutas públicas
cli/
  docpull, docpush, docwatch  ← bash scripts (no tocar)
```

ESM puro (`"type": "module"`), corre con `node --env-file=.env --watch src/index.js`.

---

## Decisiones cerradas

| Tema | Decisión | Por qué |
|------|----------|---------|
| Runtime dev | **tsx** (`tsx watch src/index.ts`) | Cero build step en dev, mantenido activamente |
| Build prod | **tsc → `dist/`** | Estándar, sin sorpresas |
| Module config | `module: "NodeNext"`, `moduleResolution: "NodeNext"` | ESM nativo. Requiere imports con `.js` aunque el source sea `.ts` |
| Strict | `strict: true` + `noUncheckedIndexedAccess` desde día 1 | Pagás el costo de tipar bien una sola vez |
| Linting | Solo `tsc --noEmit` en CI por ahora | ESLint puede esperar |
| Shared types | Promover `client/shared/` → `shared/` raíz | Backend y frontend comparten User/Team/Comment shapes |
| Orden vs multi-user | **TS primero, después multi-user** | Si hacés multi-user en JS y migrás después, reescribís el doble |
| Validación de bodies | `zod` en Fase 3 (decisión: sí) | ~3KB, elimina una clase entera de bugs |

---

## Stack a agregar

```json
"devDependencies": {
  "typescript": "^5.6.0",
  "tsx": "^4.19.0",
  "@types/node": "^22.0.0",
  "@types/express": "^5.0.0",
  "@types/cookie-parser": "^1.4.7",
  "@types/jsonwebtoken": "^9.0.6",
  "@types/markdown-it": "^14.1.2"
}
```

### `tsconfig.server.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["./shared/*"]
    }
  },
  "include": ["src/**/*.ts", "shared/**/*.ts", "types/**/*.d.ts"],
  "exclude": ["node_modules", "dist", "client", "public"]
}
```

### `package.json` scripts (objetivo final)

```jsonc
{
  "scripts": {
    "start": "node --env-file=.env dist/index.js",
    "dev": "concurrently -n server,vite -c blue,green \"tsx watch --env-file=.env src/index.ts\" \"cd client && npm run dev\"",
    "build:server": "tsc -p tsconfig.server.json",
    "build:client": "cd client && npm run build",
    "build": "npm run build:client && npm run build:server",
    "typecheck": "tsc -p tsconfig.server.json --noEmit"
  }
}
```

---

## Fases

### Fase 1 — Setup TS sin migrar nada
- Instalar deps (`typescript`, `tsx`, `@types/*`).
- Crear `tsconfig.server.json`.
- Crear carpeta `types/express.d.ts` (vacía por ahora).
- Migrar `src/lib/config.js` → `config.ts` como smoke test.
- Actualizar `package.json` scripts (`dev`, `build:server`, `typecheck`).
- Verificar `npm run dev` arranca y `npm run build:server && npm start` produce un `dist/` que arranca.

**Punto clave**: `.js` y `.ts` conviven durante la migración. Imports cruzados funcionan porque ambos son ESM.

### Fase 2 — Migrar `src/lib/` (bottom-up)
Orden por dependencias:
1. `config.ts` (Fase 1)
2. `tree.ts` — recursive type para `TreeItem`
3. `storage.ts` — `resolveDoc`, `isWritableDocPath`
4. `comments.ts` — interface `Comment`, JSON I/O tipado
5. `meta.ts` — `WriteQueue` con `Promise<void>` chain
6. `search-index.ts`
7. `auth.ts` — payload de JWT como interface

Cada archivo es un commit. Cada commit deja `npm run typecheck` verde.

**Detalle NodeNext**: imports cruzados deben usar `.js`:
```ts
import { CONFIG } from './config.js';  // ← .js, sí, aunque el source sea .ts
```

### Fase 3 — Migrar `src/routes/`
- `routes/api.ts` y `routes/public-api.ts`.
- `types/express.d.ts` con augmentation para `req.user`:
  ```ts
  declare global {
    namespace Express {
      interface Request {
        user?: UserPayload;
      }
    }
  }
  export {};
  ```
- Helper `asyncHandler` tipado.
- `zod` para validar bodies (`PushBody`, `CommentBody`, etc).

### Fase 4 — Migrar `src/index.ts`
- `index.js` → `index.ts`.
- Actualizar `Dockerfile`:
  - Builder corre `npm run build` (incluye `build:server`).
  - Runner copia `dist/` + prod deps + `public/`.
  - `CMD ["node", "--env-file=.env", "dist/index.js"]`.
- Probar `docker build .` localmente antes de pushear.
- Eliminar todos los `.js` viejos de `src/`.

### Fase 5 — Promover `shared/` a la raíz
- `git mv client/shared shared`.
- Actualizar `paths` en `client/tsconfig.json` y alias en `client/vite.config.ts`.
- Mover tipos compartidos: `Comment`, `TreeItem`, `ProjectData`, `UserPayload`, `User`, `Team`.

### Fase 6 — Endurecer (opcional)
- `exactOptionalPropertyTypes`.
- ESLint + `@typescript-eslint`.
- `noImplicitOverride`, `noPropertyAccessFromIndexSignature`.

---

## Riesgos transversales

- **NodeNext + extensión `.js`**: regla confusa al principio. Documentar en README.
- **Dockerfile**: el step de TS puede romper el build de Coolify. Test obligatorio con `docker build .` antes de push.
- **`tsx watch` vs `node --watch`**: comportamiento equivalente, verificar reload.
- **Coexistencia `.js`/`.ts`**: funciona pero cerrar la migración rápido.
- **Express 5 types**: `@types/express ^5` cubre los nuevos signatures.

---

## Orden vs multi-user

```
TS Fase 1-4    → backend tipado mínimo
TS Fase 5      → shared/ promovido
                  ↓
Multi-user F1  → Postgres + users (ya en TS)
Multi-user F2  → Teams (ya en TS)
...
TS Fase 6      → endurecer (cuando todo está estable)
```
