import { Router } from 'express';
import type { Response } from 'express';
import { readFile, writeFile, unlink, rm } from 'fs/promises';
import { dirname } from 'path';
import archiver from 'archiver';
import { z } from 'zod';
import { renderDoc, sendHtmlFrame } from '../lib/render.js';
import { sendDocx } from '../lib/docx.js';
import { copyDocs, deleteOrigins, getOrigin, isSafeRelPath } from '../lib/share.js';
import { docKind } from '../../shared/doc-types.js';
import {
  resolveDoc,
  getFiles,
  ensureDir,
  saveVersion,
  listVersions,
  readVersion,
  contentHash,
  withFileLock,
  writeDocAtomic,
  isWritableDocPath,
  resolveScope,
  publicScope,
  ScopeError,
} from '../lib/storage.js';
import type { ResolvedScope } from '../lib/storage.js';
import {
  getComments,
  addComment,
  getComment,
  deleteComment,
  deleteAllComments,
} from '../lib/comments.js';
import { requireAuth } from '../lib/auth.js';
import { getSearchIndex, invalidateSearchIndex } from '../lib/search-index.js';
import { buildTree, findMainPage, flattenTree } from '../lib/tree.js';
import { ah, statOrNull, isEnoent, queryString, readDocFile, NotFileError, parsePagination } from '../lib/route-helpers.js';
import { logger } from '../lib/logger.js';

const router = Router();

// Limits on user-provided comment fields
const COMMENT_TEXT_MAX = 2000;
const COMMENT_AUTHOR_MAX = 100;

// ----- Body schemas (zod) -----
// El scope viaja siempre como query param (no body) para mantener semantica REST
// uniforme entre GET y POST. Los bodies solo cargan datos del doc.
const FileContentBody = z.object({
  file: z.string().min(1),
  content: z.string(),
  /** Refuse (409) instead of overwriting an existing doc. */
  createOnly: z.boolean().optional(),
});

const FileBody = z.object({
  file: z.string().min(1),
});

const SaveBody = z.object({
  file: z.string().min(1),
  content: z.string(),
  /** Hash of the content the editor started from (from /pull); a mismatch means someone else saved. */
  baseHash: z.string().regex(/^[a-f0-9]{64}$/),
  force: z.boolean().optional(),
});

const ShareBody = z.object({
  file: z.string().min(1),
  /** Slug of the destination team. */
  to: z.string().min(1),
  overwrite: z.boolean().optional(),
});

const RestoreBody = z.object({
  file: z.string().min(1),
  id: z.string().min(1),
});

const CommentBody = z.object({
  file: z.string().min(1),
  text: z.string().trim().min(1).max(COMMENT_TEXT_MAX),
  // `null`, `undefined` o `""` → sin linea; entero positivo si viene
  line: z
    .union([z.number().int().positive(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isInteger(n) && n >= 1 ? n : NaN;
    })
    .refine((v) => v === null || Number.isInteger(v), {
      message: 'line debe ser un entero positivo',
    }),
  author: z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === null) return 'Anonimo';
      const trimmed = v.trim().slice(0, COMMENT_AUTHOR_MAX);
      return trimmed || 'Anonimo';
    }),
});

const CommentDeleteBody = z.object({
  file: z.string().min(1),
  id: z.string().min(1),
});

const PublishBody = z.object({
  file: z.string().min(1),
  overwrite: z.boolean().optional(),
});

// All private API routes require cookie auth.
router.use(requireAuth);

// Helper: resuelve el scope del query o manda el error HTTP apropiado.
// Retorna null si falla para que el handler pueda hacer `if (!scope) return;`.
function getScope(req: import('express').Request, res: Response): ResolvedScope | null {
  try {
    return resolveScope(queryString(req.query['scope']), req.user);
  } catch (err) {
    if (err instanceof ScopeError) {
      res.status(err.status).json({ error: err.message });
      return null;
    }
    throw err;
  }
}

// Guard de escritura — usar despues de getScope.
function assertWritable(scope: ResolvedScope, res: Response): boolean {
  if (!scope.canWrite) {
    res.status(403).json({ error: 'No tenes permiso de escritura en este scope' });
    return false;
  }
  return true;
}

