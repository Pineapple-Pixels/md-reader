import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { PUB_DIR } from './config.js';
import { ensureDir } from './storage.js';

export async function getComments(file) {
  const commentsFile = join(PUB_DIR, '.comments', `${file}.json`);
  if (!existsSync(commentsFile)) return [];
  const data = await readFile(commentsFile, 'utf-8');
  return JSON.parse(data);
}

export async function saveComments(file, comments) {
  const commentsFile = join(PUB_DIR, '.comments', `${file}.json`);
  await ensureDir(dirname(commentsFile));
  await writeFile(commentsFile, JSON.stringify(comments, null, 2));
}
