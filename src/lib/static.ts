import express from 'express';

/** Serves the Vite build: hashed assets cached for a year in production, HTML always revalidated. */
export function staticAssets(dir: string, production: boolean): express.RequestHandler {
  return express.static(dir, {
    maxAge: production ? '1y' : 0,
    immutable: production,
    // HTML is not content-hashed; caching it pins browsers to stale bundles after a deploy.
    setHeaders: (res, path) => {
      if (path.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  });
}