async function readOrNull(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
}

/** Absolute path of a writable doc path inside the scope, or null after sending a 400. */
function writableDocPath(file: string | null | undefined, scope: ResolvedScope, res: Response): string | null {
  const filePath = file && isWritableDocPath(file) ? resolveDoc(file, scope.basePath) : null;
  if (!filePath) res.status(400).json({ error: 'Ruta invalida' });
  return filePath;
}

// Search index
router.get('/search-index', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const index = await getSearchIndex(scope.id, scope.basePath);
  res.json(index);
}));

// List all docs
router.get('/docs', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const files = await getFiles(scope.basePath);
  res.json(files);
}));

// Render a single doc to HTML
router.get('/render', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readDocFile(filePath); }
  catch (err) {
    if (err instanceof NotFileError) return res.status(404).json({ error: 'Archivo no encontrado' });
    throw err;
  }
  const { kind, html } = renderDoc(file, content);
  const [{ data: comments, total: commentCount }, origin] = await Promise.all([getComments(scope.id, file), getOrigin(scope.id, file)]);
  res.json({ kind, html, comments, commentCount, canWrite: scope.canWrite, canComment: scope.canComment, origin });
}));

router.get('/export/docx', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  await sendDocx(res, scope, queryString(req.query['file']));
}));

// Raw HTML document, isolated by a CSP sandbox (shown by the client inside an iframe).
router.get('/frame', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const file = queryString(req.query['file']);
  if (!file || docKind(file) !== 'html') return res.status(400).json({ error: 'Solo documentos .html' });
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  try { sendHtmlFrame(res, await readDocFile(filePath)); }
  catch (err) {
    if (err instanceof NotFileError) return res.status(404).json({ error: 'Archivo no encontrado' });
    throw err;
  }
}));

// Download doc (file) or project (folder → .zip with all its docs)
router.get('/download', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  const stats = await statOrNull(filePath);
  if (!stats) return res.status(404).json({ error: 'Archivo no encontrado' });

  // Folder → stream a zip with all docs preserving structure.
  if (stats.isDirectory()) {
    const rawFolder = file.replace(/[/\\]+$/, '').split(/[/\\]/).pop() ?? 'project';
    const safeFolder = rawFolder.replace(/[^a-zA-Z0-9._-]/g, '') || 'project';
    res.setHeader('Content-Disposition', `attachment; filename="${safeFolder}.zip"`);
    res.type('application/zip');

    const archive = archiver('zip', { zlib: { level: 9 } });
    // If archiver fails mid-stream the response is already partially sent;
    // destroy the socket so the client sees a broken download instead of a
    // silently truncated zip, and log for diagnosis.
    archive.on('error', (err) => {
      logger.error('download', 'archive error', { err: String(err) });
      res.destroy(err);
    });
    archive.pipe(res);
    archive.glob('**/*.{md,mdx,html}', { cwd: filePath, dot: false }, { prefix: safeFolder });
    await archive.finalize();
    return;
  }

  // Single file → markdown download.
  let content: string;
  try { content = await readFile(filePath, 'utf-8'); }
  catch (err) {
    if (isEnoent(err)) return res.status(404).json({ error: 'Archivo no encontrado' });
    throw err;
  }
  const rawName = file.split('/').pop();
  const safeName = (rawName ?? '').replace(/[^a-zA-Z0-9._-]/g, '') || 'document.md';
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.type(docKind(file) === 'html' ? 'application/octet-stream' : 'text/markdown').send(content);
}));

// Upload/push doc (crear o sobrescribir — usa versionado como backup)
router.post('/push', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  if (!assertWritable(scope, res)) return;
  const parsed = FileContentBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'file y content son requeridos' });
  const { file, content, createOnly } = parsed.data;
  if (!isWritableDocPath(file)) return res.status(400).json({ error: 'Ruta invalida' });
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  const written = await withFileLock(filePath, async () => {
    const old = await readOrNull(filePath);
    if (old !== null && createOnly) return false;
    if (old !== null) await saveVersion(filePath, old, scope.basePath);
    await writeDocAtomic(filePath, content);
    return true;
  });
  if (!written) return res.status(409).json({ error: 'Ya existe un documento con ese nombre', conflict: true });
  invalidateSearchIndex(scope.id);
  res.json({ ok: true });
}));

