import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import { readdirSync, statSync } from 'fs';

// Auto-discover islands: each folder in islands/ with an index.tsx becomes an entry
function discoverIslands(): Record<string, string> {
  const islandsDir = resolve(__dirname, 'islands');
  const entries: Record<string, string> = {};

  try {
    for (const name of readdirSync(islandsDir)) {
      const dir = resolve(islandsDir, name);
      if (statSync(dir).isDirectory()) {
        const entry = resolve(dir, 'index.tsx');
        try {
          statSync(entry);
          entries[name] = entry;
        } catch {
          // no index.tsx, skip
        }
      }
    }
  } catch {
    // islands dir doesn't exist yet
  }

  return entries;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(__dirname, '../public/js'),
    emptyDirBeforeWrite: false,
    rollupOptions: {
      input: discoverIslands(),
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '../css/[name][extname]',
        format: 'es',
      },
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'shared'),
      '@islands': resolve(__dirname, 'islands'),
    },
  },
});
