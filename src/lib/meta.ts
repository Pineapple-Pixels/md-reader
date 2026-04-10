import { readFile, writeFile, rename, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { PUB_DIR } from './config.js';
import type { FileEntry } from './storage.js';

export type MetaEntry = {
  public?: boolean;
};

export type Meta = Record<string, MetaEntry>;

const META_FILE = join(PUB_DIR, '.meta.json');

let cache: Meta | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();

async function loadMeta(): Promise<Meta> {
  if (cache) return cache;
  if (!existsSync(META_FILE)) {
    cache = {};
    return cache;
  }
  const data = await readFile(META_FILE, 'utf-8');
  cache = JSON.parse(data) as Meta;
  return cache;
}

async function atomicWrite(meta: Meta): Promise<void> {
  const tmp = `${META_FILE}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
  try {
    await writeFile(tmp, JSON.stringify(meta, null, 2));
    await rename(tmp, META_FILE);
  } catch (err) {
    // Mejor effort — si el tmp no existe es por que nunca se creo, ignoramos.
    try { await unlink(tmp); } catch { /* ignore */ }
    throw err;
  }
}

function enqueueWrite<T>(mutator: (meta: Meta) => T | Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const meta = await loadMeta();
    const result = await mutator(meta);
    await atomicWrite(meta);
    cache = meta;
    return result;
  };
  const next = writeQueue.then(run, run);
  // Keep the queue alive even if a write fails, but surface the failure.
  // Callers still receive the rejection via `next` — this catch only prevents
  // a single failure from blocking subsequent writes.
  writeQueue = next.catch((err) => {
    console.error('[meta] write failed:', err);
  });
  return next;
}

export async function isPublic(file: string): Promise<boolean> {
  const meta = await loadMeta();
  return meta[file]?.public === true;
}

export async function setVisibility(file: string, isPublic: boolean): Promise<void> {
  await enqueueWrite<void>((meta) => {
    const entry = meta[file] ?? {};
    entry.public = isPublic;
    meta[file] = entry;
  });
}

export async function toggleVisibility(file: string): Promise<boolean> {
  return enqueueWrite<boolean>((meta) => {
    const entry = meta[file] ?? {};
    entry.public = !(entry.public === true);
    meta[file] = entry;
    return entry.public;
  });
}

export async function getPublicFiles(allFiles: FileEntry[]): Promise<FileEntry[]> {
  const meta = await loadMeta();
  return allFiles.filter((f) => meta[f.name]?.public === true);
}

export async function getMeta(): Promise<Meta> {
  return loadMeta();
}

export async function removeMeta(file: string): Promise<void> {
  await enqueueWrite<void>((meta) => {
    delete meta[file];
  });
}