// Save an edited doc. Refuses (409) when the file changed since the editor loaded it,
// unless `force`; the overwritten content always stays in the history.
router.post('/save', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  if (!assertWritable(scope, res)) return;
  const parsed = SaveBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'file, content y baseHash son requeridos' });
  const { file, content, baseHash, force } = parsed.data;
  if (!isWritableDocPath(file)) return res.status(400).json({ error: 'Ruta invalida' });
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  const outcome = await withFileLock(filePath, async () => {
    const current = await readOrNull(filePath);
    if (!force && (current === null || contentHash(current) !== baseHash)) {
      return current === null ? 'deleted' : 'changed';
    }
    if (current !== null) await saveVersion(filePath, current, scope.basePath);
    await writeDocAtomic(filePath, content);
    return 'saved';
  });
  if (outcome !== 'saved') {
    return res.status(409).json({
      error: outcome === 'deleted' ? 'El documento fue eliminado mientras editabas' : 'Alguien guardo otra version mientras editabas',
      conflict: true,
      deleted: outcome === 'deleted',
    });
  }
  invalidateSearchIndex(scope.id);
  res.json({ ok: true, hash: contentHash(content) });
}));

// Saved versions of a doc, newest first.
router.get('/versions', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  if (!assertWritable(scope, res)) return;
  const filePath = writableDocPath(queryString(req.query['file']), scope, res);
  if (!filePath) return;
  res.json(await listVersions(filePath, scope.basePath));
}));

router.get('/version', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  if (!assertWritable(scope, res)) return;
  const file = queryString(req.query['file']);
  const filePath = writableDocPath(file, scope, res);
  if (!filePath) return;
  const content = await readVersion(filePath, scope.basePath, queryString(req.query['id']) ?? '');
  if (content === null) return res.status(404).json({ error: 'Version no encontrada' });
  res.json({ content, ...renderDoc(file!, content) });
}));

// Restore a version; the content it replaces becomes a version itself.
router.post('/versions/restore', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  if (!assertWritable(scope, res)) return;
  const parsed = RestoreBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'file e id son requeridos' });
  const filePath = writableDocPath(parsed.data.file, scope, res);
  if (!filePath) return;
  const restored = await withFileLock(filePath, async () => {
    const content = await readVersion(filePath, scope.basePath, parsed.data.id);
    if (content === null) return null;
    const current = await readOrNull(filePath);
    if (current !== null) await saveVersion(filePath, current, scope.basePath);
    await writeDocAtomic(filePath, content);
    return content;
  });
  if (restored === null) return res.status(404).json({ error: 'Version no encontrada' });
  invalidateSearchIndex(scope.id);
  res.json({ ok: true, hash: contentHash(restored) });
}));

// Pull doc (raw content)
router.get('/pull', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readDocFile(filePath); }
  catch (err) {
    if (err instanceof NotFileError) return res.status(404).json({ error: 'Archivo no encontrado' });
    throw err;
  }
  res.json({ file, content, hash: contentHash(content) });
}));

// Delete doc or folder
router.delete('/delete', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  if (!assertWritable(scope, res)) return;
  const parsed = FileBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'file es requerido' });
  const { file } = parsed.data;
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  // stat instead of existsSync closes the TOCTOU window for the type check.
  const stats = await statOrNull(filePath);
  if (!stats) return res.status(404).json({ error: 'Archivo no encontrado' });
  if (stats.isDirectory()) {
    // getFiles returns names relative to the directory passed in — we need them
    // relative to scope.basePath so resolveDoc y deleteAllComments trabajen bien.
    const files = await getFiles(filePath, file);
    await Promise.all(files.map(async (f) => {
      const fPath = resolveDoc(f.name, scope.basePath);
      if (!fPath) return;
      try {
        const content = await readFile(fPath, 'utf-8');
        await saveVersion(fPath, content, scope.basePath);
      } catch (err) {
        if (!isEnoent(err)) throw err;
      }
      await deleteAllComments(scope.id, f.name);
    }));
    await rm(filePath, { recursive: true, force: true });
  } else {
    try {
      const content = await readFile(filePath, 'utf-8');
      await saveVersion(filePath, content, scope.basePath);
    } catch (err) {
      if (!isEnoent(err)) throw err;
    }
    await unlink(filePath).catch((err: unknown) => { if (!isEnoent(err)) throw err; });
    await deleteAllComments(scope.id, file);
  }
  await deleteOrigins(scope.id, file);
  invalidateSearchIndex(scope.id);
  res.json({ ok: true });
}));

