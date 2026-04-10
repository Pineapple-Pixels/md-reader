import { readFile, writeFile, rename, unlink } from 'fs/promises';
import { dirname, resolve, sep } from 'path';
import { existsSync } from 'fs';
import { PUB_DIR } from './config.js';
import { ensureDir, isWritableDocPath } from './storage.js';

export type Comment = {
  id: string;
  line?: number;
  text: string;
  author?: string;
  createdAt: string;
  [key: string]: unknown;
};

const COMMENTS_BASE = resolve(PUB_DIR, '.comments');

// Per-file write queues to serialize read-modify-write operations and
// prevent concurrent requests from losing each other's changes.
const writeQueues = new Map<string, Promise<unknown>>();

function resolveCommentsFile(file: string): string {
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

async function readCommentsRaw(commentsFile: string): Promise<Comment[]> {
  if (!existsSync(commentsFile)) return [];
  const data = await readFile(commentsFile, 'utf-8');
  try {
    const parsed: unknown = JSON.parse(data);
    return Array.isArray(parsed) ? (parsed as Comment[]) : [];
  } catch (err) {
    console.error('[comments] invalid JSON in', commentsFile, (err as Error).message);
    return [];
  }
}

async function atomicWrite(commentsFile: string, comments: Comment[]): Promise<void> {
  await ensureDir(dirname(commentsFile));
  const tmp = `${commentsFile}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
  try {
    await writeFile(tmp, JSON.stringify(comments, null, 2));
    await rename(tmp, commentsFile);
  } catch (err) {
    // Mejor effort — si el tmp no existe es por que nunca se creo, ignoramos.
    try { await unlink(tmp); } catch { /* ignore */ }
    throw err;
  }
}

type CommentMutator = (comments: Comment[]) => Comment[] | void | Promise<Comment[] | void>;

function enqueueCommentWrite(file: string, mutator: CommentMutator): Promise<Comment[]> {
  const commentsFile = resolveCommentsFile(file);
  const prev = writeQueues.get(commentsFile) ?? Promise.resolve();
  const run = async (): Promise<Comment[]> => {
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

export async function getComments(file: string): Promise<Comment[]> {
  let commentsFile: string;
  try {
    commentsFile = resolveCommentsFile(file);
  } catch {
    return [];
  }
  return readCommentsRaw(commentsFile);
}

export async function addComment(file: string, comment: Comment): Promise<Comment[]> {
  return enqueueCommentWrite(file, (comments) => {
    comments.push(comment);
  });
}

export async function deleteComment(file: string, id: string): Promise<Comment[]> {
  return enqueueCommentWrite(file, (comments) => {
    return comments.filter((c) => c.id !== id);
  });
}
