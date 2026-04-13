import { stat } from 'fs/promises';
import type { Stats } from 'fs';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrap an async route handler so rejected promises flow to the Express error
 * middleware instead of crashing the process or hanging the request.
 */
export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void | Response>;

export const ah = (fn: AsyncRouteHandler): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/** Narrow an unknown error to Node's ErrnoException shape. */
export function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

/** Returns true if the error is a Node ENOENT. */
export function isEnoent(err: unknown): boolean {
  return isErrnoException(err) && err.code === 'ENOENT';
}

/** Returns true if the error is ENOENT or EISDIR (file not found or is a directory). */
export function isNotFile(err: unknown): boolean {
  return isErrnoException(err) && (err.code === 'ENOENT' || err.code === 'EISDIR');
}

/** Treat ENOENT as "not found", rethrow anything else. */
export async function statOrNull(p: string): Promise<Stats | null> {
  try {
    return await stat(p);
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
}

/**
 * Extract a single non-empty string from a query param. Express parses
 * `?x=a&x=b` as an array and nested keys as objects, neither of which are
 * valid for our endpoints.
 */
export function queryString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Parse optional limit/offset query params for pagination.
 * Returns undefined values when not provided (caller uses defaults).
 */
export function parsePagination(query: Record<string, unknown>): { limit?: number; offset?: number } {
  const result: { limit?: number; offset?: number } = {};
  const rawLimit = queryString(query['limit']);
  const rawOffset = queryString(query['offset']);
  if (rawLimit) {
    const n = Number(rawLimit);
    if (Number.isInteger(n) && n >= 1 && n <= 200) result.limit = n;
  }
  if (rawOffset) {
    const n = Number(rawOffset);
    if (Number.isInteger(n) && n >= 0) result.offset = n;
  }
  return result;
}

/**
 * Read a file from disk, returning its contents. Throws a `NotFileError` with
 * a 404 status if the file doesn't exist or is a directory, so routes can
 * handle it uniformly instead of duplicating the try/catch + isNotFile pattern.
 */
export class NotFileError extends Error {
  constructor(message = 'Archivo no encontrado') {
    super(message);
  }
}

export async function readDocFile(filePath: string): Promise<string> {
  const { readFile } = await import('fs/promises');
  try {
    return await readFile(filePath, 'utf-8');
  } catch (err) {
    if (isNotFile(err)) throw new NotFileError();
    throw err;
  }
}