// Project data (tree + initial page)
router.get('/project', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const folder = queryString(req.query['folder']);
  if (!folder) return res.status(400).json({ error: 'folder es requerido' });
  const folderPath = resolveDoc(folder, scope.basePath);
  if (!folderPath) return res.status(400).json({ error: 'Ruta invalida' });
  const stats = await statOrNull(folderPath);
  if (!stats || !stats.isDirectory()) return res.status(404).json({ error: 'Carpeta no encontrada' });

  const tree = await buildTree(folderPath, folder);
  const mainPage = findMainPage(tree, folder);
  if (!mainPage) return res.status(404).json({ error: 'No se encontraron documentos' });

  const activeFilePath = resolveDoc(mainPage, scope.basePath);
  if (!activeFilePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readDocFile(activeFilePath); }
  catch (err) {
    if (err instanceof NotFileError) return res.status(404).json({ error: 'Pagina no encontrada' });
    throw err;
  }
  const { kind, html } = renderDoc(mainPage, content);
  const allPages = flattenTree(tree);

  res.json({ tree, kind, html, currentFile: mainPage, allPages });
}));

// Render project page (for SPA navigation within project)
router.get('/project/render', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const folder = queryString(req.query['folder']);
  const page = queryString(req.query['page']);
  if (!folder || !page) return res.status(400).json({ error: 'folder y page son requeridos' });
  const filePath = resolveDoc(page, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  let content: string;
  try { content = await readDocFile(filePath); }
  catch (err) {
    if (err instanceof NotFileError) return res.status(404).json({ error: 'Pagina no encontrada' });
    throw err;
  }
  const { kind, html } = renderDoc(page, content);
  res.json({ kind, html, file: page });
}));

// Comments
router.get('/comments', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  const file = queryString(req.query['file']);
  if (!file) return res.status(400).json({ error: 'file es requerido' });
  const pg = parsePagination(req.query as Record<string, unknown>);
  const { data, total } = await getComments(scope.id, file, pg);
  res.json({ data, total, limit: pg.limit ?? total, offset: pg.offset ?? 0 });
}));

router.post('/comments', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  if (!scope.canComment) {
    return res.status(403).json({ error: 'No podes comentar en este scope' });
  }
  const parsed = CommentBody.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ error: first?.message ?? 'Body invalido' });
  }
  const { file, text, line } = parsed.data;
  if (!isWritableDocPath(file)) return res.status(400).json({ error: 'Ruta invalida' });
  const filePath = resolveDoc(file, scope.basePath);
  if (!filePath) return res.status(400).json({ error: 'Ruta invalida' });
  const stats = await statOrNull(filePath);
  if (!stats || !stats.isFile()) return res.status(404).json({ error: 'Archivo no encontrado' });
  const resolvedAuthor = req.user?.username ?? 'Anonimo';
  const authorId = req.user?.userId ?? null;
  const comment = await addComment(scope.id, file, {
    line: line ?? null,
    text,
    author: resolvedAuthor,
    authorId,
  });
  res.json({ ok: true, comment });
}));

