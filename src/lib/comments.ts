import { readFile, writeFile, rename, unlink } from 'fs/promises';
import { dirname, resolve, join, sep } from 'path';
import { existsSync } from 'fs';
import { ensureDir, isWritableDocPath } from './storage.js';

export type Comment = {
  id: string;
  line?: number;
  text: string;
  author?: string;
  createdAt: string;
  [key: string]: unknown;
};

// Los comentarios viven adentro de cada scope: <basePath>/.comments/<file>.json.
// Asi se mueven solos si en el futuro movemos docs entre scopes, y el aislamiento
// queda garantizado por el mismo mecanismo de permisos del scope.

// Cola de writes per-file para serializar read-modify-write y evitar que
// requests concurrentes se pisen.
const writeQueues = new Map<string, Promise<unknown>>();

function resolveCommentsFile(basePath: string, file: string): string {
  // Las reglas de path-safety viven en storage.isWritableDocPath; las reusamos
  // aca en vez de duplicar los chequeos de segmentos/null-byte/hidden.
  if (!isWritableDocPath(file)) throw new Error('Ruta invalida');
  const commentsBase = join(basePath, '.comments');
  const commentsFile = resolve(commentsBase, `${file}.json`);
  // Defensa en profundidad: resolve() ya deberia mantenernos adentro.
  if (!commentsFile.startsWith(commentsBase + sep)) {
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
    // Best effort — si el tmp no se creo, ignoramos.
    try { await unlink(tmp); } catch { /* ignore */ }
    throw err;
  }
}

type CommentMutator = (comments: Comment[]) => Comment[] | void | Promise<Comment[] | void>;

function enqueueCommentWrite(
  basePath: string,
  file: string,
  mutator: CommentMutator,
): Promise<Comment[]> {
  const commentsFile = resolveCommentsFile(basePath, file);
  const prev = writeQueues.get(commentsFile) ?? Promise.resolve();
  const run = async (): Promise<Comment[]> => {
    const comments = await readCommentsRaw(commentsFile);
    const result = await mutator(comments);
    const next = Array.isArray(result) ? result : comments;
    await atomicWrite(commentsFile, next);
    return next;
  };
  const next = prev.then(run, run);
  // Mantenemos la cola viva incluso si un write falla; exponemos el error via
  // `next` pero evitamos que un fallo bloquee writes subsecuentes.
  writeQueues.set(
    commentsFile,
    next.catch((err) => {
      console.error('[comments] write failed:', err);
    })
  );
  return next;
}

export async function getComments(basePath: string, file: string): Promise<Comment[]> {
  let commentsFile: string;
  try {
    commentsFile = resolveCommentsFile(basePath, file);
  } catch {
    return [];
  }
  return readCommentsRaw(commentsFile);
}

export async function addComment(
  basePath: string,
  file: string,
  comment: Comment,
): Promise<Comment[]> {
  return enqueueCommentWrite(basePath, file, (comments) => {
    comments.push(comment);
  });
}

export async function deleteComment(
  basePath: string,
  file: string,
  id: string,
): Promise<Comment[]> {
  return enqueueCommentWrite(basePath, file, (comments) => {
    return comments.filter((c) => c.id !== id);
  });
}

export async function deleteAllComments(basePath: string, file: string): Promise<void> {
  let commentsFile: string;
  try {
    commentsFile = resolveCommentsFile(basePath, file);
  } catch {
    // Ruta invalida → nada que borrar.
    return;
  }
  // Serializamos con los writes en curso usando la misma cola per-file.
  const prev = writeQueues.get(commentsFile) ?? Promise.resolve();
  const run = async (): Promise<void> => {
    try {
      await unlink(commentsFile);
    } catch (err) {
      // ENOENT: no habia comentarios, nada que borrar.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  };
  const next = prev.then(run, run);
  writeQueues.set(
    commentsFile,
    next.catch((err) => {
      console.error('[comments] delete-all failed:', err);
    })
  );
  return next;
}
