import { readFile } from 'fs/promises';
import { join } from 'path';
import { getFiles } from './storage.js';
import { logger } from './logger.js';

export type SearchIndexEntry = {
  file: string;
  title: string;
  content: string;
  mtime: Date;
};

// Cache por scope.id: 'me:<userId>' | 'team:<slug>' | 'public'.
// Se invalida completa o por scope en cada mutacion del scope correspondiente.
const cache = new Map<string, SearchIndexEntry[]>();

/** Strip markdown syntax to get plain text for search */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')       // fenced code blocks
    .replace(/`[^`]+`/g, '')              // inline code
    .replace(/!\[.*?\]\(.*?\)/g, '')      // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
    .replace(/#{1,6}\s+/g, '')            // headings
    .replace(/[*_~]{1,3}/g, '')           // bold/italic/strike
    .replace(/>\s+/gm, '')               // blockquotes
    .replace(/[-*+]\s+/gm, '')           // unordered lists
    .replace(/\d+\.\s+/gm, '')           // ordered lists
    .replace(/\|.*\|/g, '')              // tables
    .replace(/---+/g, '')                // horizontal rules
    .replace(/\n{2,}/g, '\n')            // collapse blank lines
    .trim();
}

/** Extract first heading as title, fallback to filename */
function extractTitle(content: string, filename: string): string {
  const match = content.match(/^#\s+(.+)/m);
  const captured = match?.[1];
  return captured ? captured.trim() : filename.replace(/\.md$/, '');
}

/**
 * Invalida el cache. Si `scopeId` se provee, invalida solo ese scope; sin
 * argumentos invalida todo (util en tests).
 */
export function invalidateSearchIndex(scopeId?: string): void {
  if (scopeId) cache.delete(scopeId);
  else cache.clear();
}

/** Build and return the search index for a given scope (cached) */
export async function getSearchIndex(
  scopeId: string,
  basePath: string,
): Promise<SearchIndexEntry[]> {
  const cached = cache.get(scopeId);
  if (cached) return cached;

  const files = await getFiles(basePath);

  // Promise.allSettled: un archivo corrupto/eliminado no tira todo el indice abajo.
  const settled = await Promise.allSettled(
    files.map(async (f): Promise<SearchIndexEntry> => {
      const filePath = join(basePath, f.name);
      const content = await readFile(filePath, 'utf-8');
      const plain = stripMarkdown(content);
      return {
        file: f.name,
        title: extractTitle(content, f.name),
        content: plain.slice(0, 500),
        mtime: f.modified,
      };
    })
  );

  const entries: SearchIndexEntry[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      entries.push(result.value);
    } else {
      logger.warn('search-index', 'skip file', { reason: String(result.reason) });
    }
  }

  cache.set(scopeId, entries);
  return entries;
}
