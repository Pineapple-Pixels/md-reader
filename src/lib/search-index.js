import { readFile } from 'fs/promises';
import { join } from 'path';
import { PUB_DIR } from './config.js';
import { getFiles } from './storage.js';
import { getMeta } from './meta.js';

let cache = null;

/** Strip markdown syntax to get plain text for search */
function stripMarkdown(text) {
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
function extractTitle(content, filename) {
  const match = content.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : filename.replace(/\.md$/, '');
}

/** Invalidate the cached index — call after any doc mutation */
export function invalidateSearchIndex() {
  cache = null;
}

/** Build and return the search index (cached) */
export async function getSearchIndex() {
  if (cache) return cache;

  const files = await getFiles(PUB_DIR);
  const meta = await getMeta();

  cache = await Promise.all(
    files.map(async (f) => {
      const filePath = join(PUB_DIR, f.name);
      const content = await readFile(filePath, 'utf-8');
      const plain = stripMarkdown(content);
      return {
        file: f.name,
        title: extractTitle(content, f.name),
        content: plain.slice(0, 500),
        public: !!meta[f.name]?.public,
        mtime: f.modified,
      };
    })
  );

  return cache;
}
