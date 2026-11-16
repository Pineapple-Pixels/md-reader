import { readdir, readFile, writeFile, mkdir, stat, rename, rm } from 'fs/promises';
import { createHash, randomBytes } from 'crypto';
import { join, basename, dirname, extname, relative, resolve, sep } from 'path';
import { existsSync } from 'fs';
import { STORAGE_DIR } from './config.js';
import { isDocFile } from '../../shared/doc-types.js';
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

// Valida que `file` sea un path de doc escribible: extension de doc y sin segmentos
// vacios/traversal/ocultos. La resolucion read-only (resolveDoc) es mas permisiva
// para que leer metadatos internos siga funcionando.
export function isWritableDocPath(file: unknown): file is string {
  if (typeof file !== 'string' || !file) return false;
  if (file.includes('\0')) return false;
  if (!isDocFile(file)) return false;
  const segments = file.split(/[/\\]/);
  if (segments.some((s) => !s || s === '..' || s.startsWith('.'))) return false;
  return true;
}

export async function ensureDir(dir: string): Promise<void> {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

// Lista recursivamente todos los docs bajo `dir`. `base` es el prefijo relativo
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
    } else if (isDocFile(entry.name)) {
      const stats = await stat(join(dir, entry.name));
      files.push({ name: rel, modified: stats.mtime });
    }
  }
  return files.sort((a, b) => b.modified.getTime() - a.modified.getTime());
}

// Versions live under `<scope>/.versions/<encoded relative path>/<timestamp><ext>`,
// so two docs with the same name in different folders never share a history.
const VERSION_ID_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.(md|mdx|html)$/;

function versionsDir(filePath: string, basePath: string): string {
  const rel = relative(basePath, filePath).split(sep).join('/');
  return join(basePath, '.versions', encodeURIComponent(rel));
}

export async function saveVersion(
  filePath: string,
  content: string,
  basePath: string,
): Promise<void> {
  const dir = versionsDir(filePath, basePath);
  await ensureDir(dir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await writeFile(join(dir, `${timestamp}${extname(filePath).toLowerCase()}`), content);
}

export type VersionEntry = { id: string; savedAt: string; size: number };

// The legacy layout `.versions/<basename without .md>` is still read so older .md history stays reachable;
// it is shared by every same-named .md doc of the scope.
function readableVersionDirs(filePath: string, basePath: string): string[] {
  const dirs = [versionsDir(filePath, basePath)];
  if (extname(filePath) === '.md') dirs.push(join(basePath, '.versions', basename(filePath, '.md')));
  return [...new Set(dirs)];
}

export async function listVersions(filePath: string, basePath: string): Promise<VersionEntry[]> {
  const byId = new Map<string, VersionEntry>();
  for (const dir of readableVersionDirs(filePath, basePath)) {
    if (!existsSync(dir)) continue;
    for (const id of (await readdir(dir)).filter((n) => VERSION_ID_RE.test(n))) {
      if (byId.has(id)) continue;
      const st = await stat(join(dir, id));
      byId.set(id, { id, savedAt: st.mtime.toISOString(), size: st.size });
    }
  }
  return [...byId.values()].sort((a, b) => b.id.localeCompare(a.id));
}

/** Content of one version, or null when the id is malformed or missing. */
export async function readVersion(filePath: string, basePath: string, id: string): Promise<string | null> {
  if (!VERSION_ID_RE.test(id)) return null;
  for (const dir of readableVersionDirs(filePath, basePath)) {
    try {
      return await readFile(join(dir, id), 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  return null;
}

export function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

const fileLocks = new Map<string, Promise<unknown>>();

/** Runs `fn` after every earlier call for the same path has finished. */
// shortcut: in-process lock, assumes a single server instance; move to a DB/advisory lock if it scales out.
export function withFileLock<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
  const prev = fileLocks.get(filePath) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  const tail = run.catch(() => undefined);
  fileLocks.set(filePath, tail);
  void tail.then(() => { if (fileLocks.get(filePath) === tail) fileLocks.delete(filePath); });
  return run;
}

/** Runs `fn` holding the lock of every path, taken in sorted order so two callers never deadlock. */
export function withFileLocks<T>(filePaths: string[], fn: () => Promise<T>): Promise<T> {
  const [first, ...rest] = [...new Set(filePaths)].sort();
  return first === undefined ? fn() : withFileLock(first, () => withFileLocks(rest, fn));
}

/** Writes through a hidden temp file + rename, so readers never see a half-written doc. */
export async function writeDocAtomic(filePath: string, content: string): Promise<void> {
  await ensureDir(dirname(filePath));
  const tmp = join(dirname(filePath), `.${basename(filePath)}.${randomBytes(6).toString('hex')}.tmp`);
  await writeFile(tmp, content);
  try {
    await rename(tmp, filePath);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}
