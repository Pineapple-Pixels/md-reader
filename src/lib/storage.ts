import { readdir, writeFile, mkdir, stat } from 'fs/promises';
import { join, basename, resolve } from 'path';
import { existsSync } from 'fs';
import { PUB_DIR } from './config.js';

export type FileEntry = {
  name: string;
  modified: Date;
};

export function resolveDoc(file: string, baseDir: string = PUB_DIR): string | null {
  const resolved = resolve(baseDir, file);
  if (!resolved.startsWith(baseDir)) return null;
  return resolved;
}

// Validates that `file` is a writable doc path: must be a .md file and must
// not traverse into hidden segments (.meta.json, .versions/, .comments/, etc).
// Read-only resolveDoc() is intentionally more permissive so existing metadata
// reads keep working.
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

export async function getFiles(dir: string, base = ''): Promise<FileEntry[]> {
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

export async function saveVersion(filePath: string, content: string): Promise<void> {
  const name = basename(filePath, '.md');
  const versionsDir = join(PUB_DIR, '.versions', name);
  await ensureDir(versionsDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await writeFile(join(versionsDir, `${timestamp}.md`), content);
}
