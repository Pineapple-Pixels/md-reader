import { readFile, writeFile } from 'fs/promises';
import { dirname, resolve, sep } from 'path';
import { existsSync } from 'fs';
import { PUB_DIR } from './config.js';
import { ensureDir } from './storage.js';

const COMMENTS_BASE = resolve(PUB_DIR, '.comments');

function resolveCommentsFile(file) {
  if (typeof file !== 'string' || !file) throw new Error('Ruta invalida');
  if (file.includes('\0')) throw new Error('Ruta invalida');
  if (file.startsWith('/') || file.startsWith('\\')) throw new Error('Ruta invalida');
  const segments = file.split(/[/\\]/);
  if (segments.some(s => s === '..')) throw new Error('Ruta invalida');
  const commentsFile = resolve(COMMENTS_BASE, `${file}.json`);
  if (!commentsFile.startsWith(COMMENTS_BASE + sep)) {
    throw new Error('Ruta invalida');
  }
  return commentsFile;
}

export async function getComments(file) {
  let commentsFile;
  try {
    commentsFile = resolveCommentsFile(file);
  } catch {
    return [];
  }
  if (!existsSync(commentsFile)) return [];
  const data = await readFile(commentsFile, 'utf-8');
  return JSON.parse(data);
}

export async function saveComments(file, comments) {
  const commentsFile = resolveCommentsFile(file);
  await ensureDir(dirname(commentsFile));
  await writeFile(commentsFile, JSON.stringify(comments, null, 2));
}
