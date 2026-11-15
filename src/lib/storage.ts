import { readdir, writeFile, mkdir, stat, rename } from 'fs/promises';
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
// Every scope lives inside one organization: STORAGE_DIR/orgs/<org>/{users,teams,public}.
//   - `me`             → the user's private docs
//   - `team:<slug>`    → the team's docs (members only)
//   - `public`         → the user's org public docs
//   - `public:<org>`   → an org's public docs (read by anyone, written by its admins)

export type ScopeKind = 'me' | 'team' | 'public';

export type ResolvedScope = {
  kind: ScopeKind;
  /** Canonical id for comments and caches: '<org>/me:<userId>', '<org>/team:<slug>', '<org>/public'. */
  id: string;
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

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export function isSlug(s: string): boolean {
  return SLUG_RE.test(s) && s.length <= 50;
}

export function orgDir(orgSlug: string): string {
  return join(STORAGE_DIR, 'orgs', orgSlug);
}

/** Public scope of an org; `user` only grants write/comment when they belong to it. */
export function publicScope(orgSlug: string, user: AuthUser | undefined): ResolvedScope {
  if (!isSlug(orgSlug)) throw new ScopeError('Organizacion invalida', 400);
  const sameOrg = user?.orgSlug === orgSlug;
  return {
    kind: 'public',
    id: `${orgSlug}/public`,
    basePath: join(orgDir(orgSlug), 'public'),
    canWrite: sameOrg && user?.role === 'admin',
    canComment: sameOrg,
  };
}

// Throws ScopeError with the matching HTTP status when the scope is invalid or forbidden.
export function resolveScope(
  scopeStr: string | null | undefined,
  user: AuthUser | undefined,
): ResolvedScope {
  if (!scopeStr) {
    throw new ScopeError('scope es requerido (me | team:<slug> | public)', 400);
  }

  if (scopeStr.startsWith('public:')) return publicScope(scopeStr.slice('public:'.length).toLowerCase(), user);

  if (!user) throw new ScopeError('No autorizado', 401);
  const org = user.orgSlug;
  if (!org) throw new ScopeError('Todavia no perteneces a ninguna organizacion', 403);

  if (scopeStr === 'public') return publicScope(org, user);

  if (scopeStr === 'me') {
    return {
      kind: 'me',
      id: `${org}/me:${user.userId}`,
      basePath: join(orgDir(org), 'users', String(user.userId)),
      canWrite: true,
      canComment: true,
    };
  }

  if (scopeStr.startsWith('team:')) {
    const slug = scopeStr.slice('team:'.length).toLowerCase();
    if (!isSlug(slug)) throw new ScopeError('Slug de team invalido', 400);
    // user.teams only holds teams of the user's own org (see listTeamsForUser).
    if (!user.teams.some((t) => t.slug.toLowerCase() === slug)) {
      throw new ScopeError('No sos miembro de este team', 403);
    }
    return {
      kind: 'team',
      id: `${org}/team:${slug}`,
      basePath: join(orgDir(org), 'teams', slug),
      canWrite: true,
      canComment: true,
    };
  }

  throw new ScopeError('scope invalido', 400);
}

/**
 * Moves pre-organization storage (STORAGE_DIR/{users,teams,public}) into the default org.
 * Idempotent; never overwrites an existing destination.
 */
export async function migrateLegacyStorage(defaultOrgSlug: string): Promise<string[]> {
  const moved: string[] = [];
  for (const name of ['users', 'teams', 'public']) {
    const from = join(STORAGE_DIR, name);
    const to = join(orgDir(defaultOrgSlug), name);
    if (!existsSync(from) || existsSync(to)) continue;
    await ensureDir(orgDir(defaultOrgSlug));
    await rename(from, to);
    moved.push(name);
  }
  return moved;
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
