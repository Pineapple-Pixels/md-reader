import { readFile, writeFile, rename, unlink } from 'fs/promises';
import { dirname, resolve, sep } from 'path';
import { existsSync } from 'fs';
import { PUB_DIR } from './config.js';
import { ensureDir, isWritableDocPath } from './storage.js';

const COMMENTS_BASE = resolve(PUB_DIR, '.comments');

// Per-file write queues to serialize read-modify-write operations and
// prevent concurrent requests from losing each other's changes.
const writeQueues = new Map();

function resolveCommentsFile(file) {
  // Path-safety rules live in storage.isWritableDocPath; reuse instead of
  // duplicating the segment/null-byte/hidden checks here.
  if (!isWritableDocPath(file)) throw new Error('Ruta invalida');
  const commentsFile = resolve(COMMENTS_BASE, `${file}.json`);
  // Defense in depth — resolve() should already keep us inside COMMENTS_BASE.
  if (!commentsFile.startsWith(COMMENTS_BASE + sep)) {
    throw new Error('Ruta invalida');
  }
  return commentsFile;
}

async function readCommentsRaw(commentsFile) {
  if (!existsSync(commentsFile)) return [];
  const data = await readFile(commentsFile, 'utf-8');
  try {
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[comments] invalid JSON in', commentsFile, err.message);
    return [];
  }
}

async function atomicWrite(commentsFile, comments) {
  await ensureDir(dirname(commentsFile));
  const tmp = `${commentsFile}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
  try {
    await writeFile(tmp, JSON.stringify(comments, null, 2));
    await rename(tmp, commentsFile);
  } catch (err) {
    try { await unlink(tmp); } catch {}
    throw err;
  }
}

function enqueueCommentWrite(file, mutator) {
  const commentsFile = resolveCommentsFile(file);
  const prev = writeQueues.get(commentsFile) || Promise.resolve();
  const run = async () => {
    const comments = await readCommentsRaw(commentsFile);
    const result = await mutator(comments);
    const next = Array.isArray(result) ? result : comments;
    await atomicWrite(commentsFile, next);
    return next;
  };
  const next = prev.then(run, run);
  // Keep the queue alive even if a write fails; surface the failure to the
  // caller via `next` but prevent one failure from blocking further writes.
  writeQueues.set(
    commentsFile,
    next.catch((err) => {
      console.error('[comments] write failed:', err);
    })
  );
  return next;
}

export async function getComments(file) {
  let commentsFile;
  try {
    commentsFile = resolveCommentsFile(file);
  } catch {
    return [];
  }
  return readCommentsRaw(commentsFile);
}

export async function addComment(file, comment) {
  return enqueueCommentWrite(file, (comments) => {
    comments.push(comment);
  });
}

export async function deleteComment(file, id) {
  return enqueueCommentWrite(file, (comments) => {
    return comments.filter((c) => c.id !== id);
  });
}
