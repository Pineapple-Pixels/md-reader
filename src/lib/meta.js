import { readFile, writeFile, rename, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { PUB_DIR } from './config.js';

const META_FILE = join(PUB_DIR, '.meta.json');

let cache = null;
let writeQueue = Promise.resolve();

async function loadMeta() {
  if (cache) return cache;
  if (!existsSync(META_FILE)) {
    cache = {};
    return cache;
  }
  const data = await readFile(META_FILE, 'utf-8');
  cache = JSON.parse(data);
  return cache;
}

async function atomicWrite(meta) {
  const tmp = `${META_FILE}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
  try {
    await writeFile(tmp, JSON.stringify(meta, null, 2));
    await rename(tmp, META_FILE);
  } catch (err) {
    try { await unlink(tmp); } catch {}
    throw err;
  }
}

function enqueueWrite(mutator) {
  const run = async () => {
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

export async function isPublic(file) {
  const meta = await loadMeta();
  return meta[file]?.public === true;
}

export async function setVisibility(file, isPublic) {
  await enqueueWrite((meta) => {
    if (!meta[file]) meta[file] = {};
    meta[file].public = isPublic;
  });
}

export async function toggleVisibility(file) {
  return enqueueWrite((meta) => {
    const current = meta[file]?.public === true;
    if (!meta[file]) meta[file] = {};
    meta[file].public = !current;
    return meta[file].public;
  });
}

export async function getPublicFiles(allFiles) {
  const meta = await loadMeta();
  return allFiles.filter(f => meta[f.name]?.public === true);
}

export async function getMeta() {
  return loadMeta();
}

export async function removeMeta(file) {
  await enqueueWrite((meta) => {
    delete meta[file];
  });
}
