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
