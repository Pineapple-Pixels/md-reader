import { readFile } from 'fs/promises';
import { sql } from './db.js';
import { isDocFile } from '../../shared/doc-types.js';
import type { DocOrigin } from '../../shared/types.js';
import { getFiles, resolveDoc, saveVersion, withFileLock, writeDocAtomic, type ResolvedScope } from './storage.js';
import { statOrNull, isEnoent } from './route-helpers.js';

/** Relative doc or folder path without empty, traversal or hidden segments. */
export function isSafeRelPath(p: string): boolean {
  if (!p || p.includes('\0')) return false;
  return p.split(/[/\\]/).every((s) => s && s !== '..' && !s.startsWith('.'));
}

export type CopyResult =
  | { status: 'copied'; files: string[] }
  | { status: 'conflict'; files: string[] }
  | { status: 'not-found' };

/**
 * Copies a doc or a folder of docs from one scope to another, at the same relative path.
 * Existing targets are a conflict unless `overwrite`; overwritten content goes to the target's history.
 */
export async function copyDocs(
  src: ResolvedScope,
  file: string,
  dest: ResolvedScope,
  opts: { overwrite: boolean; fromLabel: string; byUserId: number },
): Promise<CopyResult> {
  const srcPath = resolveDoc(file, src.basePath);
  const stats = srcPath ? await statOrNull(srcPath) : null;
  if (!srcPath || !stats) return { status: 'not-found' };
  const files = stats.isDirectory()
    ? (await getFiles(srcPath, file)).map((f) => f.name)
    : isDocFile(file) ? [file] : [];
  if (files.length === 0) return { status: 'not-found' };

  const targets = files.map((f) => ({ rel: f, from: resolveDoc(f, src.basePath)!, to: resolveDoc(f, dest.basePath)! }));
  if (targets.some((t) => !t.from || !t.to)) return { status: 'not-found' };

  if (!opts.overwrite) {
    const existing = (await Promise.all(targets.map(async (t) => ((await statOrNull(t.to)) ? t.rel : null))))
      .filter((f): f is string => f !== null);
    if (existing.length > 0) return { status: 'conflict', files: existing };
  }

  for (const t of targets) {
    const content = await readFile(t.from, 'utf-8');
    await withFileLock(t.to, async () => {
      const old = await readFile(t.to, 'utf-8').catch((err: unknown) => { if (isEnoent(err)) return null; throw err; });
      if (old !== null) await saveVersion(t.to, old, dest.basePath);
      await writeDocAtomic(t.to, content);
    });
    await sql`
      INSERT INTO doc_origins (scope_id, path, from_label, from_path, by_user_id)
      VALUES (${dest.id}, ${t.rel}, ${opts.fromLabel}, ${t.rel}, ${opts.byUserId})
      ON CONFLICT (scope_id, path) DO UPDATE
        SET from_label = EXCLUDED.from_label, from_path = EXCLUDED.from_path,
            by_user_id = EXCLUDED.by_user_id, created_at = now()
    `;
  }
  return { status: 'copied', files };
}

export async function getOrigin(scopeId: string, path: string): Promise<DocOrigin | null> {
  const rows = await sql<{ from_label: string; from_path: string; username: string | null; created_at: Date }[]>`
    SELECT o.from_label, o.from_path, u.username, o.created_at
    FROM doc_origins o LEFT JOIN users u ON u.id = o.by_user_id
    WHERE o.scope_id = ${scopeId} AND o.path = ${path}
  `;
  const r = rows[0];
  return r ? { fromLabel: r.from_label, fromPath: r.from_path, by: r.username, at: r.created_at.toISOString() } : null;
}

/** Forgets the origin of a doc, or of every doc under a folder. */
export async function deleteOrigins(scopeId: string, path: string): Promise<void> {
  const prefix = `${path.replace(/[\\%_]/g, '\\$&')}/%`;
  await sql`DELETE FROM doc_origins WHERE scope_id = ${scopeId} AND (path = ${path} OR path LIKE ${prefix})`;
}
