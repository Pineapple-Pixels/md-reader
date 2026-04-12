import { readdir, writeFile, mkdir, stat } from 'fs/promises';
import { join, basename, resolve, sep } from 'path';
import { existsSync } from 'fs';
import { STORAGE_DIR } from './config.js';
import type { AuthUser } from './auth.js';

export type FileEntry = {
  name: string;
  modified: Date;
};

// -----------------------------------------------------------------------------
// Scopes
// -----------------------------------------------------------------------------
// Un scope es el contenedor logico de docs. Hay tres tipos:
//   - `me`           → docs privados del user actual
//   - `team:<slug>`  → docs del team (solo miembros)
//   - `public`       → docs visibles para todos (admin puede escribir)
//
// Representamos el scope resuelto con un objeto que carga el path fisico, la
// identidad del scope y los permisos calculados para el user que lo pidio.
// Las rutas del API llaman a `resolveScope(req.query.scope, req.user)` una vez
// y despues pasan `scope.basePath` a las funciones de storage.

export type ScopeKind = 'me' | 'team' | 'public';

export type ResolvedScope = {
  kind: ScopeKind;
  // Identificador canonico para routing y cache keys: 'me:<userId>', 'team:<slug>', 'public'.
  id: string;
  // Directorio raiz del scope en disco.
  basePath: string;
  canWrite: boolean;
  canComment: boolean;
};

export class ScopeError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TEAM_SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

// Parsea el query param `scope` y calcula permisos para el user dado.
// `user` puede ser undefined para llamadas publicas (ver public-api.ts).
// Tira ScopeError con status HTTP apropiado si el scope es invalido o el user
// no tiene permiso para verlo.
export function resolveScope(
  scopeStr: string | null | undefined,
  user: AuthUser | undefined,
): ResolvedScope {
  if (!scopeStr) {
    throw new ScopeError('scope es requerido (me | team:<slug> | public)', 400);
  }

  // Scope publico: lectura sin auth, escritura solo admin logueado.
  if (scopeStr === 'public') {
    return {
      kind: 'public',
      id: 'public',
      basePath: join(STORAGE_DIR, 'public'),
      canWrite: user?.role === 'admin',
      canComment: !!user, // cualquier user logueado puede comentar
    };
  }

  // Scope privado del user.
  if (scopeStr === 'me') {
    if (!user) throw new ScopeError('No autorizado', 401);
    return {
      kind: 'me',
      id: `me:${user.userId}`,
      basePath: join(STORAGE_DIR, 'users', String(user.userId)),
      canWrite: true,
      canComment: true,
    };
  }

  // Scope de team: 'team:<slug>'.
  if (scopeStr.startsWith('team:')) {
    if (!user) throw new ScopeError('No autorizado', 401);
    const slug = scopeStr.slice('team:'.length).toLowerCase();
    if (!slug || !TEAM_SLUG_RE.test(slug) || slug.length > 50) {
      throw new ScopeError('Slug de team invalido', 400);
    }
    const membership = user.teams.find((t) => t.slug.toLowerCase() === slug);
    if (!membership) {
      throw new ScopeError('No sos miembro de este team', 403);
    }
    return {
      kind: 'team',
      id: `team:${slug}`,
      basePath: join(STORAGE_DIR, 'teams', slug),
      canWrite: true, // todos los miembros pueden escribir (rol admin/member ambos)
      canComment: true,
    };
  }

  throw new ScopeError('scope invalido', 400);
}

// -----------------------------------------------------------------------------
// Path resolution (scope-aware)
// -----------------------------------------------------------------------------

// Resuelve `file` contra el basePath del scope, garantizando que no se
// escape del directorio. El callsite debe pasar `scope.basePath`.
export function resolveDoc(file: string, basePath: string): string | null {
  const resolved = resolve(basePath, file);
  // Normalizamos para evitar que "storage/public" matchee "storage/public-evil".
  if (resolved !== basePath && !resolved.startsWith(basePath + sep)) return null;
  return resolved;
}

// Valida que `file` sea un path de doc escribible: extension .md y sin segmentos
// vacios/traversal/ocultos. La resolucion read-only (resolveDoc) es mas permisiva
// para que leer metadatos internos siga funcionando.
export function isWritableDocPath(file: unknown): file is string {
  if (typeof file !== 'string' || !file) return false;
  if (file.includes('\0')) return false;
  if (!file.endsWith('.md')) return false;
  const segments = file.split(/[/\\]/);
  if (segments.some((s) => !s || s === '..' || s.startsWith('.'))) return false;
  return true;
}

export async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

// Lista recursivamente todos los .md bajo `dir`. `base` es el prefijo relativo
// que se acumula en los nombres retornados. Skipea archivos ocultos (empiezan
// con punto) para no exponer .comments/.versions.
export async function getFiles(dir: string, base = ''): Promise<FileEntry[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  let files: FileEntry[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files = files.concat(await getFiles(join(dir, entry.name), rel));
    } else if (entry.name.endsWith('.md')) {
      const stats = await stat(join(dir, entry.name));
      files.push({ name: rel, modified: stats.mtime });
    }
  }
  return files.sort((a, b) => b.modified.getTime() - a.modified.getTime());
}

// Guarda una copia versionada del archivo bajo `<scope>/.versions/<name>/<ts>.md`.
// `filePath` es el path absoluto al archivo; `basePath` es el scope.basePath.
export async function saveVersion(
  filePath: string,
  content: string,
  basePath: string,
): Promise<void> {
  const name = basename(filePath, '.md');
  const versionsDir = join(basePath, '.versions', name);
  await ensureDir(versionsDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await writeFile(join(versionsDir, `${timestamp}.md`), content);
}
