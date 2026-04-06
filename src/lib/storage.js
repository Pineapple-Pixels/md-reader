import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join, dirname, basename, resolve } from 'path';
import { existsSync } from 'fs';
import { PUB_DIR } from './config.js';

export function resolveDoc(file, baseDir = PUB_DIR) {
  const resolved = resolve(baseDir, file);
  if (!resolved.startsWith(baseDir)) return null;
  return resolved;
}

export async function ensureDir(dir) {
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

export async function getFiles(dir, base = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  let files = [];
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
  return files.sort((a, b) => b.modified - a.modified);
}

export async function saveVersion(filePath, content) {
  const name = basename(filePath, '.md');
  const versionsDir = join(PUB_DIR, '.versions', name);
  await ensureDir(versionsDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await writeFile(join(versionsDir, `${timestamp}.md`), content);
}