// Publish: copia un doc del scope actual (me | team) al scope public.
// Solo admins pueden publicar (porque canWrite en public lo son solo ellos).
// Si existe un doc con el mismo path en public, responde 409 a menos que
// el caller mande `overwrite: true`.
router.post('/publish', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Solo admins pueden publicar docs' });
  }
  if (scope.kind === 'public') {
    return res.status(400).json({ error: 'El doc ya esta en Publicos' });
  }
  const parsed = PublishBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'file es requerido' });
  const { file, overwrite } = parsed.data;
  if (!isWritableDocPath(file)) return res.status(400).json({ error: 'Ruta invalida' });

  const srcPath = resolveDoc(file, scope.basePath);
  if (!srcPath) return res.status(400).json({ error: 'Ruta invalida' });
  const srcStats = await statOrNull(srcPath);
  if (!srcStats || !srcStats.isFile()) return res.status(404).json({ error: 'Archivo no encontrado' });

  const pub = publicScope(req.user.orgSlug!, req.user);
  const publicBase = pub.basePath;
  const destPath = resolveDoc(file, publicBase);
  if (!destPath) return res.status(400).json({ error: 'Ruta invalida' });

  const destStats = await statOrNull(destPath);
  if (destStats && destStats.isFile() && !overwrite) {
    return res.status(409).json({ error: 'Ya existe un doc publico con ese nombre', conflict: true });
  }

  const content = await readFile(srcPath, 'utf-8');
  await ensureDir(dirname(destPath));
  // Backup si se va a sobrescribir.
  if (destStats?.isFile()) {
    try {
      const old = await readFile(destPath, 'utf-8');
      await saveVersion(destPath, old, publicBase);
    } catch (err) {
      if (!isEnoent(err)) throw err;
    }
  }
  await writeFile(destPath, content);
  invalidateSearchIndex(pub.id);
  res.json({ ok: true, file });
}));

// Copy a doc or folder to another team of the user's organization (an independent copy).
router.post('/share', ah(async (req, res) => {
  const src = getScope(req, res);
  if (!src) return;
  const parsed = ShareBody.safeParse(req.body);
  if (!parsed.success || !isSafeRelPath(parsed.data.file)) return res.status(400).json({ error: 'file y to son requeridos' });
  const { file, to, overwrite } = parsed.data;
  const user = req.user!;
  if (src.id.split('/')[0] !== user.orgSlug) return res.status(403).json({ error: 'Solo se copia dentro de tu organizacion' });
  let dest: ResolvedScope;
  try {
    dest = resolveScope(`team:${to}`, user);
  } catch (err) {
    if (err instanceof ScopeError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
  if (!dest.canWrite) return res.status(403).json({ error: 'No podes escribir en ese equipo' });
  if (dest.id === src.id) return res.status(400).json({ error: 'El origen y el destino son el mismo equipo' });

  const fromSlug = src.kind === 'team' ? src.id.split('team:')[1] : null;
  const fromLabel = src.kind === 'me' ? `Documentos de ${user.username}`
    : src.kind === 'public' ? 'Publicos'
    : user.teams.find((t) => t.slug.toLowerCase() === fromSlug)?.name ?? fromSlug ?? 'otro equipo';
  const result = await copyDocs(src, file, dest, { overwrite: overwrite ?? false, fromLabel, byUserId: user.userId });
  if (result.status === 'not-found') return res.status(404).json({ error: 'No hay documentos para copiar' });
  if (result.status === 'conflict') {
    return res.status(409).json({ error: 'Ya existen documentos con ese nombre en el equipo', conflict: true, files: result.files });
  }
  invalidateSearchIndex(dest.id);
  res.json({ ok: true, files: result.files });
}));

router.post('/comments/delete', ah(async (req, res) => {
  const scope = getScope(req, res);
  if (!scope) return;
  if (!scope.canComment) {
    return res.status(403).json({ error: 'No podes borrar comentarios en este scope' });
  }
  const parsed = CommentDeleteBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'file y id son requeridos' });
  const { file, id } = parsed.data;
  const comment = await getComment(scope.id, file, id);
  if (!comment) return res.status(404).json({ error: 'Comentario no encontrado' });
  const isOwner = req.user?.userId != null && comment.authorId === req.user.userId;
  const isAdmin = req.user?.role === 'admin';
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'Solo podes borrar tus propios comentarios' });
  }
  await deleteComment(scope.id, file, id);
  res.json({ ok: true });
}));

export default router;
